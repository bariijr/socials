from uuid import UUID

from sqlalchemy import asc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ValidationFailedError
from app.core.person_role_registry import PERSON_ROLES
from app.models.person_role import PersonRoleDefinition
from app.repositories.audit import write_audit_log
from app.repositories.base import Repository
from app.schemas.person_role import PersonRoleCreate, PersonRoleOut, PersonRoleUpdate


async def ensure_seeded(session: AsyncSession) -> None:
    """Idempotent seed — mirrors app.services.document_template_service.
    ensure_seeded exactly."""
    existing = {row for row in (await session.execute(select(PersonRoleDefinition.code))).scalars().all()}
    for seed in PERSON_ROLES:
        if seed.code not in existing:
            session.add(
                PersonRoleDefinition(code=seed.code, label=seed.label, is_crew=seed.is_crew, sort_order=seed.sort_order)
            )
    await session.flush()


def _to_out(row: PersonRoleDefinition) -> PersonRoleOut:
    return PersonRoleOut(
        id=row.id, code=row.code, label=row.label, is_crew=row.is_crew, sort_order=row.sort_order,
        active=row.active, version=row.version,
    )


async def list_roles(session: AsyncSession) -> list[PersonRoleOut]:
    rows = (
        await session.execute(select(PersonRoleDefinition).order_by(asc(PersonRoleDefinition.sort_order)))
    ).scalars().all()
    return [_to_out(r) for r in rows]


async def create_role(
    session: AsyncSession, payload: PersonRoleCreate, *, actor_id: UUID, actor_email: str
) -> PersonRoleOut:
    repo = Repository(session, PersonRoleDefinition)
    created = await repo.create(PersonRoleDefinition(**payload.model_dump()))
    await write_audit_log(
        session, actor_user_id=actor_id, actor_email=actor_email, action="CREATE",
        entity_type="PersonRoleDefinition", entity_id=str(created.id), to_value=payload.model_dump(mode="json"),
    )
    return _to_out(created)


async def update_role(
    session: AsyncSession, role_id: UUID, payload: PersonRoleUpdate, *, actor_id: UUID, actor_email: str
) -> PersonRoleOut:
    repo = Repository(session, PersonRoleDefinition)
    values = payload.model_dump(exclude={"version"}, exclude_unset=True)
    updated = await repo.update(role_id, payload.version, values)
    await write_audit_log(
        session, actor_user_id=actor_id, actor_email=actor_email, action="UPDATE",
        entity_type="PersonRoleDefinition", entity_id=str(updated.id), to_value=values,
    )
    return _to_out(updated)


async def validate_active_code(session: AsyncSession, code: str) -> None:
    """Real validation against DB rows (task #120) — replaces the old
    fixed Pydantic regex."""
    row = (
        await session.execute(select(PersonRoleDefinition).where(PersonRoleDefinition.code == code))
    ).scalar_one_or_none()
    if row is None or not row.active:
        raise ValidationFailedError("persons.role", f"Unknown or inactive role '{code}' — see /person-roles for valid codes")


async def get_crew_bucket_map(session: AsyncSession) -> dict[str, bool]:
    """Fetched once per leg computation and threaded through
    (mirrors settings_map's fetch-once-then-pass-down pattern) rather than
    a DB query per person — see
    app.services.credentials_engine_service.compute_leg_credentials. Only
    active codes are included — this doubles as the "is this a real role"
    membership check leg_feasibility_service.compute_leg_feasibility uses,
    same as validate_active_code's active-only rule.
    """
    rows = (
        await session.execute(
            select(PersonRoleDefinition.code, PersonRoleDefinition.is_crew).where(PersonRoleDefinition.active.is_(True))
        )
    ).all()
    return {code: is_crew for code, is_crew in rows}
