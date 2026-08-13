from uuid import UUID

from sqlalchemy import asc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.aircraft_document_type_registry import AIRCRAFT_DOCUMENT_TYPES
from app.core.errors import ValidationFailedError
from app.models.aircraft_document import AircraftDocumentTypeDefinition
from app.repositories.audit import write_audit_log
from app.repositories.base import Repository
from app.schemas.aircraft_document_type import (
    AircraftDocumentTypeCreate,
    AircraftDocumentTypeOut,
    AircraftDocumentTypeUpdate,
)


async def ensure_seeded(session: AsyncSession) -> None:
    """Idempotent seed — mirrors app.services.document_template_service.
    ensure_seeded exactly. Required at startup: AircraftDocument.doc_type
    has a real FK to aircraft_document_types.code, so an upload would fail
    with no rows here, not just show an empty list.
    """
    existing = {row for row in (await session.execute(select(AircraftDocumentTypeDefinition.code))).scalars().all()}
    for seed in AIRCRAFT_DOCUMENT_TYPES:
        if seed.code not in existing:
            session.add(
                AircraftDocumentTypeDefinition(
                    code=seed.code, label=seed.label, category=seed.category, sort_order=seed.sort_order
                )
            )
    await session.flush()


def _to_out(row: AircraftDocumentTypeDefinition) -> AircraftDocumentTypeOut:
    return AircraftDocumentTypeOut(
        id=row.id, code=row.code, label=row.label, category=row.category, sort_order=row.sort_order,
        active=row.active, version=row.version,
    )


async def list_types(session: AsyncSession) -> list[AircraftDocumentTypeOut]:
    rows = (
        await session.execute(select(AircraftDocumentTypeDefinition).order_by(asc(AircraftDocumentTypeDefinition.sort_order)))
    ).scalars().all()
    return [_to_out(r) for r in rows]


async def create_type(
    session: AsyncSession, payload: AircraftDocumentTypeCreate, *, actor_id: UUID, actor_email: str
) -> AircraftDocumentTypeOut:
    repo = Repository(session, AircraftDocumentTypeDefinition)
    created = await repo.create(AircraftDocumentTypeDefinition(**payload.model_dump()))
    await write_audit_log(
        session, actor_user_id=actor_id, actor_email=actor_email, action="CREATE",
        entity_type="AircraftDocumentTypeDefinition", entity_id=str(created.id), to_value=payload.model_dump(mode="json"),
    )
    return _to_out(created)


async def update_type(
    session: AsyncSession, type_id: UUID, payload: AircraftDocumentTypeUpdate, *, actor_id: UUID, actor_email: str
) -> AircraftDocumentTypeOut:
    repo = Repository(session, AircraftDocumentTypeDefinition)
    values = payload.model_dump(exclude={"version"}, exclude_unset=True)
    updated = await repo.update(type_id, payload.version, values)
    await write_audit_log(
        session, actor_user_id=actor_id, actor_email=actor_email, action="UPDATE",
        entity_type="AircraftDocumentTypeDefinition", entity_id=str(updated.id), to_value=values,
    )
    return _to_out(updated)


async def validate_active_code(session: AsyncSession, code: str) -> None:
    """Real validation against DB rows (task #118) — replaces the old
    fixed-Python-Enum type-check Pydantic used to provide for
    AircraftDocument.doc_type."""
    row = (
        await session.execute(
            select(AircraftDocumentTypeDefinition).where(AircraftDocumentTypeDefinition.code == code)
        )
    ).scalar_one_or_none()
    if row is None or not row.active:
        raise ValidationFailedError("doc_type", f"Unknown or inactive aircraft document type '{code}' — see /aircraft-document-types for valid codes")
