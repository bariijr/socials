"""Multi-channel service delivery / confirmation routing (task #86) —
reuses test_trips_api.py's trip-creation fixtures for a real leg_id/trip_id
rather than re-deriving a full geo+aircraft+route setup. Exercises the
CRUD endpoints, the exactly-one-scope validation, and the leg > trip >
operator resolve precedence end to end through the API (the precedence
math itself is already covered by tests/unit/domain/test_service_delivery.py).
"""

import uuid

import pytest
import pytest_asyncio

from app.core.security import create_access_token
from app.models.operator import Operator
from app.models.vendor import Vendor
from tests.integration.test_trips_api import _auth_headers, _create_payload, trip_leg_fixture  # noqa: F401


@pytest_asyncio.fixture
async def vendor_and_operator(session):
    vendor = Vendor(name=f"Fuel Co {uuid.uuid4().hex[:6]}", billing_ref=f"VEN-{uuid.uuid4().hex[:6]}")
    operator = Operator(name=f"Test Air {uuid.uuid4().hex[:6]}")
    session.add_all([vendor, operator])
    await session.commit()
    return {"vendor": vendor, "operator": operator}


class TestVendorContacts:
    @pytest.mark.asyncio
    async def test_create_list_update_delete_round_trip(self, client, vendor_and_operator):
        headers = _auth_headers()
        vendor_id = str(vendor_and_operator["vendor"].id)

        create = await client.post(
            "/vendor-contacts", headers=headers,
            json={"vendor_id": vendor_id, "channel": "EMAIL", "contact_value": "ops@fuelco.example", "is_primary": True},
        )
        assert create.status_code == 201, create.text
        contact = create.json()
        assert contact["channel"] == "EMAIL"

        listing = await client.get("/vendor-contacts", headers=headers, params={"vendor_id": vendor_id})
        assert listing.status_code == 200
        assert listing.json()["total"] == 1

        update = await client.patch(
            f"/vendor-contacts/{contact['id']}", headers=headers,
            json={"version": contact["version"], "contact_value": "dispatch@fuelco.example"},
        )
        assert update.status_code == 200, update.text
        assert update.json()["contact_value"] == "dispatch@fuelco.example"

        delete = await client.delete(
            f"/vendor-contacts/{contact['id']}", headers=headers, params={"version": update.json()["version"]}
        )
        assert delete.status_code == 204

        listing_after = await client.get("/vendor-contacts", headers=headers, params={"vendor_id": vendor_id})
        assert listing_after.json()["total"] == 0


