"""Polymorphic Person/Party document metadata + S3 object lifecycle —
mirrors app.services.aircraft_document_service exactly (bytes in MinIO,
DB row is metadata-only), generalized to entity_type/entity_id instead of
a fixed aircraft_id. OCR fields are never populated here — see
app.models.document.Document's docstring for why.
"""

from datetime import date, datetime, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import storage
from app.core.document_template_registry import DOCUMENT_TEMPLATES, DOCUMENT_TEMPLATES_BY_TYPE
from app.core.errors import NotFoundError, ValidationFailedError, VersionConflictError
from app.models.document import Document, DocumentEntityType, DocumentStatus
from app.models.party import Party
from app.models.person import Person
from app.repositories.audit import write_audit_log
from app.schemas.document import DocumentOut, DocumentTypeTemplateOut


def list_templates() -> list[DocumentTypeTemplateOut]:
    return [
        DocumentTypeTemplateOut(
            doc_type=t.doc_type, name=t.name, applies_to_entity_type=t.applies_to_entity_type, expected_fields=t.expected_fields
        )
        for t in DOCUMENT_TEMPLATES
    ]


def _to_out(doc: Document) -> DocumentOut:
    return DocumentOut(
        id=doc.id,
        entity_type=doc.entity_type,
        entity_id=doc.entity_id,
        doc_type=doc.doc_type,
        filename=doc.filename,
        content_type=doc.content_type,
        file_size_bytes=doc.file_size_bytes,
        ocr_raw_output=doc.ocr_raw_output,
        extracted_fields=doc.extracted_fields,
        status=doc.status.value,
        verified_by=doc.verified_by,
        verified_on=doc.verified_on,
        supersedes_document_id=doc.supersedes_document_id,
        uploaded_by=str(doc.uploaded_by) if doc.uploaded_by else None,
        created_at=doc.created_at,
        version=doc.version,
    )


async def _entity_or_404(session: AsyncSession, entity_type: DocumentEntityType, entity_id: UUID) -> None:
    model = Person if entity_type == DocumentEntityType.PERSON else Party
    row = await session.get(model, entity_id)
    if row is None or row.deleted_at is not None:
        raise NotFoundError(entity_type.value.title(), entity_id)


async def list_documents(session: AsyncSession, entity_type: DocumentEntityType, entity_id: UUID) -> list[DocumentOut]:
    await _entity_or_404(session, entity_type, entity_id)
    rows = (
        await session.execute(
            select(Document)
            .where(Document.entity_type == entity_type, Document.entity_id == entity_id, Document.deleted_at.is_(None))
            .order_by(Document.created_at.desc())
        )
    ).scalars().all()
    return [_to_out(d) for d in rows]


async def upload_document(
    session: AsyncSession,
    entity_type: DocumentEntityType,
    entity_id: UUID,
    *,
    doc_type: str,
    filename: str,
    content: bytes,
    content_type: str | None,
    actor_id: UUID,
    actor_email: str,
) -> DocumentOut:
    await _entity_or_404(session, entity_type, entity_id)
    template = DOCUMENT_TEMPLATES_BY_TYPE.get(doc_type)
    if template is None:
        raise ValidationFailedError("doc_type", f"Unknown doc_type '{doc_type}' — no DocumentTypeTemplate registered for it")
    if template.applies_to_entity_type != entity_type:
        raise ValidationFailedError(
            "doc_type", f"'{doc_type}' applies to {template.applies_to_entity_type.value}, not {entity_type.value}"
        )

    key = storage.build_entity_key(entity_prefix=entity_type.value.lower(), entity_id=str(entity_id), filename=filename)
    await storage.upload_file(key, content, content_type)

    doc = Document(
        entity_type=entity_type,
        entity_id=entity_id,
        doc_type=doc_type,
        filename=filename,
        s3_key=key,
        content_type=content_type,
        file_size_bytes=len(content),
        status=DocumentStatus.PENDING_VERIFICATION,
        uploaded_by=actor_id,
    )
    session.add(doc)
    await session.flush()

    await write_audit_log(
        session, actor_user_id=actor_id, actor_email=actor_email, action="CREATE",
        entity_type="Document", entity_id=str(doc.id),
        to_value={"entity_type": entity_type.value, "entity_id": str(entity_id), "doc_type": doc_type, "filename": filename},
    )
    return _to_out(doc)


async def _get_document_or_404(session: AsyncSession, entity_type: DocumentEntityType, entity_id: UUID, doc_id: UUID) -> Document:
    doc = await session.get(Document, doc_id)
    if doc is None or doc.entity_type != entity_type or doc.entity_id != entity_id or doc.deleted_at is not None:
        raise NotFoundError("Document", doc_id)
    return doc


async def download_document(session: AsyncSession, entity_type: DocumentEntityType, entity_id: UUID, doc_id: UUID) -> tuple[bytes, Document]:
    doc = await _get_document_or_404(session, entity_type, entity_id, doc_id)
    content = await storage.download_file(doc.s3_key)
    return content, doc


async def verify_document(
    session: AsyncSession,
    entity_type: DocumentEntityType,
    entity_id: UUID,
    doc_id: UUID,
    *,
    status: DocumentStatus,
    verified_by: str,
    version: int,
    actor_id: UUID,
    actor_email: str,
) -> DocumentOut:
    doc = await _get_document_or_404(session, entity_type, entity_id, doc_id)
    if doc.version != version:
        raise VersionConflictError("Document", doc_id, version, doc.version)

    doc.status = status
    doc.verified_by = verified_by
    doc.verified_on = date.today()
    doc.version += 1
    await session.flush()

    await write_audit_log(
        session, actor_user_id=actor_id, actor_email=actor_email, action="UPDATE",
        entity_type="Document", entity_id=str(doc.id), to_value={"status": status.value, "verified_by": verified_by},
    )
    return _to_out(doc)


async def delete_document(
    session: AsyncSession, entity_type: DocumentEntityType, entity_id: UUID, doc_id: UUID, *, actor_id: UUID, actor_email: str
) -> None:
    doc = await _get_document_or_404(session, entity_type, entity_id, doc_id)
    doc.deleted_at = datetime.now(timezone.utc)
    doc.version += 1
    await session.flush()
    await storage.delete_file(doc.s3_key)

    await write_audit_log(
        session, actor_user_id=actor_id, actor_email=actor_email, action="DELETE",
        entity_type="Document", entity_id=str(doc.id), from_value={"filename": doc.filename},
    )
