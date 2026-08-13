from dataclasses import dataclass, field
from uuid import UUID

from jinja2 import Template
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.email_client import build_reference_tag, send_email
from app.core.errors import NotFoundError
from app.domain.document_requirements import DocumentRequirementStatus
from app.domain.reference_status import resolve_effective_permit_validity
from app.models.aircraft import Aircraft
from app.models.airport import Airport
from app.models.country import Country
from app.models.messaging import MessageTemplate, MessagingChannel
from app.models.operator import Operator
from app.models.service_catalogue import ServiceCatalogueEntry, ServiceCategory
from app.models.service_delivery import DeliveryChannel, VendorContact
from app.models.service_message import ServiceMessage, ServiceMessageDirection
from app.models.trip import ServiceAssignmentStatus, Trip, TripLeg
from app.models.vendor import Vendor
from app.repositories.base import Repository
from app.schemas.service_message import ServiceMessageCreate, ServiceMessageOut
from app.services import document_attach_service, person_role_service, service_delivery_service, settings_service


async def _get_leg_or_404(session: AsyncSession, trip_id: UUID, leg_id: UUID) -> TripLeg:
    leg = await session.get(TripLeg, leg_id)
    if leg is None or leg.trip_id != trip_id or leg.deleted_at is not None:
        raise NotFoundError("TripLeg", leg_id)
    return leg


async def list_messages(
    session: AsyncSession, trip_id: UUID, leg_id: UUID, service_code: str, icao: str
) -> list[ServiceMessageOut]:
    await _get_leg_or_404(session, trip_id, leg_id)
    repo = Repository(session, ServiceMessage)
    items, _total = await repo.list(
        page=1,
        page_size=500,
        filters={"leg_id": leg_id, "service_code": service_code, "icao": icao},
        order_by=ServiceMessage.created_at,
    )
    return [ServiceMessageOut.model_validate(m) for m in items]


async def create_message(
    session: AsyncSession,
    trip_id: UUID,
    leg_id: UUID,
    service_code: str,
    icao: str,
    payload: ServiceMessageCreate,
    *,
    actor_id: UUID,
    actor_email: str,
) -> ServiceMessageOut:
    await _get_leg_or_404(session, trip_id, leg_id)
    repo = Repository(session, ServiceMessage)
    created = await repo.create(
        ServiceMessage(
            leg_id=leg_id,
            service_code=service_code,
            icao=icao,
            direction=payload.direction,
            channel=payload.channel,
            subject=payload.subject,
            body=payload.body,
            sent_by_user_id=actor_id,
            sent_by_name=payload.sent_by_name or actor_email,
        )
    )
    return ServiceMessageOut.model_validate(created)


async def delete_message(
    session: AsyncSession, trip_id: UUID, leg_id: UUID, service_code: str, icao: str, message_id: UUID, version: int
) -> None:
    await _get_leg_or_404(session, trip_id, leg_id)
    repo = Repository(session, ServiceMessage)
    message = await repo.get(message_id)
    if message.leg_id != leg_id or message.service_code != service_code or message.icao != icao:
        raise NotFoundError("ServiceMessage", message_id)
    await repo.soft_delete(message_id, version)


# --- Format & send (task #104) — wires task #86's dormant config/resolve
# layer to an actual send via task #103's email client. ---

_ADVANCES_TO_SENT = {ServiceAssignmentStatus.PENDING.value}


@dataclass(frozen=True)
class SendServiceRequestResult:
    service_code: str
    icao: str
    sent: bool
    error: str | None
    message: ServiceMessageOut | None
    document_warnings: list[str] = field(default_factory=list)


def _render_template(template: MessageTemplate | None, *, default_subject: str, default_body: str, context: dict) -> tuple[str, str]:
    """Jinja2, autoescape off — see MessageTemplate's docstring ("plain-text
    teletype messages"). Falls back to a plain, honest default when no
    template is configured for this scope — never fabricates content, just
    a minimal functional request."""
    if template is None:
        return default_subject, default_body
    subject = Template(template.subject_line or default_subject).render(**context)
    body = Template(template.body).render(**context)
    if template.footer_block:
        body = f"{body}\n\n{Template(template.footer_block).render(**context)}"
    return subject, body


async def _pick_vendor_contact(session: AsyncSession, vendor_id: UUID, channel: DeliveryChannel) -> VendorContact | None:
    rows = (
        await session.execute(
            select(VendorContact).where(
                VendorContact.vendor_id == vendor_id,
                VendorContact.channel == channel,
                VendorContact.deleted_at.is_(None),
            )
        )
    ).scalars().all()
    if not rows:
        return None
    primary = [r for r in rows if r.is_primary]
    return primary[0] if primary else rows[0]


