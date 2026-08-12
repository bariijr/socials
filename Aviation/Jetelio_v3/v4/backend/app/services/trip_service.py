"""Trip Manager — authenticated CRUD over Trip/TripLeg. Computation reuses
the exact same engines as the public Feasibility IQ path
(app.services.leg_feasibility_service.compute_leg_feasibility +
app.services.leg_projection.project_leg_result); this layer only owns
persistence, RBAC-adjacent bookkeeping (audit log) and the live deadline
refresh — see get_trip.
"""

import copy
from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, NotFoundError, ValidationFailedError, VersionConflictError
from app.core.rule_engine import RULE_ENGINE_VERSION
from app.domain.permits import aggregate_trip_verdict, classify_deadline, compute_valid_until
from app.domain.reference_status import resolve_effective_permit_validity
from app.domain.trip_legs import LegOrderingCheck, validate_primary_leg_ordering
from app.models.aircraft import Aircraft
from app.models.airport import Airport
from app.models.client import Client
from app.models.country import Country
from app.models.operator import Operator
from app.models.service_catalogue import ServiceCatalogueEntry
from app.models.trip import ServiceAssignmentStatus, Trip, TripLeg, TripLegType, TripSource, TripStatus
from app.repositories.audit import write_audit_log
from app.schemas.feasibility import LegResultOut, PersonPublicIn
from app.schemas.trip import (
    AircraftLookupOut,
    ClientLookupOut,
    CustomServiceAssignmentIn,
    NavFeeLineItemOut,
    NavFeesDetailOut,
    PermitFeeLineItemOut,
    PermitFeesDetailOut,
    ServiceAssignmentIn,
    ServiceAssignmentOut,
    TripCreateIn,
    TripDetailOut,
    TripLegDetailOut,
    TripLegIn,
    TripOut,
    TripUpdateIn,
)
from app.services import leg_feasibility_service, settings_service
from app.services.credentials_engine_service import PersonInput
from app.services.leg_projection import project_leg_result
from app.services.nav_fee_service import NavFeesResult
from app.services.permit_fee_service import PermitFeesResult

_DEADLINE_KEYS = ("overflight_permits", "landing_permits", "ground_handling_orders")


def _refresh_snapshot_deadlines(snapshot: dict, now: datetime) -> dict:
    """The stored snapshot freezes the *outcome* (verdict, figures) at
    compute time per the reproducibility contract — but deadline_status is
    a ladder relative to now, not a fact about the past, so it's
    recomputed live from the stored file_by on every read.
    """
    refreshed = copy.deepcopy(snapshot)
    for key in _DEADLINE_KEYS:
        for item in refreshed.get("permits", {}).get(key, []):
            file_by = datetime.fromisoformat(item["deadline"]["file_by"])
            item["deadline"]["deadline_status"] = classify_deadline(file_by, now)
    return refreshed


def _next_deadline(legs: list[TripLeg], now: datetime) -> datetime | None:
    file_bys: list[datetime] = []
    for leg in legs:
        for key in _DEADLINE_KEYS:
            for item in leg.computed_snapshot.get("permits", {}).get(key, []):
                file_bys.append(datetime.fromisoformat(item["deadline"]["file_by"]))
    return min(file_bys) if file_bys else None


