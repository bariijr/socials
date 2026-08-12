"""SMTP send (task #103) — every outbound message this system sends
(permit requests, task #104; PNR delivery, task #106) goes through this one
function, so there is exactly one place that knows how to talk to the mail
server. Reads the smtp_* settings from app.config — already declared, never
previously wired to anything.
"""

import re
from email.message import EmailMessage
from email.utils import make_msgid

import aiosmtplib

from app.config import get_settings

# Embedded in the subject line of every outbound message tied to a specific
# service line item — email_poll_service.py matches an inbound reply's
# subject back to this exact tag to file it against the right trip/leg/
# service/icao. Subject-tag matching, not In-Reply-To/References threading,
# because thread headers don't reliably survive every vendor mail client or
# CAA webmail's reply behavior — a bracketed tag usually does (the same
# trick most support-ticket systems use).
_REFERENCE_TAG_PATTERN = re.compile(r"\[JTL-([0-9a-fA-F-]{36})-([0-9a-fA-F-]{36})-([A-Za-z0-9]+)-([A-Za-z0-9]+)\]")


def build_reference_tag(trip_id: str, leg_id: str, service_code: str, icao: str) -> str:
    return f"[JTL-{trip_id}-{leg_id}-{service_code}-{icao}]"


def parse_reference_tag(subject: str) -> tuple[str, str, str, str] | None:
    """Returns (trip_id, leg_id, service_code, icao) or None if the subject
    carries no recognizable tag (e.g. spam, an unrelated email that
    happens to land in the same inbox)."""
    match = _REFERENCE_TAG_PATTERN.search(subject)
    if match is None:
        return None
    return match.group(1), match.group(2), match.group(3), match.group(4)


async def send_email(
    *,
    to: list[str],
    subject: str,
    body: str,
    cc: list[str] | None = None,
    attachments: list[tuple[str, bytes, str]] | None = None,
) -> str:
    """Sends via aiosmtplib. Returns the Message-ID actually used.
    attachments is (filename, content_bytes, mime_type) tuples — mime_type
    e.g. "application/pdf". Raises aiosmtplib's own exception on failure;
    callers decide how to surface that (task #104 still writes the
    ServiceMessage row so there's a record of the attempt even if the send
    itself failed)."""
    settings = get_settings()

    message = EmailMessage()
    message["From"] = settings.smtp_from
    message["To"] = ", ".join(to)
    if cc:
        message["Cc"] = ", ".join(cc)
    message["Subject"] = subject
    message["Message-ID"] = make_msgid(domain="jetelio.local")
    message.set_content(body)

    for filename, content, mime_type in attachments or []:
        maintype, _, subtype = mime_type.partition("/")
        message.add_attachment(
            content, maintype=maintype or "application", subtype=subtype or "octet-stream", filename=filename
        )

    await aiosmtplib.send(
        message,
        hostname=settings.smtp_host,
        port=settings.smtp_port,
        username=settings.smtp_user or None,
        password=settings.smtp_password or None,
        # Local dev (MailHog) has no auth and no TLS listener — only
        # attempt STARTTLS when real credentials are actually configured.
        start_tls=bool(settings.smtp_user),
    )
    return message["Message-ID"]
