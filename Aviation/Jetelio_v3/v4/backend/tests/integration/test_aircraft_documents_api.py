"""Aircraft document upload/download/delete — needs real MinIO (reachable
from the api-test service, see docker-compose.yml S3_ENDPOINT_URL) since
app.core.storage talks to it directly, not a mock.
"""

import uuid

import pytest
import pytest_asyncio

from app.core.security import create_access_token
from app.models.aircraft import Aircraft, AircraftPerformance
from app.models.operator import Operator
from app.models.user import UserRole


def _auth_headers(role: UserRole = UserRole.SUPER_ADMIN) -> dict[str, str]:
    token = create_access_token(str(uuid.uuid4()), role.value, extra={"email": "test@example.com"})
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def aircraft_fixture(session):
    icao_type = f"T{uuid.uuid4().hex[:6]}".upper()
    session.add(AircraftPerformance(icao_type=icao_type, max_range_nm=3000))
    operator = Operator(name="Test Operator")
    session.add(operator)
    await session.flush()

    registration = f"N{uuid.uuid4().hex[:5]}".upper()
    aircraft = Aircraft(registration=registration, icao_type=icao_type, operator_id=operator.id)
    session.add(aircraft)
    # client uses a separate DB connection than `session` — must commit,
    # not just flush, for the HTTP-request-side session to see this row
    # (same pattern as tests/integration/test_trips_api.py's fixtures).
    await session.commit()
    return aircraft


class TestAircraftDocuments:
    @pytest.mark.asyncio
    async def test_upload_list_download_delete_round_trip(self, client, aircraft_fixture):
        headers = _auth_headers()
        aircraft_id = str(aircraft_fixture.id)

        upload_resp = await client.post(
            f"/aircraft/{aircraft_id}/documents",
            headers=headers,
            data={"doc_type": "INSURANCE", "expiry_date": "2027-01-01"},
            files={"file": ("insurance.pdf", b"%PDF-1.4 test content", "application/pdf")},
        )
        assert upload_resp.status_code == 201, upload_resp.text
        doc = upload_resp.json()
        assert doc["filename"] == "insurance.pdf"
        assert doc["doc_type"] == "INSURANCE"
        assert doc["file_size_bytes"] == len(b"%PDF-1.4 test content")

        list_resp = await client.get(f"/aircraft/{aircraft_id}/documents", headers=headers)
        assert list_resp.status_code == 200
        assert len(list_resp.json()) == 1

        download_resp = await client.get(f"/aircraft/{aircraft_id}/documents/{doc['id']}/download", headers=headers)
        assert download_resp.status_code == 200
        assert download_resp.content == b"%PDF-1.4 test content"

        delete_resp = await client.delete(f"/aircraft/{aircraft_id}/documents/{doc['id']}", headers=headers)
        assert delete_resp.status_code == 204

        list_after = await client.get(f"/aircraft/{aircraft_id}/documents", headers=headers)
        assert list_after.json() == []

    @pytest.mark.asyncio
    async def test_upload_requires_write_access(self, client, aircraft_fixture):
        headers = _auth_headers(UserRole.AUDITOR)
        resp = await client.post(
            f"/aircraft/{aircraft_fixture.id}/documents",
            headers=headers,
            data={"doc_type": "OTHER"},
            files={"file": ("x.pdf", b"data", "application/pdf")},
        )
        assert resp.status_code == 403

    @pytest.mark.asyncio
    async def test_upload_to_unknown_aircraft_404s(self, client):
        headers = _auth_headers()
        resp = await client.post(
            f"/aircraft/{uuid.uuid4()}/documents",
            headers=headers,
            data={"doc_type": "OTHER"},
            files={"file": ("x.pdf", b"data", "application/pdf")},
        )
        assert resp.status_code == 404