def _service_assignments_out(leg: TripLeg) -> list[ServiceAssignmentOut]:
    out = []
    auto_generated_keys: set[str] = set()
    for item in leg.computed_snapshot.get("permits", {}).get("service_requirements", []):
        key = f"{item['service_code']}:{item['icao']}"
        auto_generated_keys.add(key)
        assignment = leg.service_assignments.get(key, {})
        out.append(
            ServiceAssignmentOut(
                service_code=item["service_code"],
                icao=item["icao"],
                service_name=item.get("service_name"),
                # Unassigned defaults to JETELIO for display — every
                # service line item is JTL-requested until explicitly
                # reassigned to OWN/THIRD_PARTY, never stored, purely how
                # an un-touched assignment reads.
                provider=assignment.get("provider", "JETELIO"),
                vendor_id=assignment.get("vendor_id"),
                notes=assignment.get("notes"),
                status=assignment.get("status", ServiceAssignmentStatus.PENDING.value),
                confirmation_number=assignment.get("confirmation_number"),
                granted_at=assignment.get("granted_at"),
                valid_until=assignment.get("valid_until"),
                manual=False,
            )
        )

    # Manually-added extras (task #105 — "choose to add more sub-services")
    # never appear in service_requirements (that list is purely
    # engine-generated), so they're only found by scanning
    # service_assignments itself for keys the loop above didn't already
    # cover, filtered to ones actually flagged manual=True.
    for key, assignment in leg.service_assignments.items():
        if key in auto_generated_keys or not assignment.get("manual"):
            continue
        service_code, _, icao = key.partition(":")
        out.append(
            ServiceAssignmentOut(
                service_code=service_code,
                icao=icao,
                service_name=assignment.get("service_name"),
                provider=assignment.get("provider", "JETELIO"),
                vendor_id=assignment.get("vendor_id"),
                notes=assignment.get("notes"),
                status=assignment.get("status", ServiceAssignmentStatus.PENDING.value),
                confirmation_number=assignment.get("confirmation_number"),
                granted_at=assignment.get("granted_at"),
                valid_until=assignment.get("valid_until"),
                manual=True,
            )
        )
    return out


async def _compute_service_valid_until(session: AsyncSession, icao: str, granted_at: datetime) -> datetime | None:
    """Forward mirror of the file_by/lead-time computation (§5.9's
    resolve_service_delivery, task #95's compute_valid_until) — resolves
    the icao's country, applies the same verified-or-fallback pattern as
    every other reference-data lookup in this system, and returns None
    (never a guessed date) only when the airport/country can't be
    resolved at all.
    """
    airport = await session.get(Airport, icao)
    if airport is None or airport.country_iso3 is None:
        return None
    country = await session.get(Country, airport.country_iso3)
    if country is None:
        return None
    settings_map = await settings_service.get_typed_settings_map(session)
    effective = resolve_effective_permit_validity(
        country.permit_validity_amount,
        country.permit_validity_unit.value if country.permit_validity_unit else None,
        settings_map["default_permit_validity_amount"],
        settings_map["default_permit_validity_unit"],
    )
    return compute_valid_until(granted_at, effective.amount, effective.unit)


async def _get_trip_or_404(session: AsyncSession, trip_id: UUID) -> Trip:
    trip = await session.get(Trip, trip_id)
    if trip is None or trip.deleted_at is not None:
        raise NotFoundError("Trip", trip_id)
    return trip


async def _get_legs(session: AsyncSession, trip_id: UUID) -> list[TripLeg]:
    rows = (
        await session.execute(
            select(TripLeg)
            .where(TripLeg.trip_id == trip_id, TripLeg.deleted_at.is_(None))
            .order_by(TripLeg.leg_index)
        )
    ).scalars().all()
    return list(rows)


def _nav_fees_detail_out(nav_fees: NavFeesResult) -> NavFeesDetailOut | None:
    if not nav_fees.mtow_known:
        return None
    return NavFeesDetailOut(
        fully_priced=nav_fees.fully_priced,
        items=[
            NavFeeLineItemOut(
                fir_code=i.fir_code,
                fir_name=i.fir_name,
                provider_name=i.provider_name,
                formula=i.formula,
                distance_nm=i.distance_nm,
                chargeable_distance_nm=i.chargeable_distance_nm,
                fee_usd=i.fee_usd,
                status=i.status,
                currency=i.currency,
            )
            for i in nav_fees.items
        ],
        subtotal_usd=nav_fees.subtotal_usd,
        margin_percent=nav_fees.margin_percent,
        margin_usd=nav_fees.margin_usd,
        total_usd=nav_fees.total_usd,
    )


