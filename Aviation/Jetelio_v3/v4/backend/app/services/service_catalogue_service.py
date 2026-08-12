from uuid import UUID

from sqlalchemy import asc
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.service_catalogue import ServiceCatalogueEntry
from app.repositories.audit import write_audit_log
from app.repositories.base import Repository
from app.schemas.service_catalogue import (
    ServiceCatalogueCreate,
    ServiceCatalogueOut,
    ServiceCatalogueUpdate,
)


def _to_out(entry: ServiceCatalogueEntry) -> ServiceCatalogueOut:
    return ServiceCatalogueOut(
        **{n: getattr(entry, n) for n in ServiceCatalogueOut.model_fields if hasattr(entry, n)}
    )


async def list_entries(
    session: AsyncSession, *, page: int, page_size: int, level: str | None = None
) -> tuple[list[ServiceCatalogueOut], int]:
    repo = Repository(session, ServiceCatalogueEntry)
    items, total = await repo.list(
        page=page, page_size=page_size, filters={"level": level}, order_by=asc(ServiceCatalogueEntry.code)
    )
    return [_to_out(e) for e in items], total


async def get_entry(session: AsyncSession, entry_id: UUID) -> ServiceCatalogueOut:
    repo = Repository(session, ServiceCatalogueEntry)
    return _to_out(await repo.get(entry_id))


async def create_entry(
    session: AsyncSession, payload: ServiceCatalogueCreate, *, actor_id: UUID, actor_email: str
) -> ServiceCatalogueOut:
    repo = Repository(session, ServiceCatalogueEntry)
    created = await repo.create(ServiceCatalogueEntry(**payload.model_dump()))
    await write_audit_log(
        session, actor_user_id=actor_id, actor_email=actor_email, action="CREATE",
        entity_type="ServiceCatalogueEntry", entity_id=str(created.id), to_value=payload.model_dump(mode="json"),
    )
    return _to_out(created)


async def update_entry(
    session: AsyncSession, entry_id: UUID, payload: ServiceCatalogueUpdate, *, actor_id: UUID, actor_email: str
) -> ServiceCatalogueOut:
    repo = Repository(session, ServiceCatalogueEntry)
    values = payload.model_dump(exclude={"version"}, exclude_unset=True)
    updated = await repo.update(entry_id, payload.version, values)
    await write_audit_log(
        session, actor_user_id=actor_id, actor_email=actor_email, action="UPDATE",
        entity_type="ServiceCatalogueEntry", entity_id=str(updated.id), to_value=values,
    )
    return _to_out(updated)
