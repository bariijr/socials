from dataclasses import dataclass, field
from uuid import UUID

from jinja2 import Template
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.email_client import build_reference_tag, send_email
from app.core.errors import NotFoundError
from app.domain.document_requirements import DocumentRequirementStatus
from app.models.messaging import MessageTemplate, MessagingChannel
from app.models.service_delivery import DeliveryChannel, VendorContact
from app.models.service_message import ServiceMessage, ServiceMessageDirection
from app.models.trip import ServiceAssignmentStatus, Trip, TripLeg
from app.models.vendor import Vendor
from app.repositories.base import Repository
from app.schemas.service_message import ServiceMessageCreate, ServiceMessageOut
from app.services import document_attach_service, service_delivery_service


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

    resolved = await service_delivery_service.resolve_service_delivery(
        session, leg_id=leg_id, service_code=service_code, operator_id=None
    )
    if resolved.config is None:
        return SendServiceRequestResult(service_code, icao, sent=False, error="No service delivery config configured for this leg/service.", message=None)
    config = resolved.config

    if DeliveryChannel.EMAIL not in config.delivery_channels:
        channels = ", ".join(c.value for c in config.delivery_channels)
        return SendServiceRequestResult(
            service_code, icao, sent=False,
            error=f"Configured channel(s) ({channels}) don't include EMAIL — only email sending is implemented; dispatch manually.",
            message=None,
        )

    contact = await _pick_vendor_contact(session, config.vendor_id, DeliveryChannel.EMAIL)
    if contact is None:
        return SendServiceRequestResult(service_code, icao, sent=False, error="No email contact on file for the configured vendor.", message=None)

    vendor = await session.get(Vendor, config.vendor_id)
    trip = await session.get(Trip, trip_id)

    template = await session.get(MessageTemplate, config.message_template_id) if config.message_template_id else None
    if template is not None and template.channel != MessagingChannel.EMAIL:
        template = None  # a non-email template can't back an email send; fall back to the default

    reference_tag = build_reference_tag(str(trip_id), str(leg_id), service_code, icao)
    context = {
        "trip_id": str(trip_id),
        "leg_id": str(leg_id),
        "service_code": service_code,
        "icao": icao,
        "dep_icao": leg.dep_icao,
        "arr_icao": leg.arr_icao,
        "aircraft_icao_type": leg.aircraft_icao_type,
        "registration": leg.registration or (trip.aircraft_registration if trip else None),
        "call_sign": leg.call_sign,
        "reference_datetime": leg.reference_datetime.isoformat(),
        "arrival_datetime": leg.arrival_datetime.isoformat(),
        "operator_airline_name": trip.operator_airline_name if trip else None,
        "vendor_name": vendor.name if vendor else None,
        "reference_tag": reference_tag,
    }
    default_subject = f"{service_code} request {reference_tag}"
    default_body = (
        f"Please arrange {service_code} at {icao} for {context['registration'] or context['call_sign'] or 'the aircraft'} "
        f"({leg.aircraft_icao_type}), ETA/ETD {leg.reference_datetime.isoformat()}.\n\nReference: {reference_tag}"
    )
    subject, body = _render_template(template, default_subject=default_subject, default_body=default_body, context=context)
    if reference_tag not in subject:
        subject = f"{subject} {reference_tag}"

    # Task #108: attach whatever real documents the trip's Party/Aircraft
    # actually have on file that this country is known to require — never
    # more than that. Missing/expired/unmatched requirements are still
    # surfaced (never silently dropped), they just don't block the send.
    document_results = await document_attach_service.resolve_document_requirements(session, trip, leg, icao) if trip else []
    attachments = await document_attach_service.fetch_attachable_documents(session, document_results)
    document_warnings = [
        f"{r.status}: {r.requirement}" for r in document_results if r.status != DocumentRequirementStatus.ATTACHED
    ]

    try:
        await send_email(to=[contact.contact_value], subject=subject, body=body, attachments=attachments or None)
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
