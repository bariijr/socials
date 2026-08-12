"""app.core.email_client.send_email against a real MailHog SMTP capture
(task #103) — MailHog is a `profiles: ["dev"]` service, so this test only
passes when it's actually running (`docker compose --profile dev up -d
mailhog`); it is not part of the default `docker compose up -d` stack.
Uses MailHog's own HTTP API (http://mailhog:8025/api/v2) to confirm what
was actually captured, rather than trusting that aiosmtplib.send() didn't
raise.
"""

import uuid

import httpx
import pytest

from app.config import get_settings
from app.core.email_client import send_email
from app.services.email_poll_service import poll_inbox

MAILHOG_API = "http://mailhog:8025/api/v2"


async def _latest_messages(subject_contains: str) -> list[dict]:
    async with httpx.AsyncClient() as http:
        resp = await http.get(f"{MAILHOG_API}/messages", params={"limit": 50})
    resp.raise_for_status()
    items = resp.json()["items"]
    return [m for m in items if subject_contains in m["Content"]["Headers"]["Subject"][0]]


class TestSendEmail:
    @pytest.mark.asyncio
    async def test_send_is_captured_by_mailhog(self):
        marker = uuid.uuid4().hex[:8]
        subject = f"Jetelio test {marker}"
        message_id = await send_email(to=["vendor@example.com"], subject=subject, body="Please confirm receipt.")
        assert message_id

        matches = await _latest_messages(marker)
        assert len(matches) == 1, "expected exactly one captured message with this marker"
        captured = matches[0]
        assert captured["Content"]["Headers"]["To"][0] == "vendor@example.com"
        assert "Please confirm receipt." in captured["Content"]["Body"]

    @pytest.mark.asyncio
    async def test_attachment_is_captured(self):
        marker = uuid.uuid4().hex[:8]
        subject = f"Jetelio attachment test {marker}"
        await send_email(
            to=["vendor@example.com"],
            subject=subject,
            body="See attached.",
            attachments=[("test.txt", b"hello world", "text/plain")],
        )

        matches = await _latest_messages(marker)
        assert len(matches) == 1
        mime_parts = matches[0]["MIME"]["Parts"] if matches[0].get("MIME") else []
        filenames = [
            h.get("Content-Disposition", [""])[0]
            for part in mime_parts
            for h in [part.get("Headers", {})]
            if "attachment" in h.get("Content-Disposition", [""])[0]
        ]
        assert any("test.txt" in f for f in filenames)


class TestPollInbox:
    @pytest.mark.asyncio
    async def test_no_op_when_imap_not_configured(self):
        # This dev/test environment never has real IMAP credentials
        # configured (MailHog has no IMAP server at all) — confirms the
        # NO_PROVIDER_CONFIGURED-style no-op path, not a fabricated poll.
        assert get_settings().imap_host == ""
        assert await poll_inbox() == 0
