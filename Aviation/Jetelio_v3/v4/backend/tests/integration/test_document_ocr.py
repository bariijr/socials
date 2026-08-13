"""Task #109 — real Tesseract OCR against an uploaded Document. Calls the
DI'd app.services.ocr_service.run_document_ocr(session, document_id)
directly against the test's own session fixture — not via Celery, and not
via run_document_ocr_standalone (which opens app.database.AsyncSessionLocal,
bound to DATABASE_URL/the real dev DB, not TEST_DATABASE_URL — it would
never find a document created through the test fixtures).

The two no-op-path tests create their Document via document_service
directly rather than the HTTP upload endpoint, deliberately bypassing the
router's own best-effort `.delay()` dispatch (app/api/routers/documents.py)
— under a full docker-compose stack, redis/worker are real and reachable,
so a real background OCR run could fire for the uploaded document. It's
harmless either way (the standalone worker path looks the document up in
the real dev DB, not the test DB, so it can never actually find these
test-only rows), but going straight through document_service keeps these
two tests focused on run_document_ocr's own no-op paths. The positive-path
test does go through the real HTTP endpoint to prove the end-to-end wiring
works, and tolerates a possible extra background-triggered version bump.
"""

import io
import uuid

import pytest
import pytest_asyncio
from PIL import Image, ImageDraw, ImageFont

from app.core.security import create_access_token
from app.models.document import DocumentEntityType
from app.models.person import Person
from app.models.settings import Setting
from app.models.user import UserRole
from app.services import document_service
from app.services.ocr_service import run_document_ocr


def _auth_headers(role: UserRole = UserRole.SUPER_ADMIN) -> dict[str, str]:
    token = create_access_token(str(uuid.uuid4()), role.value, extra={"email": "test@example.com"})
    return {"Authorization": f"Bearer {token}"}


def _synthetic_passport_png(passport_number: str) -> bytes:
    image = Image.new("RGB", (700, 100), color="white")
    draw = ImageDraw.Draw(image)
    font = ImageFont.load_default(size=36)
    draw.text((20, 20), f"Passport number {passport_number}", fill="black", font=font)
    buf = io.BytesIO()
    image.save(buf, format="PNG")
    return buf.getvalue()


@pytest_asyncio.fixture
async def person_fixture(session):
    person = Person(full_name=f"Test Pilot {uuid.uuid4().hex[:6]}")
    session.add(person)
    await session.commit()
    return person


async def _upload_via_service(session, person_id, *, doc_type: str, filename: str, content: bytes, content_type: str):
    result = await document_service.upload_document(
        session, DocumentEntityType.PERSON, person_id,
        doc_type=doc_type, filename=filename, content=content, content_type=content_type,
        actor_id=uuid.uuid4(), actor_email="test@example.com",
    )
    await session.commit()
    return result


