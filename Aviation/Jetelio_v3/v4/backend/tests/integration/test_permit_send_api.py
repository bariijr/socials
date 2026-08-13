"""Task #115 — overflight/landing permits become sendable service-assignment
line items, keyed by country ISO3 instead of ICAO. Reuses trip_leg_fixture
(two adjacent countries, dep in one, arr in the other — guarantees a real
LDG permit for the arrival country) and the vendor/MailHog-capture helpers
already established in test_service_send_api.py.
"""

import copy

import pytest
from sqlalchemy import select

from app.models.service_catalogue import ServiceCatalogueEntry, ServiceCategory, ServiceLevel
from app.models.trip import TripLeg
from tests.integration.test_service_send_api import _create_vendor_with_contact, _decoded_subject, _latest_messages
from tests.integration.test_trips_api import _auth_headers, _create_payload, trip_leg_fixture  # noqa: F401


async def _ensure_ldg_catalogue_entry(session) -> None:
    """ServiceCatalogueEntry.code="LDG" is a real FK target for
    /service-delivery-configs (task #115) — the real production workbook
    already seeds OVF/LDG, this isolated test DB doesn't. The `session`
    fixture only rolls back its own uncommitted work between tests (see
    conftest.py); a COMMIT here persists for the rest of the suite run, so
    later tests in this module must check-then-insert rather than assume
    a fresh table.
    """
    existing = (await session.execute(select(ServiceCatalogueEntry).where(ServiceCatalogueEntry.code == "LDG"))).scalar_one_or_none()
    if existing is None:
        session.add(ServiceCatalogueEntry(code="LDG", name="Landing Permit", category=ServiceCategory.PERMIT, level=ServiceLevel.SERVICE))
        await session.commit()


async def _create_trip_with_landing_permit(client, trip_leg_fixture, headers):
    created = (await client.post("/trips", headers=headers, json=_create_payload(trip_leg_fixture))).json()
    trip_id = created["id"]
    leg = created["legs"][0]
    ldg = next(p for p in leg["permit_assignments"] if p["service_code"] == "LDG")
    assert ldg["country_iso3"] == trip_leg_fixture["iso_b"]
    return trip_id, leg["id"], ldg