async def _resolve_aircraft_and_operator(session: AsyncSession, registration: str | None) -> tuple[Aircraft | None, Operator | None]:
    """Trip/TripLeg deliberately snapshot aircraft/operator as plain strings
    at creation time (no live FK — see TripLeg's docstring), so producing a
    real operator address/airline-code block for a message means a fresh
    lookup by registration here, not a join."""
    if not registration:
        return None, None
    aircraft = (
        await session.execute(
            select(Aircraft).where(func.upper(Aircraft.registration) == registration.upper(), Aircraft.deleted_at.is_(None))
        )
    ).scalar_one_or_none()
    if aircraft is None:
        return None, None
    operator = await session.get(Operator, aircraft.operator_id)
    return aircraft, operator


async def _resolve_country(session: AsyncSession, location_code: str) -> Country | None:
    """Same length-based ICAO-vs-ISO3 dispatch as trip_service._compute_service_valid_until."""
    if len(location_code) == 3:
        return await session.get(Country, location_code)
    airport = await session.get(Airport, location_code)
    if airport is None or airport.country_iso3 is None:
        return None
    return await session.get(Country, airport.country_iso3)


def _format_operator_address(operator: Operator | None, country_name: str | None) -> str:
    if operator is None:
        return ""
    lines = [operator.address_line1, operator.address_line2]
    city_line = ", ".join(p for p in [operator.city, operator.state_province, operator.postal_code] if p)
    if city_line:
        lines.append(city_line)
    if country_name:
        lines.append(country_name)
    return "\n".join(l for l in lines if l)


def _crew_summary(persons: list[dict], role_is_crew: dict[str, bool]) -> str:
    """Named PIC + headcount when a name is on file (matching the sample's
    "CAPTAIN NICHOLAS FREEMAN PLUS 2 CREW AND 1 PAX"), pure headcount
    otherwise — never a fabricated name (task #119's crew-name work)."""
    crew = [p for p in persons if role_is_crew.get(p.get("role"), False)]
    pax_count = len(persons) - len(crew)
    pic = next((p for p in crew if p.get("role") == "PIC" and p.get("name")), None)
    if pic is None:
        crew_count = len(crew)
        if crew_count == 0 and pax_count == 0:
            return "NO CREW/PAX ON FILE"
        return f"{crew_count} CREW AND {pax_count} PAX"
    remaining_crew = len(crew) - 1
    parts = [f"CAPTAIN {pic['name'].upper()}"]
    if remaining_crew > 0:
        parts.append(f"PLUS {remaining_crew} CREW")
    if pax_count > 0:
        parts.append(f"AND {pax_count} PAX" if remaining_crew > 0 else f"PLUS {pax_count} PAX")
    return " ".join(parts)


def _attachments_block(document_results: list) -> str:
    attached = [r for r in document_results if r.status == DocumentRequirementStatus.ATTACHED]
    if not attached:
        return ""
    return "\n".join(f"{i + 1}. {r.requirement.upper()}" for i, r in enumerate(attached))


async def _other_legs_same_country(
    session: AsyncSession, trip_id: UUID, current_leg_id: UUID, service_code: str, country_iso3: str
) -> list[dict]:
    """Task #119 — the multi-leg "aircraft overflying/landing in the same
    country twice" sample (LEG1/LEG2 itinerary lines in one message).
    Display-only: the send action itself still targets and advances only
    the one leg/service/country line item being sent (task #104's
    each-item-independent design is untouched)."""
    permit_key = "overflight_permits" if service_code == "OVF" else "landing_permits"
    legs = (
        await session.execute(
            select(TripLeg)
            .where(TripLeg.trip_id == trip_id, TripLeg.deleted_at.is_(None))
            .order_by(TripLeg.leg_index)
        )
    ).scalars().all()
    other_legs = []
    for other_leg in legs:
        permits = other_leg.computed_snapshot.get("permits", {})
        if any(p.get("country_iso3") == country_iso3 for p in permits.get(permit_key, [])):
            other_legs.append(
                {
                    "leg_index": other_leg.leg_index,
                    "call_sign": other_leg.call_sign,
                    "dep_icao": other_leg.dep_icao,
                    "arr_icao": other_leg.arr_icao,
                    "reference_datetime": other_leg.reference_datetime.isoformat(),
                    "is_current": other_leg.id == current_leg_id,
                }
            )
    return other_legs


