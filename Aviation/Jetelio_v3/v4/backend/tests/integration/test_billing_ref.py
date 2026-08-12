"""Client/Vendor billing_ref (task #97) — sequence-backed CLI-000123/
VEN-000123, assigned once at creation, never editable.
"""

import uuid

import pytest
import pytest_asyncio

from app.core.security import create_access_token
from app.models.operator import Operator
from app.models.user import UserRole


def _auth_headers(role: UserRole = UserRole.SUPER_ADMIN) -> dict[str, str]:
    token = create_access_token(str(uuid.uuid4()), role.value, extra={"email": "test@example.com"})
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def operator(session):
    op = Operator(name=f"Billing Test Air {uuid.uuid4().hex[:6]}")
    session.add(op)
    await session.commit()
    return op


class TestClientBillingRef:
    @pytest.mark.asyncio
    async def test_assigned_on_create_and_unique_across_clients(self, client, operator):
        headers = _auth_headers()
        first = await client.post(
            "/clients", headers=headers, json={"operator_id": str(operator.id), "bill_to_legal_name": "Client A"}
        )
        second = await client.post(
            "/clients", headers=headers, json={"operator_id": str(operator.id), "bill_to_legal_name": "Client B"}
        )
        assert first.status_code == 201, first.text
        assert second.status_code == 201, second.text

        ref_a = first.json()["billing_ref"]
        ref_b = second.json()["billing_ref"]
        assert ref_a.startswith("CLI-")
        assert ref_b.startswith("CLI-")
        assert ref_a != ref_b

    @pytest.mark.asyncio
    async def test_billing_ref_is_not_editable(self, client, operator):
        headers = _auth_headers()
        created = (
            await client.post(
                "/clients", headers=headers, json={"operator_id": str(operator.id), "bill_to_legal_name": "Client C"}
            )
        ).json()

        resp = await client.patch(
            f"/clients/{created['id']}",
            headers=headers,
            json={"version": created["version"], "billing_ref": "CLI-999999"},
        )
        assert resp.status_code == 422


class TestVendorBillingRef:
    @pytest.mark.asyncio
    async def test_assigned_on_create_and_unique_across_vendors(self, client):
        headers = _auth_headers()
        first = await client.post("/vendors", headers=headers, json={"name": f"Vendor A {uuid.uuid4().hex[:6]}"})
        second = await client.post("/vendors", headers=headers, json={"name": f"Vendor B {uuid.uuid4().hex[:6]}"})
        assert first.status_code == 201, first.text
        assert second.status_code == 201, second.text

        ref_a = first.json()["billing_ref"]
        ref_b = second.json()["billing_ref"]
        assert ref_a.startswith("VEN-")
        assert ref_b.startswith("VEN-")
        assert ref_a != ref_b

    @pytest.mark.asyncio
    async def test_billing_ref_is_not_editable(self, client):
        headers = _auth_headers()
        created = (
            await client.post("/vendors", headers=headers, json={"name": f"Vendor C {uuid.uuid4().hex[:6]}"})
        ).json()

        resp = await client.patch(
            f"/vendors/{created['id']}",
            headers=headers,
            json={"version": created["version"], "billing_ref": "VEN-999999"},
        )
        assert resp.status_code == 422