class TestPermitSend:
    @pytest.mark.asyncio
    async def test_landing_permit_sends_via_vendor_coverage_country_fallback(self, client, trip_leg_fixture):
        headers = _auth_headers()
        trip_id, leg_id, ldg = await _create_trip_with_landing_permit(client, trip_leg_fixture, headers)
        vendor = await _create_vendor_with_contact(client, headers, "EMAIL", "caa@vendor.example")

        # No ServiceDeliveryConfig at all — only a VendorCoverageCountry row,
        # proving the fallback (not an explicit config) is what resolves this.
        coverage = await client.post(
            "/vendors/coverage/countries",
            headers=headers,
            json={"vendor_id": vendor["id"], "country_iso3": ldg["country_iso3"], "has_caa_direct_account": True},
        )
        assert coverage.status_code == 201, coverage.text

        resolved = await client.get(
            f"/service-delivery-configs/resolve?leg_id={leg_id}&service_code=LDG&country_iso3={ldg['country_iso3']}",
            headers=headers,
        )
        assert resolved.status_code == 200, resolved.text
        assert resolved.json()["matched_scope"] == "COUNTRY_COVERAGE"
        assert resolved.json()["config"] is None
        assert resolved.json()["fallback_vendor_id"] == vendor["id"]

        resp = await client.post(
            f"/trips/{trip_id}/legs/{leg_id}/services/send",
            headers=headers,
            json={"items": [{"service_code": "LDG", "icao": ldg["country_iso3"]}]},
        )
        assert resp.status_code == 200, resp.text
        result = resp.json()[0]
        assert result["sent"] is True, result
        assert result["message"]["channel"] == "EMAIL"

        marker = f"{trip_id}-{leg_id}-LDG-{ldg['country_iso3']}"
        matches = await _latest_messages(marker)
        assert len(matches) == 1, matches
        assert matches[0]["Content"]["Headers"]["To"][0] == "caa@vendor.example"

        trip = (await client.get(f"/trips/{trip_id}", headers=headers)).json()
        sent = next(p for p in trip["legs"][0]["permit_assignments"] if p["service_code"] == "LDG")
        assert sent["status"] == "SENT"

    @pytest.mark.asyncio
    async def test_explicit_service_delivery_config_takes_precedence_over_coverage(self, client, session, trip_leg_fixture):
        headers = _auth_headers()
        trip_id, leg_id, ldg = await _create_trip_with_landing_permit(client, trip_leg_fixture, headers)
        coverage_vendor = await _create_vendor_with_contact(client, headers, "EMAIL", "coverage@vendor.example")
        explicit_vendor = await _create_vendor_with_contact(client, headers, "EMAIL", "explicit@vendor.example")

        await _ensure_ldg_catalogue_entry(session)

        await client.post(
            "/vendors/coverage/countries",
            headers=headers,
            json={"vendor_id": coverage_vendor["id"], "country_iso3": ldg["country_iso3"]},
        )
        config = await client.post(
            "/service-delivery-configs",
            headers=headers,
            json={"leg_id": leg_id, "service_code": "LDG", "vendor_id": explicit_vendor["id"], "delivery_channels": ["EMAIL"]},
        )
        assert config.status_code == 201, config.text

        resolved = await client.get(
            f"/service-delivery-configs/resolve?leg_id={leg_id}&service_code=LDG&country_iso3={ldg['country_iso3']}",
            headers=headers,
        )
        assert resolved.json()["matched_scope"] == "LEG"
        assert resolved.json()["config"]["vendor_id"] == explicit_vendor["id"]

    @pytest.mark.asyncio
    async def test_default_template_is_structured_permit_request_shape(self, client, session, trip_leg_fixture):
        """Task #119 — with no MessageTemplate configured, a PERMIT-category
        send falls back to the real A-G structured overflight/landing
        permit request shape, not the GROUND-category handling-request
        default."""
        headers = _auth_headers()
        trip_id, leg_id, ldg = await _create_trip_with_landing_permit(client, trip_leg_fixture, headers)

        await _ensure_ldg_catalogue_entry(session)

        vendor = await _create_vendor_with_contact(client, headers, "EMAIL", "caa-structured@vendor.example")
        config = await client.post(
            "/service-delivery-configs",
            headers=headers,
            json={"leg_id": leg_id, "service_code": "LDG", "vendor_id": vendor["id"], "delivery_channels": ["EMAIL"]},
        )
        assert config.status_code == 201, config.text

        resp = await client.post(
            f"/trips/{trip_id}/legs/{leg_id}/services/send",
            headers=headers,
            json={"items": [{"service_code": "LDG", "icao": ldg["country_iso3"]}]},
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()[0]["sent"] is True, resp.json()

        marker = f"{trip_id}-{leg_id}-LDG-{ldg['country_iso3']}"
        matches = await _latest_messages(marker)
        assert len(matches) == 1, matches
        body = matches[0]["Content"]["Body"]
        assert "A. OPERATOR:" in body
        assert "B. REGISTRY:" in body
        assert "D. ITINERARY:" in body
        assert "F. PURPOSE OF FLIGHT:" in body
        assert "G. CREW:" in body
        assert "1 CREW AND 0 PAX" in body
        assert "LANDING PERMIT REQUEST" in _decoded_subject(matches[0])

    @pytest.mark.asyncio
    async def test_confirming_a_permit_computes_valid_until_from_country_code(self, client, trip_leg_fixture):
        """Exercises _compute_service_valid_until's 3-char (country) branch
        — before task #115 this function only ever received a 4-char ICAO.
        """
        headers = _auth_headers()
        trip_id, leg_id, ldg = await _create_trip_with_landing_permit(client, trip_leg_fixture, headers)

        resp = await client.put(
            f"/trips/{trip_id}/legs/{leg_id}/service-assignments/LDG/{ldg['country_iso3']}",
            headers=headers,
            json={"provider": "JETELIO", "status": "CONFIRMED", "confirmation_number": "CAA-123"},
        )
        assert resp.status_code == 200, resp.text
        confirmed = next(p for p in resp.json()["legs"][0]["permit_assignments"] if p["service_code"] == "LDG")
        assert confirmed["status"] == "CONFIRMED"
        assert confirmed["granted_at"] is not None
        # default_permit_validity_amount/_unit fallback (30 DAYS) applies
        # since this fixture's country has no verified permit_validity_*
        # of its own — still a real computed date, never null just because
        # nothing was configured (§4.12's fallback discipline).
        assert confirmed["valid_until"] is not None

    @pytest.mark.asyncio
    async def test_permit_send_without_any_config_reports_error_not_exception(self, client, trip_leg_fixture):
        headers = _auth_headers()
        trip_id, leg_id, ldg = await _create_trip_with_landing_permit(client, trip_leg_fixture, headers)

        resp = await client.post(
            f"/trips/{trip_id}/legs/{leg_id}/services/send",
            headers=headers,
            json={"items": [{"service_code": "LDG", "icao": ldg["country_iso3"]}]},
        )
        assert resp.status_code == 200, resp.text
        result = resp.json()[0]
        assert result["sent"] is False
        assert "No service delivery config" in result["error"]

    @pytest.mark.asyncio
    async def test_old_snapshot_without_service_code_does_not_500(self, client, session, trip_leg_fixture):
        """Forward-compatibility (§10.2 pattern) — a computed_snapshot
        written before task #115 has no service_code on its permit dicts.
        GET must still succeed; that entry just can't be acted on.
        """
        headers = _auth_headers()
        created = (await client.post("/trips", headers=headers, json=_create_payload(trip_leg_fixture))).json()
        leg_id = created["legs"][0]["id"]

        leg = await session.get(TripLeg, leg_id)
        stripped = copy.deepcopy(leg.computed_snapshot)
        for item in stripped["permits"]["landing_permits"]:
            item.pop("service_code", None)
        leg.computed_snapshot = stripped
        await session.commit()

        resp = await client.get(f"/trips/{created['id']}", headers=headers)
        assert resp.status_code == 200, resp.text
        assert resp.json()["legs"][0]["permit_assignments"] == []
