import io
import logging
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_current_user, require_delete_access, require_write_access
from app.core.errors import ValidationFailedError
from app.database import get_db
from app.models.document import DocumentEntityType, DocumentStatus
from app.schemas.document import DocumentOut, DocumentTypeTemplateOut, DocumentVerifyIn
from app.services import document_service

logger = logging.getLogger(__name__)

router = APIRouter(tags=["reference-data"])

MAX_UPLOAD_SIZE_BYTES = 25 * 1024 * 1024  # 25 MB — matches aircraft_documents


@router.get("/document-type-templates", response_model=list[DocumentTypeTemplateOut])
async def list_document_type_templates(_user: CurrentUser = Depends(get_current_user)) -> list[DocumentTypeTemplateOut]:
    return document_service.list_templates()


@router.get("/documents/{entity_type}/{entity_id}", response_model=list[DocumentOut])
async def list_documents(
    entity_type: DocumentEntityType,
    entity_id: UUID,
    session: AsyncSession = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
) -> list[DocumentOut]:
    return await document_service.list_documents(session, entity_type, entity_id)


@router.post("/documents/{entity_type}/{entity_id}", response_model=DocumentOut, status_code=201)
async def upload_document(
    entity_type: DocumentEntityType,
    entity_id: UUID,
    doc_type: str = Form(...),
    file: UploadFile = File(...),
    session: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(require_write_access),
) -> DocumentOut:
    contents = await file.read(MAX_UPLOAD_SIZE_BYTES + 1)
    if len(contents) > MAX_UPLOAD_SIZE_BYTES:
        raise ValidationFailedError("file", f"File exceeds the {MAX_UPLOAD_SIZE_BYTES // (1024 * 1024)} MB limit.")

    result = await document_service.upload_document(
        session, entity_type, entity_id,
        doc_type=doc_type, filename=file.filename or "document", content=contents, content_type=file.content_type,
        actor_id=user.id, actor_email=user.email,
    )
    await session.commit()

    # Best-effort OCR kickoff (task #109) — mirrors feasibility.py's
    # request_quote pattern (task #106): the side effect runs strictly
    # after the primary commit, and a broker/dispatch failure must never
    # turn a successful upload into a 500 for the caller.
    try:
        from app.worker.tasks import run_document_ocr

        run_document_ocr.delay(str(result.id))
    except Exception:
        logger.exception("Failed to dispatch OCR task for document %s", result.id)

    return result


@router.get("/documents/{entity_type}/{entity_id}/{doc_id}/download")
async def download_document(
    entity_type: DocumentEntityType,
    entity_id: UUID,
    doc_id: UUID,
    session: AsyncSession = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
) -> StreamingResponse:
    content, doc = await document_service.download_document(session, entity_type, entity_id, doc_id)
    return StreamingResponse(
        io.BytesIO(content),
        media_type=doc.content_type or "application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{doc.filename}"'},
    )


@router.post("/documents/{entity_type}/{entity_id}/{doc_id}/verify", response_model=DocumentOut)
async def verify_document(
    entity_type: DocumentEntityType,
    entity_id: UUID,
    doc_id: UUID,
    payload: DocumentVerifyIn,
    session: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(require_write_access),
) -> DocumentOut:
    result = await document_service.verify_document(
        session, entity_type, entity_id, doc_id,
        status=DocumentStatus(payload.status), verified_by=payload.verified_by, version=payload.version,
        actor_id=user.id, actor_email=user.email,
    )
    await session.commit()
    return result


@router.delete("/documents/{entity_type}/{entity_id}/{doc_id}", status_code=204)
async def delete_document(
    entity_type: DocumentEntityType,
    entity_id: UUID,
    doc_id: UUID,
    session: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(require_delete_access),
) -> None:
    await document_service.delete_document(session, entity_type, entity_id, doc_id, actor_id=user.id, actor_email=user.email)
    await session.commit()