def _permit_fees_detail_out(permit_fees: PermitFeesResult) -> PermitFeesDetailOut | None:
    if not permit_fees.mtow_known:
        return None
    return PermitFeesDetailOut(
        fully_priced=permit_fees.fully_priced,
        items=[
            PermitFeeLineItemOut(
                country_iso3=i.country_iso3,
                country_name=i.country_name,
                permit_type=i.permit_type,
                caa_fee_usd=i.caa_fee_usd,
                caa_status=i.caa_status,
                nafisat_fee_usd=i.nafisat_fee_usd,
                nafisat_status=i.nafisat_status,
                jtl_fee_usd=i.jtl_fee_usd,
                line_total_usd=i.line_total_usd,
            )
            for i in permit_fees.items
        ],
        caa_subtotal_usd=permit_fees.caa_subtotal_usd,
        nafisat_subtotal_usd=permit_fees.nafisat_subtotal_usd,
        jtl_subtotal_usd=permit_fees.jtl_subtotal_usd,
        total_usd=permit_fees.total_usd,
    )


def _leg_out(leg: TripLeg, now: datetime, clients_by_id: dict[UUID, Client]) -> TripLegDetailOut:
    refreshed = _refresh_snapshot_deadlines(leg.computed_snapshot, now)
    # computed_snapshot freezes the LegResultOut shape as of whenever this
    # leg was last (re)computed — by design, for exact historical
    # reproducibility (see RULE_ENGINE_VERSION). But that means any field
    # added to LegResultOut after a leg's snapshot was taken is simply
    # absent from the stored dict, and a strict model_validate would 500 on
    # every read of that leg forever after, not just fail to reproduce it.
    # reference_datetime/arrival_datetime are always available on the TripLeg
    # row itself (real columns, independent of the snapshot) — backfill them
    # from there rather than fabricate anything. Fields with no row
    # equivalent (reasons, permit_fees) are Optional with safe defaults on
    # LegResultOut itself instead.
    refreshed.setdefault("reference_datetime", leg.reference_datetime.isoformat())
    refreshed.setdefault("arrival_datetime", leg.arrival_datetime.isoformat())
    nav_fees_detail_raw = refreshed.get("nav_fees_detail")
    permit_fees_detail_raw = refreshed.get("permit_fees_detail")
    client = clients_by_id.get(leg.client_id) if leg.client_id else None
    return TripLegDetailOut(
        id=str(leg.id),
        leg_index=leg.leg_index,
        reference_datetime=leg.reference_datetime,
        arrival_datetime=leg.arrival_datetime,
        call_sign=leg.call_sign,
        registration=leg.registration,
        aircraft_icao_type=leg.aircraft_icao_type,
        leg_type=leg.leg_type.value,
        leg_status=leg.leg_status.value,
        client=ClientLookupOut(id=str(client.id), source_ref=client.source_ref, bill_to_legal_name=client.bill_to_legal_name)
        if client
        else None,
        updated_by=str(leg.updated_by) if leg.updated_by else None,
        result=LegResultOut.model_validate(refreshed),
        nav_fees=NavFeesDetailOut.model_validate(nav_fees_detail_raw) if nav_fees_detail_raw else None,
        permit_fees=PermitFeesDetailOut.model_validate(permit_fees_detail_raw) if permit_fees_detail_raw else None,
        service_assignments=_service_assignments_out(leg),
    )


def _trip_out(trip: Trip, legs: list[TripLeg]) -> TripOut:
    return TripOut(
        id=str(trip.id),
        status=trip.status.value,
        source=trip.source.value,
        aircraft_registration=trip.aircraft_registration,
        operator_airline_name=trip.operator_airline_name,
        ops_type=trip.ops_type.value if trip.ops_type else None,
        flight_purpose=trip.flight_purpose.value if trip.flight_purpose else None,
        requested_by_name=trip.requested_by_name,
        requested_by_email=trip.requested_by_email,
        owner_team=trip.owner_team,
        created_at=trip.created_at,
        start_date=legs[0].reference_datetime if legs else None,
        end_date=legs[-1].arrival_datetime if legs else None,
        leg_count=len(legs),
        overall_verdict=aggregate_trip_verdict([leg.verdict for leg in legs]) if legs else "FEASIBLE",
        version=trip.version,
    )


