"""Document (polymorphic Person/Party documents, task #89) — needs real
MinIO, same as test_aircraft_documents_api.py. Confirms this is genuinely
additive: AircraftDocument's own table/tests are untouched, this covers
only the new Person/Party entity types.
"""

import uuid

import pytest
import pytest_asyncio

from app.core.security import create_access_token
from app.models.person import Person
from app.models.user import UserRole


def _auth_headers(role: UserRole = UserRole.SUPER_ADMIN) -> dict[str, str]:
    token = create_access_token(str(uuid.uuid4()), role.value, extra={"email": "test@example.com"})
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def person_fixture(session):
    person = Person(full_name=f"Test Pilot {uuid.uuid4().hex[:6]}")
    session.add(person)
    await session.commit()
    return person


class TestDocumentTypeTemplates:
    @pytest.mark.asyncio
    async def test_seeded_templates_are_listed(self, client):
        headers = _auth_headers()
        resp = await client.get("/document-type-templates", headers=headers)
        assert resp.status_code == 200
        doc_types = {t["doc_type"] for t in resp.json()}
        assert {"PILOT_LICENSE", "MEDICAL_CERTIFICATE", "PASSPORT", "OPERATOR_CERTIFICATE"} <= doc_types


class TestPersonDocuments:
    @pytest.mark.asyncio
    async def test_upload_list_download_verify_delete_round_trip(self, client, person_fixture):
        headers = _auth_headers()
        person_id = str(person_fixture.id)

        upload = await client.post(
            f"/documents/PERSON/{person_id}", headers=headers,
            data={"doc_type": "PASSPORT"},
            files={"file": ("passport.pdf", b"%PDF-1.4 passport bytes", "application/pdf")},
        )
        assert upload.status_code == 201, upload.text
        doc = upload.json()
        assert doc["status"] == "PENDING_VERIFICATION"
        assert doc["ocr_raw_output"] is None
        assert doc["extracted_fields"] is None

        listing = await client.get(f"/documents/PERSON/{person_id}", headers=headers)
        assert listing.status_code == 200
        assert len(listing.json()) == 1

        download = await client.get(f"/documents/PERSON/{person_id}/{doc['id']}/download", headers=headers)
        assert download.status_code == 200
        assert download.content == b"%PDF-1.4 passport bytes"

        verify = await client.post(
            f"/documents/PERSON/{person_id}/{doc['id']}/verify", headers=headers,
            json={"version": doc["version"], "status": "VERIFIED", "verified_by": "Ops Admin"},
        )
        assert verify.status_code == 200, verify.text
        assert verify.json()["status"] == "VERIFIED"
        assert verify.json()["verified_by"] == "Ops Admin"

        delete = await client.delete(f"/documents/PERSON/{person_id}/{doc['id']}", headers=headers)
        assert delete.status_code == 204

        after = await client.get(f"/documents/PERSON/{person_id}", headers=headers)
        assert after.json() == []

    @pytest.mark.asyncio
    async def test_doc_type_for_wrong_entity_type_is_rejected(self, client, person_fixture):
        headers = _auth_headers()
        # OPERATOR_CERTIFICATE applies to PARTY, not PERSON.
        resp = await client.post(
            f"/documents/PERSON/{person_fixture.id}", headers=headers,
            data={"doc_type": "OPERATOR_CERTIFICATE"},
            files={"file": ("cert.pdf", b"data", "application/pdf")},
        )
        assert resp.status_code == 422, resp.text

    @pytest.mark.asyncio
    async def test_unknown_doc_type_is_rejected(self, client, person_fixture):
        headers = _auth_headers()
        resp = await client.post(
            f"/documents/PERSON/{person_fixture.id}", headers=headers,
            data={"doc_type": "NOT_A_REAL_TYPE"},
            files={"file": ("x.pdf", b"data", "application/pdf")},
        )
        assert resp.status_code == 422, resp.text

    @pytest.mark.asyncio
    async def test_upload_to_unknown_person_404s(self, client):
        headers = _auth_headers()
        resp = await client.post(
            f"/documents/PERSON/{uuid.uuid4()}", headers=headers,
            data={"doc_type": "PASSPORT"},
            files={"file": ("x.pdf", b"data", "application/pdf")},
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_upload_requires_write_access(self, client, person_fixture):
        headers = _auth_headers(UserRole.AUDITOR)
        resp = await client.post(
            f"/documents/PERSON/{person_fixture.id}", headers=headers,
            data={"doc_type": "PASSPORT"},
            files={"file": ("x.pdf", b"data", "application/pdf")},
        )
        assert resp.status_code == 403


class TestCredentials:
    @pytest.mark.asyncio
    async def test_add_ratings_to_a_license_document(self, client, person_fixture):
        headers = _auth_headers()
        upload = await client.post(
            f"/documents/PERSON/{person_fixture.id}", headers=headers,
            data={"doc_type": "PILOT_LICENSE"},
            files={"file": ("license.pdf", b"license bytes", "application/pdf")},
        )
        document_id = upload.json()["id"]

        rating_a = await client.post(
            "/credentials", headers=headers, json={"document_id": document_id, "rating_code": "B737"}
        )
        assert rating_a.status_code == 201, rating_a.text
        rating_b = await client.post(
            "/credentials", headers=headers, json={"document_id": document_id, "rating_code": "A320"}
        )
        assert rating_b.status_code == 201

        listing = await client.get(f"/credentials?document_id={document_id}", headers=headers)
        assert listing.status_code == 200
        assert {r["rating_code"] for r in listing.json()} == {"B737", "A320"}

        update = await client.patch(
            f"/credentials/{rating_a.json()['id']}", headers=headers,
            json={"version": rating_a.json()["version"], "rating_name": "Boeing 737 Type Rating"},
        )
        assert update.status_code == 200
        assert update.json()["rating_name"] == "Boeing 737 Type Rating"

        delete = await client.delete(f"/credentials/{rating_b.json()['id']}?version={rating_b.json()['version']}", headers=headers)
        assert delete.status_code == 204
