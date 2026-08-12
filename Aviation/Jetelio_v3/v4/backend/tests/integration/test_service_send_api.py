"""Format & send permit requests (task #104) — wires task #86's dormant
ServiceDeliveryConfig resolution to a real SMTP send (task #103), verified
against a real MailHog capture rather than trusting the API response alone.
"""

import uuid
from email.header import decode_header

import httpx
import pytest

from app.models.user import UserRole
from tests.integration.test_trips_api import _auth_headers, _create_payload, trip_leg_fixture  # noqa: F401

MAILHOG_API = "http://mailhog:8025/api/v2"


def _decoded_subject(message: dict) -> str:
    # Long subjects with no whitespace to fold on (the [JTL-...] reference
    # tag is one unbroken token) get RFC 2047 encoded-word wrapped by
    # Python's default email policy even though every character is plain
    # ASCII — same as a real inbound reply, which
    # email_poll_service._decode_header_value already handles for the real
    # parse path. MailHog's API returns the raw, still-encoded header.
    raw = message["Content"]["Headers"]["Subject"][0]
    parts = decode_header(raw)
    return "".join(chunk.decode(charset or "utf-8", errors="replace") if isinstance(chunk, bytes) else chunk for chunk, charset in parts)


async def _latest_messages(marker: str) -> list[dict]:
    async with httpx.AsyncClient() as http:
        resp = await http.get(f"{MAILHOG_API}/messages", params={"limit": 50})
    resp.raise_for_status()
    return [m for m in resp.json()["items"] if marker in _decoded_subject(m)]


async def _create_trip_with_service(client, trip_leg_fixture, headers):
    created = (await client.post("/trips", headers=headers, json=_create_payload(trip_leg_fixture))).json()
    trip_id = created["id"]
    leg_id = created["legs"][0]["id"]
    service = created["legs"][0]["service_assignments"][0]
    return trip_id, leg_id, service["service_code"], service["icao"]


async def _create_vendor_with_contact(client, headers, channel: str, contact_value: str):
    vendor = (await client.post("/vendors", headers=headers, json={"name": f"Vendor {uuid.uuid4().hex[:6]}"})).json()
    contact = await client.post(
        "/vendor-contacts",
        headers=headers,
        json={"vendor_id": vendor["id"], "channel": channel, "contact_value": contact_value, "is_primary": True},
    )
    assert contact.status_code == 201, contact.text
    return vendor