async def list_trips(
    session: AsyncSession, *, page: int = 1, page_size: int = 50, status: TripStatus | None = None
) -> tuple[list[TripOut], int]:
    stmt = select(Trip).where(Trip.deleted_at.is_(None))
    if status is not None:
        stmt = stmt.where(Trip.status == status)
    stmt = stmt.order_by(Trip.created_at.desc())

    all_trips = (await session.execute(stmt)).scalars().all()
    total = len(all_trips)
    page_trips = all_trips[(page - 1) * page_size : (page - 1) * page_size + page_size]

    out = []
    for trip in page_trips:
        legs = await _get_legs(session, trip.id)
        out.append(_trip_out(trip, legs))
    return out, total


async def _fetch_clients(session: AsyncSession, client_ids: set[UUID]) -> dict[UUID, Client]:
    if not client_ids:
        return {}
    rows = (await session.execute(select(Client).where(Client.id.in_(client_ids)))).scalars().all()
    return {c.id: c for c in rows}


async def lookup_aircraft_by_registration(session: AsyncSession, registration: str) -> AircraftLookupOut | None:
    """Admin-only autofill — see app.schemas.trip.AircraftLookupOut."""
    aircraft = (
        await session.execute(select(Aircraft).where(Aircraft.registration == registration.strip().upper()))
    ).scalar_one_or_none()
    if aircraft is None:
        return None

    operator = await session.get(Operator, aircraft.operator_id)
    clients = (
        await session.execute(
            select(Client).where(Client.operator_id == aircraft.operator_id, Client.deleted_at.is_(None))
        )
    ).scalars().all()

    return AircraftLookupOut(
        registration=aircraft.registration,
        icao_type=aircraft.icao_type,
        mtow_kg=aircraft.mtow_kg,
        operator_id=str(aircraft.operator_id),
        operator_name=operator.name if operator else None,
        clients=[
            ClientLookupOut(id=str(c.id), source_ref=c.source_ref, bill_to_legal_name=c.bill_to_legal_name)
            for c in clients
        ],
    )


async def get_trip(session: AsyncSession, trip_id: UUID) -> TripDetailOut:
    trip = await _get_trip_or_404(session, trip_id)
    legs = await _get_legs(session, trip_id)
    now = datetime.now(timezone.utc)
    clients_by_id = await _fetch_clients(session, {leg.client_id for leg in legs if leg.client_id})

    return TripDetailOut(
        id=str(trip.id),
        status=trip.status.value,
        source=trip.source.value,
        aircraft_registration=trip.aircraft_registration,
        entered_mtow_kg=trip.entered_mtow_kg,
        serial_number=trip.serial_number,
        colors=trip.colors,
        operator_airline_name=trip.operator_airline_name,
        ops_type=trip.ops_type.value if trip.ops_type else None,
        flight_purpose=trip.flight_purpose.value if trip.flight_purpose else None,
        requested_by_name=trip.requested_by_name,
        requested_by_email=trip.requested_by_email,
        requested_by_phone=trip.requested_by_phone,
        notes=trip.notes,
        owner_team=trip.owner_team,
        created_at=trip.created_at,
        version=trip.version,
        overall_verdict=aggregate_trip_verdict([leg.verdict for leg in legs]) if legs else "FEASIBLE",
        next_deadline=_next_deadline(legs, now),
        created_by=str(trip.created_by) if trip.created_by else None,
        updated_by=str(trip.updated_by) if trip.updated_by else None,
        legs=[_leg_out(leg, now, clients_by_id) for leg in legs],
    )


