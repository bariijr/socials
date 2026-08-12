from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.country_requirements import CountryRequirement
from app.repositories.audit import write_audit_log
from app.repositories.base import Repository
from app.schemas.country_requirements import (
    CountryRequirementCreate,
    CountryRequirementOut,
    CountryRequirementUpdate,
)


def _to_out(entry: CountryRequirement) -> CountryRequirementOut:
    return CountryRequirementOut(
        **{n: getattr(entry, n) for n in CountryRequirementOut.model_fields if hasattr(entry, n)}
    )


async def list_requirements(
    session: AsyncSession, *, page: int, page_size: int, country_iso3: str | None
) -> tuple[list[CountryRequirementOut], int]:
    repo = Repository(session, CountryRequirement)
    items, total = await repo.list(
        page=page, page_size=page_size, filters={"country_iso3": country_iso3.upper() if country_iso3 else None}
    )
    return [_to_out(e) for e in items], total


async def create_requirement(
    session: AsyncSession, payload: CountryRequirementCreate, *, actor_id: UUID, actor_email: str
) -> CountryRequirementOut:
    repo = Repository(session, CountryRequirement)
    data = payload.model_dump()
    data["country_iso3"] = data["country_iso3"].upper()
    created = await repo.create(CountryRequirement(**data))
    await write_audit_log(
        session, actor_user_id=actor_id, actor_email=actor_email, action="CREATE",
        entity_type="CountryRequirement", entity_id=str(created.id), to_value=payload.model_dump(mode="json"),
    )
    return _to_out(created)


async def update_requirement(
    session: AsyncSession, requirement_id: UUID, payload: CountryRequirementUpdate, *, actor_id: UUID, actor_email: str
) -> CountryRequirementOut:
    repo = Repository(session, CountryRequirement)
    values = payload.model_dump(exclude={"version"}, exclude_unset=True)
    updated = await repo.update(requirement_id, payload.version, values)
    await write_audit_log(
        session, actor_user_id=actor_id, actor_email=actor_email, action="UPDATE",
        entity_type="CountryRequirement", entity_id=str(updated.id), to_value=values,
    )
    return _to_out(updated)
