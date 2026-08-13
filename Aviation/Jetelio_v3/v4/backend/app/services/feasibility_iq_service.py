"""Public Feasibility IQ — the service behind the unauthenticated router.
Reuses app.services.leg_feasibility_service.compute_leg_feasibility once per
leg exactly as built for the internal engines (its PersonInput.passport_expiry
is already Optional, so public callers just pass None); the leg-by-leg
result is projected to the public shape by app.services.leg_projection
(shared with the authenticated Trip Manager path). This layer aggregates
the per-leg verdicts into one trip verdict and owns the check_id cache.
"""

import json
import secrets
from datetime import datetime

from sqlalchemy import case, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFoundError
from app.core.redis_client import get_redis
from app.core.rule_engine import RULE_ENGINE_VERSION
from app.domain.permits import aggregate_trip_verdict
from app.models.aircraft import AircraftPerformance
from app.models.airport import Airport
from app.models.country import Country
from app.models.geometry import FirBoundary
from app.models.trip import Trip, TripLeg, TripSource, TripStatus
from app.schemas.feasibility import (
    AircraftTypeLookupOut,
    AirportLookupOut,
    CountryLookupOut,
    FeasibilityCheckOut,
    FirLookupOut,
    LegCheckIn,
    LegResultOut,
    PersonPublicIn,
)
from app.services import leg_feasibility_service, settings_service
from app.services.credentials_engine_service import PersonInput
from app.services.leg_projection import project_leg_result

CHECK_CACHE_PREFIX = "feasibility:check:"
LOOKUP_LIMIT = 20


async def search_airports(session: AsyncSession, q: str) -> list[AirportLookupOut]:
    """Ranked ICAO -> IATA -> city -> other (name substring), per task #90
    — a dispatcher typing a query expects the exact code they know first,
    not an alphabetically-nearby airport name. `prefix_pattern` drives the
    ranking; `contains_pattern` is what actually gets matched (a substring
    match anywhere still surfaces, just ranked behind prefix matches).
    """
    prefix_pattern = f"{q}%"
    contains_pattern = f"%{q}%"
    rank = case(
        (Airport.icao.ilike(prefix_pattern), 0),
        (Airport.iata.ilike(prefix_pattern), 1),
        (Airport.city.ilike(prefix_pattern), 2),
        else_=3,
    )
    rows = (
        await session.execute(
            select(Airport, Country.name)
            .outerjoin(Country, Airport.country_iso3 == Country.iso3)
            .where(
                Airport.deleted_at.is_(None),
                or_(
                    Airport.icao.ilike(contains_pattern),
                    Airport.iata.ilike(contains_pattern),
                    Airport.city.ilike(contains_pattern),
                    Airport.name.ilike(contains_pattern),
                ),
            )
            .order_by(rank, Airport.name)
            .limit(LOOKUP_LIMIT)
        )
    ).all()
    return [
        AirportLookupOut(icao=a.icao, iata=a.iata, name=a.name, city=a.city, country_name=country_name)
        for a, country_name in rows
    ]


async def search_aircraft_types(session: AsyncSession, q: str) -> list[AircraftTypeLookupOut]:
    pattern = f"%{q}%"
    rows = (
        await session.execute(
            select(AircraftPerformance)
            .where(
                or_(
                    AircraftPerformance.icao_type.ilike(pattern),
                    AircraftPerformance.manufacturer.ilike(pattern),
                    AircraftPerformance.model_series.ilike(pattern),
                )
            )
            .order_by(AircraftPerformance.icao_type)
            .limit(LOOKUP_LIMIT)
        )
    ).scalars().all()
    return [
        AircraftTypeLookupOut(icao_type=r.icao_type, manufacturer=r.manufacturer, model_series=r.model_series)
        for r in rows
    ]


async def search_countries(session: AsyncSession, q: str) -> list[CountryLookupOut]:
    pattern = f"%{q}%"
    rows = (
        await session.execute(
            select(Country)
            .where(Country.deleted_at.is_(None), or_(Country.iso3.ilike(pattern), Country.name.ilike(pattern)))
            .order_by(Country.name)
            .limit(LOOKUP_LIMIT)
        )
    ).scalars().all()
    return [CountryLookupOut(iso3=r.iso3, name=r.name) for r in rows]


async def search_firs(session: AsyncSession, q: str) -> list[FirLookupOut]:
    pattern = f"%{q}%"
    rows = (
        await session.execute(
            select(FirBoundary)
            .where(or_(FirBoundary.icao_fir_code.ilike(pattern), FirBoundary.name.ilike(pattern)))
            .order_by(FirBoundary.name)
            .limit(LOOKUP_LIMIT)
        )
    ).scalars().all()
    return [FirLookupOut(icao_fir_code=r.icao_fir_code, name=r.name) for r in rows]