async def _compute_and_build_leg(
    session: AsyncSession,
    *,
    trip_id: UUID,
    leg_index: int,
    aircraft_icao_type: str,
    persons: list[PersonPublicIn],
    leg_in: TripLegIn,
    actor_id: UUID | None = None,
) -> TripLeg:
    person_inputs = [
        PersonInput(person_id=f"p{i}", role=p.role, nationality_iso3=p.nationality_iso3, passport_expiry=None)
        for i, p in enumerate(persons)
    ]
    result = await leg_feasibility_service.compute_leg_feasibility(
        session,
        leg_index=leg_index,
        dep_icao=leg_in.dep_icao.upper(),
        arr_icao=leg_in.arr_icao.upper(),
        aircraft_icao_type=aircraft_icao_type,
        persons=person_inputs,
        reference_datetime=leg_in.reference_datetime,
        required_arrival_datetime=leg_in.required_arrival_datetime,
        filed_route=leg_in.filed_route,
        avoid_states=set(leg_in.avoid_states),
        include_states=set(leg_in.include_states),
        avoid_firs=set(leg_in.avoid_firs),
        include_firs=set(leg_in.include_firs),
    )
    leg_out = await project_leg_result(
        session, leg_in.dep_icao.upper(), leg_in.arr_icao.upper(), persons, result, call_sign=leg_in.call_sign
    )
    nav_fees_detail = _nav_fees_detail_out(result.nav_fees)
    permit_fees_detail = _permit_fees_detail_out(result.permit_fees)

    snapshot = leg_out.model_dump(mode="json")
    snapshot["nav_fees_detail"] = nav_fees_detail.model_dump(mode="json") if nav_fees_detail else None
    snapshot["permit_fees_detail"] = permit_fees_detail.model_dump(mode="json") if permit_fees_detail else None

    # The engine-computed arrival is always what permits/deadlines key off;
    # arrival_datetime_override only changes what's DISPLAYED (e.g. crew
    # padding preference), never fed back into that computation.
    computed_arrival = result.reference_datetime + timedelta(hours=result.eet_hours)
    arrival_datetime = leg_in.arrival_datetime_override or computed_arrival

    return TripLeg(
        trip_id=trip_id,
        leg_index=leg_index,
        dep_icao=leg_in.dep_icao.upper(),
        arr_icao=leg_in.arr_icao.upper(),
        aircraft_icao_type=aircraft_icao_type,
        # The resolved instant — result.reference_datetime is always
        # populated even when leg_in drove off required_arrival_datetime.
        reference_datetime=result.reference_datetime,
        arrival_datetime=arrival_datetime,
        call_sign=leg_in.call_sign,
        registration=leg_in.registration,
        leg_type=leg_in.leg_type,
        leg_status=leg_in.leg_status,
        client_id=UUID(leg_in.client_id) if leg_in.client_id else None,
        updated_by=actor_id,
        filed_route=leg_in.filed_route,
        persons=[{"role": p.role, "nationality_iso3": p.nationality_iso3} for p in persons],
        constraints={
            "avoid_states": leg_in.avoid_states,
            "include_states": leg_in.include_states,
            "avoid_firs": leg_in.avoid_firs,
            "include_firs": leg_in.include_firs,
        },
        verdict=leg_out.verdict,
        rule_engine_version=RULE_ENGINE_VERSION,
        computed_snapshot=snapshot,
    )


async def create_trip(session: AsyncSession, payload: TripCreateIn, *, actor_id: UUID, actor_email: str) -> Trip:
    trip = Trip(
        status=TripStatus.LEAD,
        source=TripSource.INTERNAL,
        aircraft_registration=payload.aircraft_registration,
        entered_mtow_kg=payload.entered_mtow_kg,
        serial_number=payload.serial_number,
        colors=payload.colors,
        operator_airline_name=payload.operator_airline_name,
        ops_type=payload.ops_type,
        flight_purpose=payload.flight_purpose,
        requested_by_name=payload.requested_by_name,
        requested_by_email=payload.requested_by_email,
        requested_by_phone=payload.requested_by_phone,
        notes=payload.notes,
        owner_team=payload.owner_team,
        created_by=actor_id,
        updated_by=actor_id,
    )
    session.add(trip)
    await session.flush()

    built_legs = [
        await _compute_and_build_leg(
            session,
            trip_id=trip.id,
            leg_index=leg_index,
            aircraft_icao_type=payload.aircraft_icao_type.upper(),
            persons=payload.persons,
            leg_in=leg_in,
            actor_id=actor_id,
        )
        for leg_index, leg_in in enumerate(payload.legs)
    ]
    ordering_violations = validate_primary_leg_ordering(
        [
            LegOrderingCheck(
                leg_index=leg.leg_index,
                departure=leg.reference_datetime,
                arrival=leg.arrival_datetime,
                is_primary=leg.leg_type == TripLegType.PRIMARY,
            )
            for leg in built_legs
        ]
    )
    if ordering_violations:
        raise ValidationFailedError("legs", "; ".join(ordering_violations))

    for leg in built_legs:
        session.add(leg)
    await session.flush()

    await write_audit_log(
        session,
        actor_user_id=actor_id,
        actor_email=actor_email,
        action="CREATE",
        entity_type="Trip",
        entity_id=str(trip.id),
        to_value={"leg_count": len(payload.legs), "source": "INTERNAL"},
    )
    return trip


