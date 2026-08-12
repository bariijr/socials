"""Party + PartyRole — the additive grouping layer over Operator/Client/
Vendor (task #89). Nothing about the underlying tables changes; this only
tests the new linking behavior: one Party can hold multiple roles, a given
Operator/Client/Vendor row can only be linked from one PartyRole, and
AGENT/WALK_IN roles (no backing table) reject being given a link.
"""

import uuid

import pytest
import pytest_asyncio

from app.core.security import create_access_token
from app.models.operator import Operator
from app.models.user import UserRole
from app.models.vendor import Vendor


def _auth_headers(role: UserRole = UserRole.SUPER_ADMIN) -> dict[str, str]:
    token = create_access_token(str(uuid.uuid4()), role.value, extra={"email": "test@example.com"})
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def operator_and_vendor(session):
    operator = Operator(name=f"Fireblade Ops {uuid.uuid4().hex[:6]}")
    vendor = Vendor(name=f"Fireblade Handling {uuid.uuid4().hex[:6]}", billing_ref=f"VEN-{uuid.uuid4().hex[:6]}")
    session.add_all([operator, vendor])
    await session.commit()
    return {"operator": operator, "vendor": vendor}


class TestPartyRoles:
    @pytest.mark.asyncio
    async def test_one_party_groups_an_operator_and_a_vendor_role(self, client, operator_and_vendor):
        headers = _auth_headers()
        g = operator_and_vendor

        party_resp = await client.post("/parties", headers=headers, json={"name": "Fireblade"})
        assert party_resp.status_code == 201, party_resp.text
        party_id = party_resp.json()["id"]

        op_role = await client.post(
            "/party-roles", headers=headers,
            json={"party_id": party_id, "role": "OPERATOR", "operator_id": str(g["operator"].id)},
        )
        assert op_role.status_code == 201, op_role.text
        assert op_role.json()["linked_name"] == g["operator"].name

        vendor_role = await client.post(
            "/party-roles", headers=headers,
            json={"party_id": party_id, "role": "VENDOR", "vendor_id": str(g["vendor"].id)},
        )
        assert vendor_role.status_code == 201, vendor_role.text
        assert vendor_role.json()["linked_name"] == g["vendor"].name

        detail = await client.get(f"/parties/{party_id}", headers=headers)
        assert detail.status_code == 200
        roles = detail.json()["roles"]
        assert len(roles) == 2
        assert {r["role"] for r in roles} == {"OPERATOR", "VENDOR"}

    @pytest.mark.asyncio
    async def test_same_operator_cannot_be_linked_to_two_parties(self, client, operator_and_vendor):
        headers = _auth_headers()
        operator_id = str(operator_and_vendor["operator"].id)

        party_a = (await client.post("/parties", headers=headers, json={"name": "Party A"})).json()
        party_b = (await client.post("/parties", headers=headers, json={"name": "Party B"})).json()

        first = await client.post(
            "/party-roles", headers=headers, json={"party_id": party_a["id"], "role": "OPERATOR", "operator_id": operator_id}
        )
        assert first.status_code == 201

        second = await client.post(
            "/party-roles", headers=headers, json={"party_id": party_b["id"], "role": "OPERATOR", "operator_id": operator_id}
        )
        assert second.status_code >= 400

    @pytest.mark.asyncio
    async def test_operator_role_requires_exactly_one_link(self, client):
        headers = _auth_headers()
        party = (await client.post("/parties", headers=headers, json={"name": "No Link Co"})).json()

        resp = await client.post("/party-roles", headers=headers, json={"party_id": party["id"], "role": "OPERATOR"})
        assert resp.status_code == 422, resp.text

    @pytest.mark.asyncio
    async def test_agent_role_rejects_a_link(self, client, operator_and_vendor):
        headers = _auth_headers()
        party = (await client.post("/parties", headers=headers, json={"name": "Agent Co"})).json()

        resp = await client.post(
            "/party-roles", headers=headers,
            json={"party_id": party["id"], "role": "AGENT", "operator_id": str(operator_and_vendor["operator"].id)},
        )
        assert resp.status_code == 422, resp.text

    @pytest.mark.asyncio
    async def test_agent_role_with_no_link_succeeds(self, client):
        headers = _auth_headers()
        party = (await client.post("/parties", headers=headers, json={"name": "Agent Co"})).json()

        resp = await client.post("/party-roles", headers=headers, json={"party_id": party["id"], "role": "AGENT", "notes": "Local ground agent"})
        assert resp.status_code == 201, resp.text
        assert resp.json()["linked_name"] is None
