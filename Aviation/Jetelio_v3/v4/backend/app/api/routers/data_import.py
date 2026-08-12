import io

from fastapi import APIRouter, Depends, File, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, require_admin
from app.core.errors import ValidationFailedError
from app.database import get_db
from app.importer.export_service import export_reference_workbook
from app.schemas.readiness import ImportReport
from app.services import data_import_service

router = APIRouter(prefix="/admin/import", tags=["data-import"])

MAX_UPLOAD_SIZE_BYTES = 50 * 1024 * 1024  # 50 MB


@router.post("", response_model=ImportReport)
async def upload_reference_workbook(
    file: UploadFile = File(...),
    session: AsyncSession = Depends(get_db),
    _user: CurrentUser = Depends(require_admin),
) -> ImportReport:
    """Re-runs the same reference-sheet loaders app.importer.cli uses at
    deploy time (countries, airports, operators, aircraft, vendors, service
    catalogue, visa data, message templates, users/settings), sourced from
    an uploaded workbook instead of a file already on the server. Country/
    FIR polygon geometry is not touched — see app.services.data_import_service.
    SUPER_ADMIN only: this rewrites core reference data platform-wide.
    """
    contents = await file.read(MAX_UPLOAD_SIZE_BYTES + 1)
    if len(contents) > MAX_UPLOAD_SIZE_BYTES:
        raise ValidationFailedError("file", f"File exceeds the {MAX_UPLOAD_SIZE_BYTES // (1024 * 1024)} MB limit.")

    return await data_import_service.run_upload_import(session, file.filename or "upload.xlsx", contents)


@router.get("/export")
async def download_reference_workbook(
    session: AsyncSession = Depends(get_db),
    _user: CurrentUser = Depends(require_admin),
) -> StreamingResponse:
    """The inverse of the upload above — reconstructs every reference-data
    sheet from live DB state into the same workbook format, for editing and
    re-uploading. See app.importer.export_service for what's lossy and why.
    SUPER_ADMIN only: same blast-radius rationale as the upload endpoint.
    """
    content = await export_reference_workbook(session)
    filename = "jetelio-reference-data-export.xlsx"
    return StreamingResponse(
        io.BytesIO(content),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