async def add_leg(
    session: AsyncSession, trip_id: UUID, leg_in: TripLegIn, *, actor_id: UUID, actor_email: str
) -> TripLeg:
    trip = await _get_trip_or_404(session, trip_id)
    existing_legs = await _get_legs(session, trip_id)
    if not existing_legs:
        raise NotFoundError("TripLeg", "any (trip has no legs to infer aircraft/persons from)")

    template = existing_legs[0]
    next_index = max(leg.leg_index for leg in existing_legs) + 1
    persons = [PersonPublicIn(**p) for p in template.persons]

    leg = await _compute_and_build_leg(
        session,
        trip_id=trip.id,
        leg_index=next_index,
        aircraft_icao_type=template.aircraft_icao_type,
        persons=persons,
        leg_in=leg_in,
        actor_id=actor_id,
    )
    session.add(leg)
    await session.flush()

    await write_audit_log(
        session,
        actor_user_id=actor_id,
        actor_email=actor_email,
        action="CREATE",
        entity_type="TripLeg",
        entity_id=str(leg.id),
        to_value={"trip_id": str(trip_id), "leg_index": next_index},
    )
    return leg


async def update_leg(
    session: AsyncSession, trip_id: UUID, leg_id: UUID, leg_in: TripLegIn, *, actor_id: UUID, actor_email: str
) -> TripLeg:
    await _get_trip_or_404(session, trip_id)
    existing = await session.get(TripLeg, leg_id)
    if existing is None or existing.trip_id != trip_id or existing.deleted_at is not None:
        raise NotFoundError("TripLeg", leg_id)

    persons = [PersonPublicIn(**p) for p in existing.persons]
    recomputed = await _compute_and_build_leg(
        session,
        trip_id=trip_id,
        leg_index=existing.leg_index,
        aircraft_icao_type=existing.aircraft_icao_type,
        persons=persons,
        leg_in=leg_in,
        actor_id=actor_id,
    )

    before = {"dep_icao": existing.dep_icao, "arr_icao": existing.arr_icao, "verdict": existing.verdict}
    for field in (
        "dep_icao", "arr_icao", "reference_datetime", "arrival_datetime", "call_sign", "registration",
        "leg_type", "leg_status", "client_id", "updated_by", "filed_route",
        "constraints", "verdict", "rule_engine_version", "computed_snapshot",
    ):
        setattr(existing, field, getattr(recomputed, field))
    existing.version += 1
    await session.flush()

    await write_audit_log(
        session,
        actor_user_id=actor_id,
        actor_email=actor_email,
        action="UPDATE",
        entity_type="TripLeg",
        entity_id=str(existing.id),
        from_value=before,
        to_value={"dep_icao": existing.dep_icao, "arr_icao": existing.arr_icao, "verdict": existing.verdict},
    )
    return existing


async def remove_leg(session: AsyncSession, trip_id: UUID, leg_id: UUID, *, actor_id: UUID, actor_email: str) -> None:
    existing = await session.get(TripLeg, leg_id)
    if existing is None or existing.trip_id != trip_id or existing.deleted_at is not None:
        raise NotFoundError("TripLeg", leg_id)
    existing.deleted_at = datetime.now(timezone.utc)
    existing.version += 1
    await session.flush()

    await write_audit_log(
        session,
        actor_user_id=actor_id,
        actor_email=actor_email,
        action="DELETE",
        entity_type="TripLeg",
        entity_id=str(existing.id),
        from_value={"dep_icao": existing.dep_icao, "arr_icao": existing.arr_icao},
    )