def _default_handling_request(context: dict) -> tuple[str, str]:
    """GROUND category — ATTN/REF/itinerary/"PENDING CONFIRMATION" shape,
    matching the real Universal Weather-style handling-request sample."""
    subject = f"{context['service_code']} REQUEST {context['reference_tag']}"
    ref_line = " / ".join(
        p for p in [context["operator_airline_name"], context["registration"], context["aircraft_icao_type"], context["call_sign"]] if p
    )
    lines = [
        f"ATTN:  {context['vendor_name'] or 'HANDLING AGENT'}",
        f"REF:   {ref_line}",
        "",
        "ITINERARY:",
        f"  {context['service_code']}  {context['icao']}",
        f"  ETD/ETA  {context['reference_datetime']}",
        f"  ARRIVAL  {context['arrival_datetime']}",
        "",
        "PENDING CONFIRMATION",
        f"  1. {context['service_code']}",
        f"     PLEASE ARRANGE {context['service_code']} FOR THE ABOVE FLIGHT AND CONFIRM.",
    ]
    if context["crew_summary"]:
        lines += ["", f"CREW/PAX: {context['crew_summary']}"]
    lines += ["", "PLEASE ACKNOWLEDGE RECEIPT OF THIS MESSAGE.", "", f"Reference: {context['reference_tag']}"]
    return subject, "\n".join(lines)


def _default_permit_request(context: dict) -> tuple[str, str]:
    """PERMIT category — the real A-G structured overflight/landing permit
    request shape, including a multi-leg LEG1/LEG2 itinerary block when
    the aircraft touches this country more than once on the trip."""
    permit_word = "OVERFLIGHT" if context["service_code"] == "OVF" else "LANDING"
    subject = f"{permit_word} PERMIT REQUEST {context['reference_tag']}"

    lines = [f"ATTN:  {context['caa_name'] or context['vendor_name'] or 'CIVIL AVIATION AUTHORITY'}", ""]
    validity_clause = f" WITH A {context['permit_validity']} VALIDITY IN CASE OF DELAY" if context["permit_validity"] else ""
    lines.append(f"RESPECTFULLY REQUEST {permit_word} PERMISSION{validity_clause} BASED ON THE FOLLOWING:")
    lines.append("")

    lines.append(f"A. OPERATOR: {context['operator_airline_name'] or ''}")
    if context["operator_address"]:
        lines.append(context["operator_address"])
    contact_bits = " / ".join(
        p for p in [
            f"TEL {context['operator_phone']}" if context["operator_phone"] else None,
            f"FAX {context['operator_fax']}" if context["operator_fax"] else None,
            f"AFTN {context['operator_aftn']}" if context["operator_aftn"] else None,
            f"SITA {context['operator_sita']}" if context["operator_sita"] else None,
        ]
        if p
    )
    if contact_bits:
        lines.append(contact_bits)
    lines.append("")

    reg_line = f"B. REGISTRY: {context['registration'] or ''}   ACFT TYPE: {context['aircraft_icao_type']}"
    if context["mtow_lb"]:
        reg_line += f"   MTOW: {context['mtow_lb']} LB"
    lines.append(reg_line)
    lines.append("")

    if context["classification"]:
        lines.append(f"C. AIRCRAFT CLASSIFICATION: {context['classification']}")
        lines.append("")

    lines.append("D. ITINERARY:")
    if context["other_legs"]:
        for other_leg in context["other_legs"]:
            lines.append(f"   LEG{other_leg['leg_index'] + 1}: ITINERARY:")
            lines.append(f"       CALL SIGN: {other_leg['call_sign'] or context['call_sign'] or ''}")
            lines.append(f"        ETD {other_leg['dep_icao']}          {other_leg['reference_datetime']}")
            lines.append(f"        ETA {other_leg['arr_icao']}          TBD")
            lines.append("")
    else:
        lines.append(f"    CALL SIGN: {context['call_sign'] or ''}")
        lines.append(f"     ETD {context['dep_icao']}          {context['reference_datetime']}")
        lines.append(f"     ETA {context['arr_icao']}          {context['arrival_datetime']}")
        lines.append("")

    route_line = "E. ROUTE: VIA APPROVED ATS ROUTES"
    if context["filed_route"]:
        route_line += f" ({context['filed_route']})"
    lines.append(route_line)
    lines.append("")

    lines.append(f"F. PURPOSE OF FLIGHT: {context['flight_purpose'] or 'BUSINESS'}")
    lines.append("")

    lines.append(f"G. CREW: {context['crew_summary']}")

    if context["attachments"]:
        lines += ["", "ATTACHMENTS:", context["attachments"]]

    lines += ["", f"Reference: {context['reference_tag']}"]
    return subject, "\n".join(lines)


