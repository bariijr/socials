"""Polls an IMAP inbox for replies to permit/service requests sent via
app.core.email_client (task #103). Matches by the [JTL-{trip_id}-{leg_id}-
{service_code}-{icao}] subject tag embedded in every outbound message
(task #104), files each match as an INBOUND ServiceMessage, and advances
the assignment's status to ACKNOWLEDGED (never backward from CONFIRMED —
a stray follow-up email after confirmation shouldn't undo it).

Gracefully does nothing if IMAP isn't configured (empty imap_host) — same
NO_PROVIDER_CONFIGURED-style honesty as every other optional integration in
this system: the mechanism exists, but produces no fabricated activity when
there is no real mailbox behind it.

imapclient is synchronous (no mature async IMAP client exists) — fine here
since this only ever runs inside a Celery task's own process/thread, not
sharing an event loop with anything else that needs to stay responsive.
"""

import email as email_lib
from email.header import decode_header
from email.message import Message
from uuid import UUID

import imapclient

from app.config import get_settings
from app.core.email_client import parse_reference_tag
from app.database import AsyncSessionLocal
from app.models.service_delivery import DeliveryChannel
from app.models.service_message import ServiceMessage, ServiceMessageDirection
from app.models.trip import ServiceAssignmentStatus, TripLeg
from app.repositories.base import Repository

_ADVANCES_TO_ACKNOWLEDGED = {ServiceAssignmentStatus.PENDING.value, ServiceAssignmentStatus.SENT.value}


def _decode_header_value(raw: str | None) -> str:
    if not raw:
        return ""
    parts = decode_header(raw)
    decoded = "".join(
        chunk.decode(charset or "utf-8", errors="replace") if isinstance(chunk, bytes) else chunk
        for chunk, charset in parts
    )
    return decoded


def _extract_body(parsed: Message) -> str:
    if parsed.is_multipart():
        for part in parsed.walk():
            if part.get_content_type() == "text/plain" and part.get_content_disposition() != "attachment":
                payload = part.get_payload(decode=True)
                if payload:
                    return payload.decode(part.get_content_charset() or "utf-8", errors="replace")
        return ""
    payload = parsed.get_payload(decode=True)
    return payload.decode(parsed.get_content_charset() or "utf-8", errors="replace") if payload else ""


async def _file_reply(trip_id: UUID, leg_id: UUID, service_code: str, icao: str, subject: str, body: str, from_addr: str) -> bool:
    async with AsyncSessionLocal() as session:
        leg = await session.get(TripLeg, leg_id)
        if leg is None or leg.trip_id != trip_id or leg.deleted_at is not None:
            return False

        repo = Repository(session, ServiceMessage)
        await repo.create(
            ServiceMessage(
                leg_id=leg_id,
                service_code=service_code,
                icao=icao,
                direction=ServiceMessageDirection.INBOUND,
                channel=DeliveryChannel.EMAIL,
                subject=subject,
                body=body,
                sent_by_name=from_addr,
            )
        )

        key = f"{service_code}:{icao}"
        assignments = dict(leg.service_assignments)
        assignment = dict(assignments.get(key, {}))
        if assignment.get("status", ServiceAssignmentStatus.PENDING.value) in _ADVANCES_TO_ACKNOWLEDGED:
            assignment["status"] = ServiceAssignmentStatus.ACKNOWLEDGED.value
            assignments[key] = assignment
            leg.service_assignments = assignments
            leg.version += 1

        await session.commit()
    return True


async def poll_inbox() -> int:
    """Returns the number of new inbound replies filed. Kept as a plain
    async function, not a Celery task itself, so it's testable without a
    Celery worker running — app.worker.tasks wraps it for the beat
    schedule."""
    settings = get_settings()
    if not settings.imap_host:
        return 0

    filed = 0
    with imapclient.IMAPClient(settings.imap_host, port=settings.imap_port, ssl=settings.imap_use_ssl) as imap:
        imap.login(settings.imap_user, settings.imap_password)
        imap.select_folder("INBOX")
        for msg_id in imap.search(["UNSEEN"]):
            raw = imap.fetch([msg_id], ["RFC822"])[msg_id][b"RFC822"]
            parsed = email_lib.message_from_bytes(raw)
            subject = _decode_header_value(parsed.get("Subject"))
            reference = parse_reference_tag(subject)
            if reference is None:
                continue
            trip_id_str, leg_id_str, service_code, icao = reference
            try:
                trip_id, leg_id = UUID(trip_id_str), UUID(leg_id_str)
            except ValueError:
                continue

            body = _extract_body(parsed)
            from_addr = _decode_header_value(parsed.get("From"))
            if await _file_reply(trip_id, leg_id, service_code, icao, subject, body, from_addr):
                filed += 1
            imap.set_flags([msg_id], [imapclient.SEEN])
    return filed