async def update_trip(
    session: AsyncSession, trip_id: UUID, payload: TripUpdateIn, *, actor_id: UUID, actor_email: str
) -> Trip:
    trip = await _get_trip_or_404(session, trip_id)
    if trip.version != payload.version:
        raise VersionConflictError("Trip", trip_id, payload.version, trip.version)

    before = {"status": trip.status.value, "notes": trip.notes}
    if payload.status is not None:
        trip.status = payload.status
    if payload.notes is not None:
        trip.notes = payload.notes
    if payload.requested_by_name is not None:
        trip.requested_by_name = payload.requested_by_name
    if payload.requested_by_email is not None:
        trip.requested_by_email = payload.requested_by_email
    if payload.requested_by_phone is not None:
        trip.requested_by_phone = payload.requested_by_phone
    if payload.aircraft_registration is not None:
        trip.aircraft_registration = payload.aircraft_registration
    if payload.entered_mtow_kg is not None:
        trip.entered_mtow_kg = payload.entered_mtow_kg
    if payload.operator_airline_name is not None:
        trip.operator_airline_name = payload.operator_airline_name
    if payload.serial_number is not None:
        trip.serial_number = payload.serial_number
    if payload.colors is not None:
        trip.colors = payload.colors
    if payload.ops_type is not None:
        trip.ops_type = payload.ops_type
    if payload.flight_purpose is not None:
        trip.flight_purpose = payload.flight_purpose
    if payload.owner_team is not None:
        trip.owner_team = payload.owner_team
    trip.updated_by = actor_id
    trip.version += 1
    await session.flush()

    await write_audit_log(
        session,
        actor_user_id=actor_id,
        actor_email=actor_email,
        action="UPDATE",
        entity_type="Trip",
        entity_id=str(trip.id),
        from_value=before,
        to_value={"status": trip.status.value, "notes": trip.notes},
    )
    return trip


async def update_service_assignment(
    session: AsyncSession,
    trip_id: UUID,
    leg_id: UUID,
    service_code: str,
    icao: str,
    payload: ServiceAssignmentIn,
    *,
    actor_id: UUID,
    actor_email: str,
) -> TripLeg:
    existing = await session.get(TripLeg, leg_id)
    if existing is None or existing.trip_id != trip_id or existing.deleted_at is not None:
        raise NotFoundError("TripLeg", leg_id)

    key = f"{service_code}:{icao}"
    assignments = dict(existing.service_assignments)
    prior = assignments.get(key, {})

    # granted_at is set exactly once, the moment status first transitions
    # to CONFIRMED — re-saving an already-CONFIRMED assignment (e.g. to
    # edit notes) must not silently reset the original grant instant, and
    # valid_until is computed from that same original instant, not
    # recomputed on every subsequent edit.
    granted_at_raw = prior.get("granted_at")
    granted_at = datetime.fromisoformat(granted_at_raw) if granted_at_raw else None
    valid_until = prior.get("valid_until")
    if payload.status == ServiceAssignmentStatus.CONFIRMED and granted_at is None:
        granted_at = datetime.now(timezone.utc)
        computed_valid_until = await _compute_service_valid_until(session, icao, granted_at)
        valid_until = computed_valid_until.isoformat() if computed_valid_until else None

    assignments[key] = {
        "provider": payload.provider,
        "vendor_id": payload.vendor_id,
        "notes": payload.notes,
        "status": payload.status.value,
        "confirmation_number": payload.confirmation_number,
        "granted_at": granted_at.isoformat() if granted_at else None,
        "valid_until": valid_until,
        # Carried forward from whatever was already stored — this endpoint
        # fully replaces the assignment dict, so a manually-added line
        # item (task #105) editing e.g. its provider must not lose the
        # manual=True flag that keeps it showing up in
        # _service_assignments_out (it isn't in service_requirements, so
        # without this it would just silently disappear on next read).
        "manual": prior.get("manual", False),
        "service_name": prior.get("service_name"),
    }
    existing.service_assignments = assignments
    existing.updated_by = actor_id
    existing.version += 1
    await session.flush()

    await write_audit_log(
        session,
        actor_user_id=actor_id,
        actor_email=actor_email,
        action="UPDATE",
        entity_type="TripLegServiceAssignment",
        entity_id=f"{existing.id}:{key}",
        to_value=assignments[key],
    )
    return existing