class TestServiceDeliveryConfigResolve:
    @pytest.mark.asyncio
    async def test_exactly_one_scope_is_enforced(self, client, vendor_and_operator):
        headers = _auth_headers()
        vendor_id = str(vendor_and_operator["vendor"].id)

        no_scope = await client.post(
            "/service-delivery-configs", headers=headers,
            json={"vendor_id": vendor_id, "delivery_channels": ["EMAIL"]},
        )
        assert no_scope.status_code == 422

        operator_id = str(vendor_and_operator["operator"].id)
        two_scopes = await client.post(
            "/service-delivery-configs", headers=headers,
            json={"vendor_id": vendor_id, "operator_id": operator_id, "trip_id": str(uuid.uuid4()), "delivery_channels": ["EMAIL"]},
        )
        assert two_scopes.status_code == 422

    @pytest.mark.asyncio
    async def test_resolve_returns_null_when_nothing_configured(self, client, trip_leg_fixture):
        headers = _auth_headers()
        created = (await client.post("/trips", headers=headers, json=_create_payload(trip_leg_fixture))).json()
        leg_id = created["legs"][0]["id"]

        resolved = await client.get(
            "/service-delivery-configs/resolve", headers=headers,
            params={"leg_id": leg_id, "service_code": trip_leg_fixture["service_code"]},
        )
        assert resolved.status_code == 200
        # fallback_vendor_id (task #115) is a real field now too — no
        # VendorCoverageCountry row exists for this fixture's country
        # either, so it stays null, same honest "nothing resolved" result.
        assert resolved.json() == {"config": None, "matched_scope": None, "fallback_vendor_id": None}

    @pytest.mark.asyncio
    async def test_leg_scoped_config_beats_operator_scoped_config(self, client, trip_leg_fixture, vendor_and_operator):
        headers = _auth_headers()
        vendor_id = str(vendor_and_operator["vendor"].id)
        operator_id = str(vendor_and_operator["operator"].id)
        service_code = trip_leg_fixture["service_code"]

        created = (await client.post("/trips", headers=headers, json=_create_payload(trip_leg_fixture))).json()
        leg_id = created["legs"][0]["id"]

        operator_config = await client.post(
            "/service-delivery-configs", headers=headers,
            json={"operator_id": operator_id, "vendor_id": vendor_id, "delivery_channels": ["EMAIL"]},
        )
        assert operator_config.status_code == 201, operator_config.text

        leg_config = await client.post(
            "/service-delivery-configs", headers=headers,
            json={"leg_id": leg_id, "service_code": service_code, "vendor_id": vendor_id, "delivery_channels": ["SITA", "ARINC"]},
        )
        assert leg_config.status_code == 201, leg_config.text

        resolved = await client.get(
            "/service-delivery-configs/resolve", headers=headers,
            params={"leg_id": leg_id, "service_code": service_code, "operator_id": operator_id},
        )
        assert resolved.status_code == 200
        body = resolved.json()
        assert body["matched_scope"] == "LEG"
        assert body["config"]["id"] == leg_config.json()["id"]
        assert body["config"]["delivery_channels"] == ["SITA", "ARINC"]

    @pytest.mark.asyncio
    async def test_resolve_unknown_leg_404s(self, client):
        headers = _auth_headers()
        resp = await client.get(
            "/service-delivery-configs/resolve", headers=headers,
            params={"leg_id": "00000000-0000-0000-0000-000000000000", "service_code": "FUL"},
        )
        assert resp.status_code == 404


class TestConfirmationRoutingConfigResolve:
    @pytest.mark.asyncio
    async def test_trip_scoped_config_beats_operator_scoped_config(self, client, trip_leg_fixture, vendor_and_operator):
        headers = _auth_headers()
        operator_id = str(vendor_and_operator["operator"].id)

        created = (await client.post("/trips", headers=headers, json=_create_payload(trip_leg_fixture))).json()
        leg_id = created["legs"][0]["id"]
        trip_id = created["id"]

        operator_config = await client.post(
            "/confirmation-routing-configs", headers=headers,
            json={"operator_id": operator_id, "target_role": "DISPATCH", "confirmation_channels": ["EMAIL"]},
        )
        assert operator_config.status_code == 201, operator_config.text

        trip_config = await client.post(
            "/confirmation-routing-configs", headers=headers,
            json={"trip_id": trip_id, "target_role": "DISPATCH", "confirmation_channels": ["WHATSAPP"], "target_contact_override": "+255000000"},
        )
        assert trip_config.status_code == 201, trip_config.text

        resolved = await client.get(
            "/confirmation-routing-configs/resolve", headers=headers,
            params={"leg_id": leg_id, "target_role": "DISPATCH", "operator_id": operator_id},
        )
        assert resolved.status_code == 200
        body = resolved.json()
        assert body["matched_scope"] == "TRIP"
        assert body["config"]["id"] == trip_config.json()["id"]

    @pytest.mark.asyncio
    async def test_different_target_role_never_matches(self, client, trip_leg_fixture, vendor_and_operator):
        headers = _auth_headers()
        operator_id = str(vendor_and_operator["operator"].id)

        created = (await client.post("/trips", headers=headers, json=_create_payload(trip_leg_fixture))).json()
        leg_id = created["legs"][0]["id"]

        await client.post(
            "/confirmation-routing-configs", headers=headers,
            json={"operator_id": operator_id, "target_role": "CREW", "confirmation_channels": ["SMS"]},
        )

        resolved = await client.get(
            "/confirmation-routing-configs/resolve", headers=headers,
            params={"leg_id": leg_id, "target_role": "DISPATCH", "operator_id": operator_id},
        )
        assert resolved.status_code == 200
        assert resolved.json() == {"config": None, "matched_scope": None}