async def check_documents(session: AsyncSession, trip_id: UUID, leg_id: UUID, icao: str) -> list:
    """Read-only preview of task #108's document matching, so the UI can
    show coverage ("2 attached, 1 missing") before Format & send actually
    fires — same resolution `send_service_request` uses, just without
    sending anything."""
    leg = await _get_leg_or_404(session, trip_id, leg_id)
    trip = await session.get(Trip, trip_id)
    if trip is None:
        return []
    return await document_attach_service.resolve_document_requirements(session, trip, leg, icao)


async def send_service_request(
    session: AsyncSession, trip_id: UUID, leg_id: UUID, service_code: str, icao: str, *, actor_id: UUID, actor_email: str
) -> SendServiceRequestResult:
    """Resolves the winning ServiceDeliveryConfig (task #86), renders its
    template, sends via email (the only channel with a real transport —
    task #103), writes an OUTBOUND ServiceMessage either way (a failed
    attempt is still a real event worth logging), and advances the
    assignment's status to SENT only on success and only from PENDING
    (never regresses an already-further-along assignment)."""
    leg = await _get_leg_or_404(session, trip_id, leg_id)

    # icao holds a country ISO3 (3 letters), not an airport code, for
    # overflight/landing permit line items (task #115 — see
    # trip_service._compute_service_valid_until for the same length-based
    # dispatch). Threading it through as country_iso3 lets
    # resolve_service_delivery fall back to VendorCoverageCountry when no
    # explicit leg/trip/operator ServiceDeliveryConfig applies.
    resolved = await service_delivery_service.resolve_service_delivery(
        session, leg_id=leg_id, service_code=service_code, operator_id=None,
        country_iso3=icao if len(icao) == 3 else None,
    )
    if resolved.config is None and resolved.fallback_vendor_id is None:
        return SendServiceRequestResult(service_code, icao, sent=False, error="No service delivery config configured for this leg/service.", message=None)

    if resolved.config is not None:
        config_vendor_id = resolved.config.vendor_id
        config_delivery_channels = resolved.config.delivery_channels
        config_message_template_id = resolved.config.message_template_id
    else:
        # VendorCoverageCountry fallback — no explicit channel list exists
        # for it, so assume EMAIL (the only channel with a real transport
        # anyway, see below) and no bespoke template.
        config_vendor_id = resolved.fallback_vendor_id
        config_delivery_channels = [DeliveryChannel.EMAIL]
        config_message_template_id = None

    if DeliveryChannel.EMAIL not in config_delivery_channels:
        channels = ", ".join(c.value for c in config_delivery_channels)
        return SendServiceRequestResult(
            service_code, icao, sent=False,
            error=f"Configured channel(s) ({channels}) don't include EMAIL — only email sending is implemented; dispatch manually.",
            message=None,
        )

    contact = await _pick_vendor_contact(session, config_vendor_id, DeliveryChannel.EMAIL)
    if contact is None:
        return SendServiceRequestResult(service_code, icao, sent=False, error="No email contact on file for the configured vendor.", message=None)

    vendor = await session.get(Vendor, config_vendor_id)
    trip = await session.get(Trip, trip_id)

    template = await session.get(MessageTemplate, config_message_template_id) if config_message_template_id else None
    if template is not None and template.channel != MessagingChannel.EMAIL:
        template = None  # a non-email template can't back an email send; fall back to the default

    catalogue_entry = (
        await session.execute(select(ServiceCatalogueEntry).where(ServiceCatalogueEntry.code == service_code))
    ).scalar_one_or_none()
    category = catalogue_entry.category if catalogue_entry else ServiceCategory.GROUND

    registration = leg.registration or (trip.aircraft_registration if trip else None)
    aircraft, operator = await _resolve_aircraft_and_operator(session, registration)

    country = await _resolve_country(session, icao)
    caa_name = country.caa_name if country else None
    permit_validity = None
    if country is not None:
        settings_map = await settings_service.get_typed_settings_map(session)
        effective = resolve_effective_permit_validity(
            country.permit_validity_amount,
            country.permit_validity_unit.value if country.permit_validity_unit else None,
            settings_map["default_permit_validity_amount"],
            settings_map["default_permit_validity_unit"],
        )
        permit_validity = f"{effective.amount:g} {effective.unit}"

    role_is_crew = await person_role_service.get_crew_bucket_map(session)
    crew_summary = _crew_summary(leg.persons, role_is_crew)

    other_legs = (
        await _other_legs_same_country(session, trip_id, leg_id, service_code, icao)
        if category == ServiceCategory.PERMIT and len(icao) == 3
        else []
    )

    reference_tag = build_reference_tag(str(trip_id), str(leg_id), service_code, icao)
    context = {
        "trip_id": str(trip_id),
        "leg_id": str(leg_id),
        "service_code": service_code,
        "icao": icao,
        "dep_icao": leg.dep_icao,
        "arr_icao": leg.arr_icao,
        "aircraft_icao_type": leg.aircraft_icao_type,
        "registration": registration,
        "call_sign": leg.call_sign,
        "filed_route": leg.filed_route,
        "reference_datetime": leg.reference_datetime.isoformat(),
        "arrival_datetime": leg.arrival_datetime.isoformat(),
        "operator_airline_name": trip.operator_airline_name if trip else None,
        "operator_address": _format_operator_address(operator, country.name if country else None),
        "operator_phone": operator.contact_phone if operator else None,
        "operator_fax": operator.contact_fax if operator else None,
        "operator_aftn": operator.airline_code_aftn if operator else None,
        "operator_sita": operator.airline_code_sita if operator else None,
        "classification": aircraft.classification if aircraft else None,
        "mtow_lb": round(aircraft.mtow_kg * 2.20462) if aircraft and aircraft.mtow_kg else None,
        "flight_purpose": trip.flight_purpose.value if trip and trip.flight_purpose else None,
        "crew_summary": crew_summary,
        "caa_name": caa_name,
        "permit_validity": permit_validity,
        "other_legs": other_legs,
        "vendor_name": vendor.name if vendor else None,
        "reference_tag": reference_tag,
        # attachments filled in below, once document_results is computed —
        # placeholder here so the key exists for both default renderers.
        "attachments": "",
    }

    # Task #108: attach whatever real documents the trip's Party/Aircraft
    # actually have on file that this country is known to require — never
    # more than that. Missing/expired/unmatched requirements are still
    # surfaced (never silently dropped), they just don't block the send.
    document_results = await document_attach_service.resolve_document_requirements(session, trip, leg, icao) if trip else []
    attachments_files = await document_attach_service.fetch_attachable_documents(session, document_results)
    document_warnings = [
        f"{r.status}: {r.requirement}" for r in document_results if r.status != DocumentRequirementStatus.ATTACHED
    ]
    context["attachments"] = _attachments_block(document_results)

    default_subject, default_body = (
        _default_permit_request(context) if category == ServiceCategory.PERMIT else _default_handling_request(context)
    )
    subject, body = _render_template(template, default_subject=default_subject, default_body=default_body, context=context)
    if reference_tag not in subject:
        subject = f"{subject} {reference_tag}"

    try:
        await send_email(to=[contact.contact_value], subject=subject, body=body, attachments=attachments_files or None)
        send_error = None
    except Exception as exc:  # noqa: BLE001 — any transport failure still gets logged below, not swallowed silently
        send_error = str(exc)

    repo = Repository(session, ServiceMessage)
    created = await repo.create(
        ServiceMessage(
            leg_id=leg_id,
            service_code=service_code,
            icao=icao,
            direction=ServiceMessageDirection.OUTBOUND,
            channel=DeliveryChannel.EMAIL,
            subject=subject,
            body=body if send_error is None else f"{body}\n\n[SEND FAILED: {send_error}]",
            sent_by_user_id=actor_id,
            sent_by_name=actor_email,
        )
    )
    message_out = ServiceMessageOut.model_validate(created)

    if send_error is None:
        key = f"{service_code}:{icao}"
        assignments = dict(leg.service_assignments)
        assignment = dict(assignments.get(key, {}))
        if assignment.get("status", ServiceAssignmentStatus.PENDING.value) in _ADVANCES_TO_SENT:
            assignment["status"] = ServiceAssignmentStatus.SENT.value
            assignments[key] = assignment
            leg.service_assignments = assignments
            leg.version += 1

    return SendServiceRequestResult(
        service_code, icao, sent=send_error is None, error=send_error, message=message_out,
        document_warnings=document_warnings,
    )


async def send_service_requests_batch(
    session: AsyncSession, trip_id: UUID, leg_id: UUID, items: list[tuple[str, str]], *, actor_id: UUID, actor_email: str
) -> list[SendServiceRequestResult]:
    results = []
    for service_code, icao in items:
        results.append(
            await send_service_request(session, trip_id, leg_id, service_code, icao, actor_id=actor_id, actor_email=actor_email)
        )
    return results
