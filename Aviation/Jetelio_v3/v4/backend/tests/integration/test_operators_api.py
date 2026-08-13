"""Operator merge (task #132) — folding a duplicate operator record (e.g.
"XYZ Aviation Inc" vs "XYZ aviatio, Inc") into a survivor. Real risk here:
six tables get FK-reassigned, one of them (PartyRole) has a unique
constraint on operator_id that a naive bulk UPDATE would violate, and a
merge is destructive enough that getting the reassignment wrong loses real
operational data silently. These tests exercise the real endpoint against
real rows in all six referencing tables, not just the two Operator rows.
"""

import uuid

import pytest
import pytest_asyncio

from app.core.security import create_access_token
from app.models.aircraft import Aircraft, AircraftPerformance
from app.models.client import Client
from app.models.operator import Operator
from app.models.service_delivery import ConfirmationRoutingConfig, ServiceDeliveryConfig
from app.models.user import User, UserRole
from app.models.vendor import Vendor


def _auth_headers(role: UserRole = UserRole.SUPER_ADMIN) -> dict[str, str]:
    token = create_access_token(str(uuid.uuid4()), role.value, extra={"email": "test@example.com"})
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def two_operators(session):
    keep = Operator(name=f"XYZ Aviation Inc {uuid.uuid4().hex[:6]}", occ_email=None, billing_email="ops@xyz.example")
    duplicate = Operator(name=f"XYZ aviatio, Inc {uuid.uuid4().hex[:6]}", occ_email="dupe@xyz.example", billing_email="old@xyz.example")
    session.add_all([keep, duplicate])
    await session.commit()
    return {"keep": keep, "duplicate": duplicate}


