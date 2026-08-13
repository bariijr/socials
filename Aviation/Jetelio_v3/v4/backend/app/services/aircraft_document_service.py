"""Aircraft document metadata + S3 object lifecycle. The DB row is the
source of truth for what exists; app.core.storage owns the actual bytes.
"""

from datetime import date, datetime, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import storage
from app.core.errors import NotFoundError
from app.models.aircraft import Aircraft
from app.models.aircraft_document import AircraftDocument
from app.repositories.audit import write_audit_log
from app.schemas.aircraft_document import AircraftDocumentOut
from app.services import aircraft_document_type_service


def _to_out(doc: AircraftDocument) -> AircraftDocumentOut:
    return AircraftDocumentOut(
        id=doc.id,
        aircraft_id=doc.aircraft_id,
        doc_type=doc.doc_type,
        filename=doc.filename,
        content_type=doc.content_type,
        file_size_bytes=doc.file_size_bytes,
        expiry_date=doc.expiry_date,
        uploaded_by=str(doc.uploaded_by) if doc.uploaded_by else None,
        created_at=doc.created_at,
    )


async def _get_aircraft_or_404(session: AsyncSession, aircraft_id: UUID) -> Aircraft:
    aircraft = await session.get(Aircraft, aircraft_id)
    if aircraft is None or aircraft.deleted_at is not None:
        raise NotFoundError("Aircraft", aircraft_id)
    return aircraft


async def list_documents(session: AsyncSession, aircraft_id: UUID) -> list[AircraftDocumentOut]:
    await _get_aircraft_or_404(session, aircraft_id)
    rows = (
        await session.execute(
            select(AircraftDocument)
            .where(AircraftDocument.aircraft_id == aircraft_id, AircraftDocument.deleted_at.is_(None))
            .order_by(AircraftDocument.created_at.desc())
        )
    ).scalars().all()
    return [_to_out(d) for d in rows]


async def upload_document(
    session: AsyncSession,
    aircraft_id: UUID,
    *,
    doc_type: str,
    filename: str,
    content: bytes,
    content_type: str | None,
    expiry_date: date | None,
    actor_id: UUID,
    actor_email: str,
) -> AircraftDocumentOut:
    await _get_aircraft_or_404(session, aircraft_id)
    await aircraft_document_type_service.validate_active_code(session, doc_type)

    key = storage.build_key(aircraft_id=str(aircraft_id), filename=filename)
    await storage.upload_file(key, content, content_type)

    doc = AircraftDocument(
        aircraft_id=aircraft_id,
        doc_type=doc_type,
        filename=filename,
        s3_key=key,
        content_type=content_type,
        file_size_bytes=len(content),
        expiry_date=expiry_date,
        uploaded_by=actor_id,
    )
    session.add(doc)
    await session.flush()

    await write_audit_log(
        session,
        actor_user_id=actor_id,
        actor_email=actor_email,
        action="CREATE",
        entity_type="AircraftDocument",
        entity_id=str(doc.id),
        to_value={"aircraft_id": str(aircraft_id), "doc_type": doc_type, "filename": filename},
    )
    return _to_out(doc)


async def download_document(session: AsyncSession, aircraft_id: UUID, doc_id: UUID) -> tuple[bytes, AircraftDocument]:
    doc = await session.get(AircraftDocument, doc_id)
    if doc is None or doc.aircraft_id != aircraft_id or doc.deleted_at is not None:
        raise NotFoundError("AircraftDocument", doc_id)
    content = await storage.download_file(doc.s3_key)
    return content, doc


async def delete_document(
    session: AsyncSession, aircraft_id: UUID, doc_id: UUID, *, actor_id: UUID, actor_email: str
) -> None:
    doc = await session.get(AircraftDocument, doc_id)
    if doc is None or doc.aircraft_id != aircraft_id or doc.deleted_at is not None:
        raise NotFoundError("AircraftDocument", doc_id)

    doc.deleted_at = datetime.now(timezone.utc)
    doc.version += 1
    await session.flush()
    await storage.delete_file(doc.s3_key)

    await write_audit_log(
        session,
        actor_user_id=actor_id,
        actor_email=actor_email,
        action="DELETE",
        entity_type="AircraftDocument",
        entity_id=str(doc.id),
        from_value={"filename": doc.filename},
    )
