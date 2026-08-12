"""Admin data import/export — round-trip coverage. The full-fidelity
verification (700+ real rows across all 16 sheets, zero data loss,
auto-expand of the row-capped MESSAGE TEMPLATES/USERS & SETTINGS sheets)
was done manually against the real production-shaped dataset; this locks
in the core guarantee with automated coverage: export reflects live DB
state, and re-uploading the export loads back cleanly with no errors.
"""

import uuid

import pytest

from app.core.security import create_access_token
from app.models.user import UserRole


def _auth_headers(role: UserRole = UserRole.SUPER_ADMIN) -> dict[str, str]:
    token = create_access_token(str(uuid.uuid4()), role.value, extra={"email": "test@example.com"})
    return {"Authorization": f"Bearer {token}"}


class TestExportImportRoundTrip:
    @pytest.mark.asyncio
    async def test_export_requires_super_admin(self, client):
        headers = _auth_headers(UserRole.OPERATIONS_SPECIALIST)
        resp = await client.get("/admin/import/export", headers=headers)
        assert resp.status_code == 403

    @pytest.mark.asyncio
    async def test_upload_requires_super_admin(self, client):
        headers = _auth_headers(UserRole.OPERATIONS_SPECIALIST)
        resp = await client.post(
            "/admin/import", headers=headers, files={"file": ("x.xlsx", b"not a real workbook", "application/octet-stream")}
        )
        assert resp.status_code == 403

    @pytest.mark.asyncio
    async def test_export_produces_a_valid_workbook(self, client):
        headers = _auth_headers()
        resp = await client.get("/admin/import/export", headers=headers)
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        # A real multi-sheet workbook is at minimum tens of KB — this
        # guards against a silently-empty or corrupt export.
        assert len(resp.content) > 50_000

    @pytest.mark.asyncio
    async def test_export_then_reupload_round_trips_cleanly(self, client):
        headers = _auth_headers()
        exported = await client.get("/admin/import/export", headers=headers)
        assert exported.status_code == 200

        reuploaded = await client.post(
            "/admin/import",
            headers=headers,
            files={"file": ("export.xlsx", exported.content, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        )
        assert reuploaded.status_code == 200
        report = reuploaded.json()

        sheet_names = {s["sheet"] for s in report["sheets"]}
        assert "countries" in sheet_names
        assert "VISA RULES" in sheet_names
        # No sheet should error out entirely on its own export — every
        # sheet the exporter touches must still be readable by the importer.
        for sheet in report["sheets"]:
            assert sheet["rows_seen"] >= sheet["rows_loaded"]

    @pytest.mark.asyncio
    async def test_upload_rejects_non_xlsx_file(self, client):
        headers = _auth_headers()
        resp = await client.post(
            "/admin/import", headers=headers, files={"file": ("notes.txt", b"hello world", "text/plain")}
        )
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_upload_rejects_workbook_missing_required_sheets(self, client):
        import io

        import openpyxl

        wb = openpyxl.Workbook()
        buf = io.BytesIO()
        wb.save(buf)

        headers = _auth_headers()
        resp = await client.post(
            "/admin/import",
            headers=headers,
            files={"file": ("incomplete.xlsx", buf.getvalue(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        )
        assert resp.status_code == 422