async def add_custom_service_assignment(
    session: AsyncSession,
    trip_id: UUID,
    leg_id: UUID,
    payload: CustomServiceAssignmentIn,
    *,
    actor_id: UUID,
    actor_email: str,
) -> TripLeg:
    """Task #105 — "one may choose to add more sub-services" beyond what
    the engine auto-generated from service_requirements (e.g. a
    ground-handling sub-service like crew/pax transport or GPU, or any
    other catalogue entry relevant to this stop)."""
    existing = await session.get(TripLeg, leg_id)
    if existing is None or existing.trip_id != trip_id or existing.deleted_at is not None:
        raise NotFoundError("TripLeg", leg_id)

    service_code = payload.service_code.upper()
    catalogue_entry = (
        await session.execute(select(ServiceCatalogueEntry).where(ServiceCatalogueEntry.code == service_code))
    ).scalar_one_or_none()
    if catalogue_entry is None:
        raise ValidationFailedError("service_code", f"{service_code!r} is not a known service catalogue code.")

    icao = payload.icao.upper()
    if icao not in {existing.dep_icao, existing.arr_icao}:
        raise ValidationFailedError("icao", f"{icao!r} is neither this leg's departure nor arrival airport.")

    key = f"{service_code}:{icao}"
    auto_generated_keys = {
        f"{item['service_code']}:{item['icao']}"
        for item in existing.computed_snapshot.get("permits", {}).get("service_requirements", [])
    }
    if key in auto_generated_keys or key in existing.service_assignments:
        raise ConflictError(f"{service_code} at {icao} is already on this leg.")

    assignments = dict(existing.service_assignments)
    assignments[key] = {
        "provider": None,
        "vendor_id": None,
        "notes": None,
        "status": ServiceAssignmentStatus.PENDING.value,
        "confirmation_number": None,
        "granted_at": None,
        "valid_until": None,
        "manual": True,
        "service_name": catalogue_entry.name,
    }
    existing.service_assignments = assignments
    existing.updated_by = actor_id
    existing.version += 1
    await session.flush()

    await write_audit_log(
        session,
        actor_user_id=actor_id,
        actor_email=actor_email,
        action="CREATE",
        entity_type="TripLegServiceAssignment",
        entity_id=f"{existing.id}:{key}",
        to_value=assignments[key],
        reason="manually added",
    )
    return existing


async def remove_custom_service_assignment(
    session: AsyncSession, trip_id: UUID, leg_id: UUID, service_code: str, icao: str, *, actor_id: UUID, actor_email: str
) -> TripLeg:
    existing = await session.get(TripLeg, leg_id)
    if existing is None or existing.trip_id != trip_id or existing.deleted_at is not None:
        raise NotFoundError("TripLeg", leg_id)

    key = f"{service_code}:{icao}"
    assignment = existing.service_assignments.get(key)
    if assignment is None or not assignment.get("manual"):
        raise NotFoundError("TripLegServiceAssignment", key)

    assignments = dict(existing.service_assignments)
    del assignments[key]
    existing.service_assignments = assignments
    existing.updated_by = actor_id
    existing.version += 1
    await session.flush()

    await write_audit_log(
        session,
        actor_user_id=actor_id,
        actor_email=actor_email,
        action="DELETE",
        entity_type="TripLegServiceAssignment",
        entity_id=f"{existing.id}:{key}",
        from_value=assignment,
    )
    return existing