class TestOperatorMerge:
    @pytest.mark.asyncio
    async def test_merge_reassigns_fleet_and_clients_and_backfills_blank_fields(self, client, session, two_operators):
        g = two_operators
        icao_type = f"T{uuid.uuid4().hex[:6]}".upper()
        # Deliberately not "Gulfstream"/"G650" — test_trip_chat_service.py's
        # chat_fixture_data uses that exact manufacturer/model_series and
        # asserts a text search for "G650" resolves to *its own* row; a
        # second row sharing those values makes that match ambiguous
        # whenever both tests' fixtures are alive in the same test-DB run.
        session.add(AircraftPerformance(icao_type=icao_type, manufacturer="Textron", model_series="Merge-Test-Type"))
        await session.commit()

        aircraft = Aircraft(registration=f"N{uuid.uuid4().hex[:5]}".upper(), icao_type=icao_type, operator_id=g["duplicate"].id)
        client_row = Client(
            billing_ref=f"CLI-{uuid.uuid4().hex[:6]}", operator_id=g["duplicate"].id, bill_to_legal_name="XYZ Aviation Inc"
        )
        session.add_all([aircraft, client_row])
        await session.commit()

        resp = await client.post(
            f"/operators/{g['keep'].id}/merge",
            headers=_auth_headers(),
            json={"duplicate_operator_id": str(g["duplicate"].id), "keep_version": g["keep"].version, "duplicate_version": g["duplicate"].version},
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()

        assert body["reassigned"]["aircraft"] == 1
        assert body["reassigned"]["clients"] == 1
        # keep's occ_email was blank, duplicate's real value got backfilled;
        # keep's billing_email was already set and must NOT be overwritten.
        assert body["kept"]["occ_email"] == "dupe@xyz.example"
        assert body["kept"]["billing_email"] == "ops@xyz.example"
        assert "occ_email" in body["fields_backfilled"]
        assert "billing_email" not in body["fields_backfilled"]

        await session.refresh(aircraft)
        await session.refresh(client_row)
        assert aircraft.operator_id == g["keep"].id
        assert client_row.operator_id == g["keep"].id

        # Duplicate must be soft-deleted, not hard-deleted or left active.
        dup_check = await client.get(f"/operators/{g['duplicate'].id}", headers=_auth_headers())
        assert dup_check.status_code == 404

    @pytest.mark.asyncio
    async def test_merge_reassigns_service_delivery_and_confirmation_configs_and_users(self, client, session, two_operators):
        g = two_operators
        vendor = Vendor(name=f"Test Handler {uuid.uuid4().hex[:6]}", billing_ref=f"VEN-{uuid.uuid4().hex[:6]}")
        session.add(vendor)
        await session.flush()

        delivery_cfg = ServiceDeliveryConfig(operator_id=g["duplicate"].id, vendor_id=vendor.id, delivery_channels=["EMAIL"])
        confirm_cfg = ConfirmationRoutingConfig(operator_id=g["duplicate"].id, target_role="DISPATCH", confirmation_channels=["EMAIL"])
        portal_user = User(
            email=f"portal-{uuid.uuid4().hex[:6]}@xyz.example",
            full_name="Portal User",
            hashed_password="not-a-real-hash",
            role=UserRole.CLIENT_VIEW,
            operator_id=g["duplicate"].id,
        )
        session.add_all([delivery_cfg, confirm_cfg, portal_user])
        await session.commit()

        resp = await client.post(
            f"/operators/{g['keep'].id}/merge",
            headers=_auth_headers(),
            json={"duplicate_operator_id": str(g["duplicate"].id), "keep_version": g["keep"].version, "duplicate_version": g["duplicate"].version},
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["reassigned"]["service_delivery_configs"] == 1
        assert body["reassigned"]["confirmation_routing_configs"] == 1
        assert body["reassigned"]["users"] == 1

        await session.refresh(delivery_cfg)
        await session.refresh(confirm_cfg)
        await session.refresh(portal_user)
        assert delivery_cfg.operator_id == g["keep"].id
        assert confirm_cfg.operator_id == g["keep"].id
        assert portal_user.operator_id == g["keep"].id

    @pytest.mark.asyncio
    async def test_duplicate_party_role_is_retired_not_reassigned_when_keep_already_has_one(self, client, two_operators):
        # PartyRole.operator_id is 1:1 — a naive reassign would violate that
        # unique constraint. Both sides already grouped under a Party.
        g = two_operators
        headers = _auth_headers()

        keep_party = await client.post("/parties", headers=headers, json={"name": "XYZ Aviation Group"})
        dup_party = await client.post("/parties", headers=headers, json={"name": "XYZ (dup) Group"})
        assert keep_party.status_code == 201 and dup_party.status_code == 201

        keep_role = await client.post(
            "/party-roles", headers=headers,
            json={"party_id": keep_party.json()["id"], "role": "OPERATOR", "operator_id": str(g["keep"].id)},
        )
        dup_role = await client.post(
            "/party-roles", headers=headers,
            json={"party_id": dup_party.json()["id"], "role": "OPERATOR", "operator_id": str(g["duplicate"].id)},
        )
        assert keep_role.status_code == 201 and dup_role.status_code == 201, (keep_role.text, dup_role.text)

        resp = await client.post(
            f"/operators/{g['keep'].id}/merge",
            headers=headers,
            json={"duplicate_operator_id": str(g["duplicate"].id), "keep_version": g["keep"].version, "duplicate_version": g["duplicate"].version},
        )
        assert resp.status_code == 200, resp.text
        # Retired (soft-deleted), not reassigned — reassigned count is 0.
        assert resp.json()["reassigned"]["party_roles"] == 0

        dup_party_detail = await client.get(f"/parties/{dup_party.json()['id']}", headers=headers)
        assert dup_party_detail.status_code == 200
        assert dup_party_detail.json()["roles"] == []

        keep_party_detail = await client.get(f"/parties/{keep_party.json()['id']}", headers=headers)
        assert len(keep_party_detail.json()["roles"]) == 1

    @pytest.mark.asyncio
    async def test_duplicate_party_role_is_reassigned_when_keep_has_none(self, client, two_operators):
        g = two_operators
        headers = _auth_headers()

        party = await client.post("/parties", headers=headers, json={"name": "XYZ (dup) Group"})
        assert party.status_code == 201
        role = await client.post(
            "/party-roles", headers=headers,
            json={"party_id": party.json()["id"], "role": "OPERATOR", "operator_id": str(g["duplicate"].id)},
        )
        assert role.status_code == 201, role.text

        resp = await client.post(
            f"/operators/{g['keep'].id}/merge",
            headers=headers,
            json={"duplicate_operator_id": str(g["duplicate"].id), "keep_version": g["keep"].version, "duplicate_version": g["duplicate"].version},
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["reassigned"]["party_roles"] == 1

        party_detail = await client.get(f"/parties/{party.json()['id']}", headers=headers)
        assert party_detail.json()["roles"][0]["operator_id"] == str(g["keep"].id)

    @pytest.mark.asyncio
    async def test_cannot_merge_operator_into_itself(self, client, two_operators):
        g = two_operators
        resp = await client.post(
            f"/operators/{g['keep'].id}/merge",
            headers=_auth_headers(),
            json={"duplicate_operator_id": str(g["keep"].id), "keep_version": g["keep"].version, "duplicate_version": g["keep"].version},
        )
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_stale_version_is_rejected(self, client, two_operators):
        g = two_operators
        resp = await client.post(
            f"/operators/{g['keep'].id}/merge",
            headers=_auth_headers(),
            json={"duplicate_operator_id": str(g["duplicate"].id), "keep_version": g["keep"].version + 1, "duplicate_version": g["duplicate"].version},
        )
        assert resp.status_code == 409

    @pytest.mark.asyncio
    async def test_operations_specialist_cannot_merge(self, client, two_operators):
        g = two_operators
        resp = await client.post(
            f"/operators/{g['keep'].id}/merge",
            headers=_auth_headers(UserRole.OPERATIONS_SPECIALIST),
            json={"duplicate_operator_id": str(g["duplicate"].id), "keep_version": g["keep"].version, "duplicate_version": g["duplicate"].version},
        )
        assert resp.status_code == 403
