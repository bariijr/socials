import io
from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_current_user, require_delete_access, require_write_access
from app.core.errors import ValidationFailedError
from app.database import get_db
from app.schemas.aircraft_document import AircraftDocumentOut
from app.services import aircraft_document_service

router = APIRouter(prefix="/aircraft/{aircraft_id}/documents", tags=["reference-data"])

MAX_UPLOAD_SIZE_BYTES = 25 * 1024 * 1024  # 25 MB


@router.get("", response_model=list[AircraftDocumentOut])
async def list_documents(
    aircraft_id: UUID, session: AsyncSession = Depends(get_db), _user: CurrentUser = Depends(get_current_user)
) -> list[AircraftDocumentOut]:
    return await aircraft_document_service.list_documents(session, aircraft_id)


@router.post("", response_model=AircraftDocumentOut, status_code=201)
async def upload_document(
    aircraft_id: UUID,
    doc_type: str = Form(...),
    expiry_date: date | None = Form(default=None),
    file: UploadFile = File(...),
    session: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(require_write_access),
) -> AircraftDocumentOut:
    contents = await file.read(MAX_UPLOAD_SIZE_BYTES + 1)
    if len(contents) > MAX_UPLOAD_SIZE_BYTES:
        raise ValidationFailedError("file", f"File exceeds the {MAX_UPLOAD_SIZE_BYTES // (1024 * 1024)} MB limit.")

    result = await aircraft_document_service.upload_document(
        session,
        aircraft_id,
        doc_type=doc_type,
        filename=file.filename or "document",
        content=contents,
        content_type=file.content_type,
        expiry_date=expiry_date,
        actor_id=user.id,
        actor_email=user.email,
    )
    await session.commit()
    return result


@router.get("/{doc_id}/download")
async def download_document(
    aircraft_id: UUID,
    doc_id: UUID,
    session: AsyncSession = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
) -> StreamingResponse:
    content, doc = await aircraft_document_service.download_document(session, aircraft_id, doc_id)
    return StreamingResponse(
        io.BytesIO(content),
        media_type=doc.content_type or "application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{doc.filename}"'},
    )


@router.delete("/{doc_id}", status_code=204)
async def delete_document(
    aircraft_id: UUID,
    doc_id: UUID,
    session: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(require_delete_access),
) -> None:
    await aircraft_document_service.delete_document(session, aircraft_id, doc_id, actor_id=user.id, actor_email=user.email)
    await session.commit()