class TestDocumentOcr:
    @pytest.mark.asyncio
    async def test_ocr_populates_raw_output_and_extracted_fields(self, client, session, person_fixture, monkeypatch):
        # LLM extraction (task #137) is mocked to a clean no-op here —
        # this test is about the real Tesseract regex path, and must never
        # hit a real provider API from an automated test (whatever real
        # keys/URLs happen to be present in this environment's .env).
        import app.services.ocr_service as ocr_service_module

        async def _no_llm_fields(session, raw_text, template):
            return None

        monkeypatch.setattr(ocr_service_module, "extract_fields_via_llm", _no_llm_fields)

        headers = _auth_headers()
        upload = await client.post(
            f"/documents/PERSON/{person_fixture.id}", headers=headers,
            data={"doc_type": "PASSPORT"},
            files={"file": ("passport.png", _synthetic_passport_png("P1234567"), "image/png")},
        )
        assert upload.status_code == 201, upload.text
        doc = upload.json()

        ran = await run_document_ocr(session, uuid.UUID(doc["id"]))
        assert ran is True

        after = await client.get(f"/documents/PERSON/{person_fixture.id}", headers=headers)
        updated = after.json()[0]
        assert "P1234567" in updated["ocr_raw_output"]["text"].replace(" ", "")
        assert updated["extracted_fields"].get("passport_number") == "P1234567"
        assert updated["ocr_raw_output"]["llm_extraction_used"] is False
        # OCR never touches the manual-verification workflow.
        assert updated["status"] == "PENDING_VERIFICATION"
        # >= not == — the router also fires a real Celery dispatch on
        # upload, which may race this direct call under a full stack.
        assert updated["version"] >= doc["version"] + 1

    @pytest.mark.asyncio
    async def test_llm_fields_override_regex_but_regex_survives_llm_nulls(self, session, person_fixture, monkeypatch):
        import app.services.ocr_service as ocr_service_module

        # The LLM corrects the regex-guessed passport number (real OCR
        # noise case) but has nothing for issuing_country_iso3 — that
        # field must survive from the regex guess, not disappear.
        async def _fake_llm_fields(session, raw_text, template):
            assert template.doc_type == "PASSPORT"
            return {"passport_number": "P1234567-CORRECTED"}

        monkeypatch.setattr(ocr_service_module, "extract_fields_via_llm", _fake_llm_fields)

        doc = await _upload_via_service(
            session, person_fixture.id,
            doc_type="PASSPORT", filename="passport.png",
            content=_synthetic_passport_png("P1234567"), content_type="image/png",
        )

        ran = await run_document_ocr(session, doc.id)
        assert ran is True

        refreshed = (await document_service.list_documents(session, DocumentEntityType.PERSON, person_fixture.id))[0]
        assert refreshed.extracted_fields["passport_number"] == "P1234567-CORRECTED"
        assert refreshed.ocr_raw_output["llm_extraction_used"] is True

    @pytest.mark.asyncio
    async def test_llm_extraction_failure_falls_back_to_regex_only(self, session, person_fixture, monkeypatch):
        import app.services.ocr_service as ocr_service_module

        async def _no_provider_available(session, raw_text, template):
            return None  # e.g. no chat provider configured/available

        monkeypatch.setattr(ocr_service_module, "extract_fields_via_llm", _no_provider_available)

        doc = await _upload_via_service(
            session, person_fixture.id,
            doc_type="PASSPORT", filename="passport.png",
            content=_synthetic_passport_png("P1234567"), content_type="image/png",
        )

        ran = await run_document_ocr(session, doc.id)
        assert ran is True

        refreshed = (await document_service.list_documents(session, DocumentEntityType.PERSON, person_fixture.id))[0]
        assert refreshed.extracted_fields.get("passport_number") == "P1234567"
        assert refreshed.ocr_raw_output["llm_extraction_used"] is False

    @pytest.mark.asyncio
    async def test_ocr_disabled_setting_leaves_document_untouched(self, session, person_fixture):
        doc = await _upload_via_service(
            session, person_fixture.id,
            doc_type="PASSPORT", filename="passport.png",
            content=_synthetic_passport_png("P7654321"), content_type="image/png",
        )

        setting = await session.get(Setting, "ocr_enabled")
        setting.value = "NO"
        await session.commit()

        ran = await run_document_ocr(session, doc.id)
        assert ran is False

        refreshed = await document_service.list_documents(session, DocumentEntityType.PERSON, person_fixture.id)
        assert refreshed[0].ocr_raw_output is None
        assert refreshed[0].extracted_fields is None

    @pytest.mark.asyncio
    async def test_unsupported_content_type_is_a_clean_no_op(self, session, person_fixture):
        doc = await _upload_via_service(
            session, person_fixture.id,
            doc_type="PASSPORT", filename="passport.pdf",
            content=b"%PDF-1.4 not a real pdf", content_type="application/pdf",
        )

        ran = await run_document_ocr(session, doc.id)
        assert ran is False

        refreshed = await document_service.list_documents(session, DocumentEntityType.PERSON, person_fixture.id)
        assert refreshed[0].ocr_raw_output is None
        assert refreshed[0].extracted_fields is None
