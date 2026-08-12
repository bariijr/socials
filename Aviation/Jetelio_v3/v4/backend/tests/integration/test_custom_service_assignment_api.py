""""Add more sub-services" (task #105) — a manually-added service line item
beyond what the engine generated from service_requirements. Reuses
test_trips_api.py's trip-creation fixtures for a real leg.
"""

import uuid

import pytest
import pytest_asyncio

from app.models.service_catalogue import ServiceCatalogueEntry, ServiceCategory, ServiceLevel
from tests.integration.test_trips_api import _auth_headers, _create_payload, trip_leg_fixture  # noqa: F401


@pytest_asyncio.fixture
async def sub_service(session):
    code = f"GH-{uuid.uuid4().hex[:4].upper()}"
    entry = ServiceCatalogueEntry(code=code, name="Ground Power Unit", category=ServiceCategory.GROUND, level=ServiceLevel.SUB_SERVICE)
    session.add(entry)
    await session.commit()
    return entry


class TestAddCustomServiceAssignment:
    @pytest.mark.asyncio
    async def test_add_succeeds_and_shows_as_manual(self, client, trip_leg_fixture, sub_service):
        headers = _auth_headers()
        created = (await client.post("/trips", headers=headers, json=_create_payload(trip_leg_fixture))).json()
        trip_id, leg_id = created["id"], created["legs"][0]["id"]
        dep_icao = created["legs"][0]["result"]["dep_icao"]

        resp = await client.post(
            f"/trips/{trip_id}/legs/{leg_id}/services/custom",
            headers=headers,
            json={"service_code": sub_service.code, "icao": dep_icao},
        )
        assert resp.status_code == 201, resp.text
        added = next(
            s for s in resp.json()["legs"][0]["service_assignments"] if s["service_code"] == sub_service.code and s["icao"] == dep_icao
        )
        assert added["manual"] is True
        assert added["service_name"] == "Ground Power Unit"
        assert added["status"] == "PENDING"

    @pytest.mark.asyncio
    async def test_add_already_auto_generated_code_conflicts(self, client, trip_leg_fixture):
        headers = _auth_headers()
        created = (await client.post("/trips", headers=headers, json=_create_payload(trip_leg_fixture))).json()
        trip_id, leg_id = created["id"], created["legs"][0]["id"]
        existing = created["legs"][0]["service_assignments"][0]

        resp = await client.post(
            f"/trips/{trip_id}/legs/{leg_id}/services/custom",
            headers=headers,
            json={"service_code": existing["service_code"], "icao": existing["icao"]},
        )
        assert resp.status_code == 409

    @pytest.mark.asyncio
    async def test_add_unknown_service_code_fails_validation(self, client, trip_leg_fixture):
        headers = _auth_headers()
        created = (await client.post("/trips", headers=headers, json=_create_payload(trip_leg_fixture))).json()
        trip_id, leg_id = created["id"], created["legs"][0]["id"]
        dep_icao = created["legs"][0]["result"]["dep_icao"]

        resp = await client.post(
            f"/trips/{trip_id}/legs/{leg_id}/services/custom",
            headers=headers,
            json={"service_code": "NOT-A-REAL-CODE", "icao": dep_icao},
        )
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_add_with_icao_not_on_leg_fails_validation(self, client, trip_leg_fixture, sub_service):
        headers = _auth_headers()
        created = (await client.post("/trips", headers=headers, json=_create_payload(trip_leg_fixture))).json()
        trip_id, leg_id = created["id"], created["legs"][0]["id"]

        resp = await client.post(
            f"/trips/{trip_id}/legs/{leg_id}/services/custom",
            headers=headers,
            json={"service_code": sub_service.code, "icao": "ZZZZ"},
        )
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_remove_manual_entry(self, client, trip_leg_fixture, sub_service):
        headers = _auth_headers()
        created = (await client.post("/trips", headers=headers, json=_create_payload(trip_leg_fixture))).json()
        trip_id, leg_id = created["id"], created["legs"][0]["id"]
        dep_icao = created["legs"][0]["result"]["dep_icao"]

        await client.post(
            f"/trips/{trip_id}/legs/{leg_id}/services/custom", headers=headers, json={"service_code": sub_service.code, "icao": dep_icao}
        )
        removed = await client.delete(f"/trips/{trip_id}/legs/{leg_id}/services/custom/{sub_service.code}/{dep_icao}", headers=headers)
        assert removed.status_code == 200, removed.text
        assert not any(
            s["service_code"] == sub_service.code and s["icao"] == dep_icao for s in removed.json()["legs"][0]["service_assignments"]
        )

    @pytest.mark.asyncio
    async def test_cannot_remove_an_auto_generated_entry(self, client, trip_leg_fixture):
        headers = _auth_headers()
        created = (await client.post("/trips", headers=headers, json=_create_payload(trip_leg_fixture))).json()
        trip_id, leg_id = created["id"], created["legs"][0]["id"]
        existing = created["legs"][0]["service_assignments"][0]

        resp = await client.delete(
            f"/trips/{trip_id}/legs/{leg_id}/services/custom/{existing['service_code']}/{existing['icao']}", headers=headers
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_updating_a_manual_entry_preserves_manual_flag_and_name(self, client, trip_leg_fixture, sub_service):
        headers = _auth_headers()
        created = (await client.post("/trips", headers=headers, json=_create_payload(trip_leg_fixture))).json()
        trip_id, leg_id = created["id"], created["legs"][0]["id"]
        dep_icao = created["legs"][0]["result"]["dep_icao"]

        await client.post(
            f"/trips/{trip_id}/legs/{leg_id}/services/custom", headers=headers, json={"service_code": sub_service.code, "icao": dep_icao}
        )
        updated = await client.put(
            f"/trips/{trip_id}/legs/{leg_id}/service-assignments/{sub_service.code}/{dep_icao}",
            headers=headers,
            json={"provider": "THIRD_PARTY", "status": "PENDING"},
        )
        assert updated.status_code == 200, updated.text
        row = next(
            s for s in updated.json()["legs"][0]["service_assignments"] if s["service_code"] == sub_service.code and s["icao"] == dep_icao
        )
        assert row["manual"] is True
        assert row["service_name"] == "Ground Power Unit"
        assert row["provider"] == "THIRD_PARTY"
