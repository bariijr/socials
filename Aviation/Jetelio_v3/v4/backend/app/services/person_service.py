from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.person import Person
from app.repositories.audit import write_audit_log
from app.repositories.base import Repository
from app.schemas.person import PersonCreate, PersonOut, PersonUpdate


async def list_persons(
    session: AsyncSession, *, page: int, page_size: int, party_id: UUID | None = None
) -> tuple[list[PersonOut], int]:
    repo = Repository(session, Person)
    items, total = await repo.list(page=page, page_size=page_size, filters={"party_id": party_id})
    return [PersonOut.model_validate(p) for p in items], total


async def get_person(session: AsyncSession, person_id: UUID) -> PersonOut:
    repo = Repository(session, Person)
    return PersonOut.model_validate(await repo.get(person_id))


async def create_person(session: AsyncSession, payload: PersonCreate, *, actor_id: UUID, actor_email: str) -> PersonOut:
    repo = Repository(session, Person)
    created = await repo.create(Person(**payload.model_dump()))
    await write_audit_log(
        session, actor_user_id=actor_id, actor_email=actor_email, action="CREATE",
        entity_type="Person", entity_id=str(created.id), to_value=payload.model_dump(mode="json"),
    )
    return PersonOut.model_validate(created)


async def update_person(session: AsyncSession, person_id: UUID, payload: PersonUpdate, *, actor_id: UUID, actor_email: str) -> PersonOut:
    repo = Repository(session, Person)
    values = payload.model_dump(exclude={"version"}, exclude_unset=True)
    updated = await repo.update(person_id, payload.version, values)
    await write_audit_log(
        session, actor_user_id=actor_id, actor_email=actor_email, action="UPDATE",
        entity_type="Person", entity_id=str(updated.id), to_value=values,
    )
    return PersonOut.model_validate(updated)


async def delete_person(session: AsyncSession, person_id: UUID, version: int, *, actor_id: UUID, actor_email: str) -> None:
    repo = Repository(session, Person)
    deleted = await repo.soft_delete(person_id, version)
    await write_audit_log(
        session, actor_user_id=actor_id, actor_email=actor_email, action="DELETE",
        entity_type="Person", entity_id=str(deleted.id),
    )