class TestSendServiceRequest:
    @pytest.mark.asyncio
    async def test_send_with_full_config_succeeds_and_is_captured(self, client, trip_leg_fixture):
        headers = _auth_headers()
        trip_id, leg_id, service_code, icao = await _create_trip_with_service(client, trip_leg_fixture, headers)
        vendor = await _create_vendor_with_contact(client, headers, "EMAIL", "ops@vendor.example")

        config = await client.post(
            "/service-delivery-configs",
            headers=headers,
            json={"leg_id": leg_id, "service_code": service_code, "vendor_id": vendor["id"], "delivery_channels": ["EMAIL"]},
        )
        assert config.status_code == 201, config.text

        resp = await client.post(
            f"/trips/{trip_id}/legs/{leg_id}/services/send",
            headers=headers,
            json={"items": [{"service_code": service_code, "icao": icao}]},
        )
        assert resp.status_code == 200, resp.text
        result = resp.json()[0]
        assert result["sent"] is True, result
        assert result["error"] is None
        assert result["message"]["direction"] == "OUTBOUND"
        assert result["message"]["channel"] == "EMAIL"
        marker = f"{trip_id}-{leg_id}-{service_code}-{icao}"
        matches = await _latest_messages(marker)
        assert len(matches) == 1, matches
        assert matches[0]["Content"]["Headers"]["To"][0] == "ops@vendor.example"

        trip = (await client.get(f"/trips/{trip_id}", headers=headers)).json()
        sent_assignment = next(
            s for s in trip["legs"][0]["service_assignments"] if s["service_code"] == service_code and s["icao"] == icao
        )
        assert sent_assignment["status"] == "SENT"

    @pytest.mark.asyncio
    async def test_send_renders_message_template(self, client, trip_leg_fixture):
        headers = _auth_headers()
        trip_id, leg_id, service_code, icao = await _create_trip_with_service(client, trip_leg_fixture, headers)
        vendor = await _create_vendor_with_contact(client, headers, "EMAIL", "handling@vendor.example")

        template = await client.post(
            "/message-templates",
            headers=headers,
            json={
                "template_key": f"tpl-{uuid.uuid4().hex[:6]}",
                "name": "Test template",
                "message_type": "SERVICE_REQUEST",
                "recipient_role": "VENDOR",
                "channel": "EMAIL",
                "subject_line": "Request for {{ service_code }} at {{ icao }}",
                "body": "Please handle {{ dep_icao }} to {{ arr_icao }}, aircraft {{ aircraft_icao_type }}.",
            },
        )
        assert template.status_code == 201, template.text

        config = await client.post(
            "/service-delivery-configs",
            headers=headers,
            json={
                "leg_id": leg_id,
                "service_code": service_code,
                "vendor_id": vendor["id"],
                "delivery_channels": ["EMAIL"],
                "message_template_id": template.json()["id"],
            },
        )
        assert config.status_code == 201, config.text

        resp = await client.post(
            f"/trips/{trip_id}/legs/{leg_id}/services/send",
            headers=headers,
            json={"items": [{"service_code": service_code, "icao": icao}]},
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()[0]["sent"] is True

        marker = f"{trip_id}-{leg_id}-{service_code}-{icao}"
        matches = await _latest_messages(marker)
        assert len(matches) == 1
        body = matches[0]["Content"]["Body"]
        assert trip_leg_fixture["dep_icao"] in body
        assert trip_leg_fixture["arr_icao"] in body
        assert f"Request for {service_code} at {icao}" in _decoded_subject(matches[0])

    @pytest.mark.asyncio
    async def test_send_without_config_reports_error_not_exception(self, client, trip_leg_fixture):
        headers = _auth_headers()
        trip_id, leg_id, service_code, icao = await _create_trip_with_service(client, trip_leg_fixture, headers)

        resp = await client.post(
            f"/trips/{trip_id}/legs/{leg_id}/services/send",
            headers=headers,
            json={"items": [{"service_code": service_code, "icao": icao}]},
        )
        assert resp.status_code == 200, resp.text
        result = resp.json()[0]
        assert result["sent"] is False
        assert "No service delivery config" in result["error"]
        assert result["message"] is None

    @pytest.mark.asyncio
    async def test_send_without_email_channel_reports_error(self, client, trip_leg_fixture):
        headers = _auth_headers()
        trip_id, leg_id, service_code, icao = await _create_trip_with_service(client, trip_leg_fixture, headers)
        vendor = await _create_vendor_with_contact(client, headers, "SITA", "VENDXXX")

        config = await client.post(
            "/service-delivery-configs",
            headers=headers,
            json={"leg_id": leg_id, "service_code": service_code, "vendor_id": vendor["id"], "delivery_channels": ["SITA"]},
        )
        assert config.status_code == 201, config.text

        resp = await client.post(
            f"/trips/{trip_id}/legs/{leg_id}/services/send",
            headers=headers,
            json={"items": [{"service_code": service_code, "icao": icao}]},
        )
        assert resp.status_code == 200, resp.text
        result = resp.json()[0]
        assert result["sent"] is False
        assert "EMAIL" in result["error"]

    @pytest.mark.asyncio
    async def test_batch_send_partially_succeeds(self, client, trip_leg_fixture):
        headers = _auth_headers()
        trip_id, leg_id, service_code, icao = await _create_trip_with_service(client, trip_leg_fixture, headers)
        vendor = await _create_vendor_with_contact(client, headers, "EMAIL", "batch@vendor.example")

        config = await client.post(
            "/service-delivery-configs",
            headers=headers,
            json={"leg_id": leg_id, "service_code": service_code, "vendor_id": vendor["id"], "delivery_channels": ["EMAIL"]},
        )
        assert config.status_code == 201, config.text

        resp = await client.post(
            f"/trips/{trip_id}/legs/{leg_id}/services/send",
            headers=headers,
            json={"items": [{"service_code": service_code, "icao": icao}, {"service_code": "UNCONFIGURED", "icao": icao}]},
        )
        assert resp.status_code == 200, resp.text
        results = {r["service_code"]: r for r in resp.json()}
        assert results[service_code]["sent"] is True
        assert results["UNCONFIGURED"]["sent"] is False

    @pytest.mark.asyncio
    async def test_send_requires_write_access(self, client, trip_leg_fixture):
        headers = _auth_headers(UserRole.AUDITOR)
        trip_id, leg_id, service_code, icao = await _create_trip_with_service(client, trip_leg_fixture, _auth_headers())

        resp = await client.post(
            f"/trips/{trip_id}/legs/{leg_id}/services/send",
            headers=headers,
            json={"items": [{"service_code": service_code, "icao": icao}]},
        )
        assert resp.status_code == 403