async def check_trip_feasibility(
    session: AsyncSession,
    *,
    aircraft_icao_type: str,
    aircraft_registration: str | None = None,
    entered_mtow_kg: float | None = None,
    operator_airline_name: str | None = None,
    persons: list[PersonPublicIn],
    legs: list[LegCheckIn],
) -> FeasibilityCheckOut:
    person_inputs = [
        PersonInput(person_id=f"p{i}", role=p.role, nationality_iso3=p.nationality_iso3, passport_expiry=None)
        for i, p in enumerate(persons)
    ]

    # leg_outs stays the pristine engine output — this is what gets frozen
    # into the cache's "snapshot" below (and, on request-quote, into
    # TripLeg.computed_snapshot), so it must never reflect
    # arrival_datetime_override (task #116) any more than
    # trip_service.add_leg's admin-path snapshot does — same
    # reproducibility contract as everywhere else in this system.
    # response_legs is what actually goes back to the caller, with the
    # override applied to arrival_datetime only (a display value, same as
    # the admin Trip Manager's top-level TripLegDetailOut.arrival_datetime,
    # which already reads from the override-aware TripLeg.arrival_datetime
    # column rather than the nested, always-computed result.arrival_datetime).
    leg_outs: list[LegResultOut] = []
    response_legs: list[LegResultOut] = []
    for leg_index, leg_in in enumerate(legs):
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
        leg_outs.append(leg_out)
        response_legs.append(
            leg_out.model_copy(update={"arrival_datetime": leg_in.arrival_datetime_override})
            if leg_in.arrival_datetime_override
            else leg_out
        )

    overall_verdict = aggregate_trip_verdict([leg.verdict for leg in leg_outs])

    check_id = secrets.token_urlsafe(16)
    settings_map = await settings_service.get_typed_settings_map(session)
    cache_payload = {
        "aircraft_icao_type": aircraft_icao_type,
        "aircraft_registration": aircraft_registration,
        "entered_mtow_kg": entered_mtow_kg,
        "operator_airline_name": operator_airline_name,
        "persons": [{"role": p.role, "nationality_iso3": p.nationality_iso3, "name": p.name} for p in persons],
        "legs": [
            {
                "dep_icao": leg_in.dep_icao.upper(),
                "arr_icao": leg_in.arr_icao.upper(),
                # The resolved instant, not the raw input — leg_in's own
                # reference_datetime is None when the leg was arrival-driven.
                "reference_datetime": leg_out.reference_datetime.isoformat(),
                # arrival_datetime_override (task #116) only changes what's
                # cached/displayed here — permits/deadlines were already
                # computed above from the engine's own resolved arrival,
                # never this override, mirroring
                # trip_service._compute_and_build_leg's identical pattern.
                "arrival_datetime": (leg_in.arrival_datetime_override or leg_out.arrival_datetime).isoformat(),
                "call_sign": leg_in.call_sign,
                "filed_route": leg_in.filed_route,
                "avoid_states": leg_in.avoid_states,
                "include_states": leg_in.include_states,
                "avoid_firs": leg_in.avoid_firs,
                "include_firs": leg_in.include_firs,
                "verdict": leg_out.verdict,
                # The already-projected LegResultOut (display-ready: country
                # names resolved, avoid/include mapped) rather than the raw
                # engine dataclass — Trip Manager reads this straight back
                # without re-running any projection logic.
                "snapshot": leg_out.model_dump(mode="json"),
            }
            for leg_in, leg_out in zip(legs, leg_outs)
        ],
        "rule_engine_version": RULE_ENGINE_VERSION,
    }
    redis = get_redis()
    await redis.set(
        f"{CHECK_CACHE_PREFIX}{check_id}", json.dumps(cache_payload), ex=settings_map["feasibility_quote_ttl_seconds"]
    )

    return FeasibilityCheckOut(check_id=check_id, legs=response_legs, overall_verdict=overall_verdict)


async def create_enquiry_trip(
    session: AsyncSession,
    *,
    check_id: str,
    contact_name: str,
    contact_email: str,
    contact_phone: str | None,
    notes: str | None,
) -> Trip:
    redis = get_redis()
    key = f"{CHECK_CACHE_PREFIX}{check_id}"
    raw = await redis.get(key)
    if raw is None:
        raise NotFoundError("FeasibilityCheck", check_id)
    cached = json.loads(raw)

    trip = Trip(
        status=TripStatus.LEAD,
        source=TripSource.PUBLIC_FEASIBILITY_IQ,
        requested_by_name=contact_name,
        requested_by_email=contact_email,
        requested_by_phone=contact_phone,
        notes=notes,
        aircraft_registration=cached.get("aircraft_registration"),
        entered_mtow_kg=cached.get("entered_mtow_kg"),
        operator_airline_name=cached.get("operator_airline_name"),
    )
    session.add(trip)
    await session.flush()

    for leg_index, leg in enumerate(cached["legs"]):
        session.add(
            TripLeg(
                trip_id=trip.id,
                leg_index=leg_index,
                dep_icao=leg["dep_icao"],
                arr_icao=leg["arr_icao"],
                aircraft_icao_type=cached["aircraft_icao_type"],
                reference_datetime=datetime.fromisoformat(leg["reference_datetime"]),
                arrival_datetime=datetime.fromisoformat(leg["arrival_datetime"]),
                call_sign=leg.get("call_sign"),
                filed_route=leg.get("filed_route"),
                persons=cached["persons"],
                constraints={
                    "avoid_states": leg["avoid_states"],
                    "include_states": leg["include_states"],
                    "avoid_firs": leg["avoid_firs"],
                    "include_firs": leg["include_firs"],
                },
                verdict=leg["verdict"],
                rule_engine_version=cached["rule_engine_version"],
                computed_snapshot=leg["snapshot"],
            )
        )
    await session.flush()

    # Single-use: a replayed check_id must fail, not silently re-create a trip.
    await redis.delete(key)

    return trip
