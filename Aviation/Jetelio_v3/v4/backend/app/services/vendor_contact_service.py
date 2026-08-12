from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.service_delivery import VendorContact
from app.repositories.audit import write_audit_log
from app.repositories.base import Repository
from app.schemas.service_delivery import VendorContactCreate, VendorContactOut, VendorContactUpdate


async def list_contacts(session: AsyncSession, *, vendor_id: UUID | None, page: int, page_size: int) -> tuple[list[VendorContactOut], int]:
    repo = Repository(session, VendorContact)
    items, total = await repo.list(page=page, page_size=page_size, filters={"vendor_id": vendor_id})
    return [VendorContactOut.model_validate(c) for c in items], total


async def create_contact(session: AsyncSession, payload: VendorContactCreate, *, actor_id: UUID, actor_email: str) -> VendorContactOut:
    repo = Repository(session, VendorContact)
    created = await repo.create(VendorContact(**payload.model_dump()))
    await write_audit_log(
        session, actor_user_id=actor_id, actor_email=actor_email, action="CREATE",
        entity_type="VendorContact", entity_id=str(created.id), to_value=payload.model_dump(mode="json"),
    )
    return VendorContactOut.model_validate(created)


async def update_contact(session: AsyncSession, contact_id: UUID, payload: VendorContactUpdate, *, actor_id: UUID, actor_email: str) -> VendorContactOut:
    repo = Repository(session, VendorContact)
    values = payload.model_dump(exclude={"version"}, exclude_unset=True)
    updated = await repo.update(contact_id, payload.version, values)
    await write_audit_log(
        session, actor_user_id=actor_id, actor_email=actor_email, action="UPDATE",
        entity_type="VendorContact", entity_id=str(updated.id), to_value=values,
    )
    return VendorContactOut.model_validate(updated)


async def delete_contact(session: AsyncSession, contact_id: UUID, version: int, *, actor_id: UUID, actor_email: str) -> None:
    repo = Repository(session, VendorContact)
    deleted = await repo.soft_delete(contact_id, version)
    await write_audit_log(
        session, actor_user_id=actor_id, actor_email=actor_email, action="DELETE",
        entity_type="VendorContact", entity_id=str(deleted.id),
    )
