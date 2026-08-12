from uuid import UUID

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, ValidationFailedError
from app.models.client import Client
from app.models.operator import Operator
from app.models.party import Party, PartyRole
from app.models.vendor import Vendor
from app.repositories.audit import write_audit_log
from app.repositories.base import Repository
from app.schemas.party import (
    PartyCreate,
    PartyDetailOut,
    PartyOut,
    PartyRoleCreate,
    PartyRoleOut,
    PartyRoleUpdate,
    PartyUpdate,
)


async def _linked_names(session: AsyncSession, roles: list[PartyRole]) -> dict[UUID, str]:
    operator_ids = {r.operator_id for r in roles if r.operator_id}
    client_ids = {r.client_id for r in roles if r.client_id}
    vendor_ids = {r.vendor_id for r in roles if r.vendor_id}

    names: dict[UUID, str] = {}
    if operator_ids:
        rows = (await session.execute(select(Operator.id, Operator.name).where(Operator.id.in_(operator_ids)))).all()
        names.update({row.id: (row.name or "(unnamed)") for row in rows})
    if client_ids:
        rows = (await session.execute(select(Client.id, Client.bill_to_legal_name).where(Client.id.in_(client_ids)))).all()
        names.update({row.id: row.bill_to_legal_name for row in rows})
    if vendor_ids:
        rows = (await session.execute(select(Vendor.id, Vendor.name).where(Vendor.id.in_(vendor_ids)))).all()
        names.update({row.id: row.name for row in rows})
    return names


def _role_out(role: PartyRole, names: dict[UUID, str]) -> PartyRoleOut:
    linked_id = role.operator_id or role.client_id or role.vendor_id
    return PartyRoleOut(
        id=role.id,
        party_id=role.party_id,
        role=role.role,
        operator_id=role.operator_id,
        client_id=role.client_id,
        vendor_id=role.vendor_id,
        credit_limit_minor_units=role.credit_limit_minor_units,
        notes=role.notes,
        version=role.version,
        created_at=role.created_at,
        updated_at=role.updated_at,
        linked_name=names.get(linked_id) if linked_id else None,
    )


async def list_parties(session: AsyncSession, *, page: int, page_size: int) -> tuple[list[PartyOut], int]:
    repo = Repository(session, Party)
    items, total = await repo.list(page=page, page_size=page_size)
    return [PartyOut.model_validate(p) for p in items], total


async def get_party(session: AsyncSession, party_id: UUID) -> PartyDetailOut:
    repo = Repository(session, Party)
    party = await repo.get(party_id)
    roles = (
        await session.execute(select(PartyRole).where(PartyRole.party_id == party_id, PartyRole.deleted_at.is_(None)))
    ).scalars().all()
    names = await _linked_names(session, list(roles))
    return PartyDetailOut(**PartyOut.model_validate(party).model_dump(), roles=[_role_out(r, names) for r in roles])


async def create_party(session: AsyncSession, payload: PartyCreate, *, actor_id: UUID, actor_email: str) -> PartyOut:
    repo = Repository(session, Party)
    created = await repo.create(Party(**payload.model_dump()))
    await write_audit_log(
        session, actor_user_id=actor_id, actor_email=actor_email, action="CREATE",
        entity_type="Party", entity_id=str(created.id), to_value=payload.model_dump(mode="json"),
    )
    return PartyOut.model_validate(created)


async def update_party(session: AsyncSession, party_id: UUID, payload: PartyUpdate, *, actor_id: UUID, actor_email: str) -> PartyOut:
    repo = Repository(session, Party)
    values = payload.model_dump(exclude={"version"}, exclude_unset=True)
    updated = await repo.update(party_id, payload.version, values)
    await write_audit_log(
        session, actor_user_id=actor_id, actor_email=actor_email, action="UPDATE",
        entity_type="Party", entity_id=str(updated.id), to_value=values,
    )
    return PartyOut.model_validate(updated)


async def add_role(session: AsyncSession, payload: PartyRoleCreate, *, actor_id: UUID, actor_email: str) -> PartyRoleOut:
    linked_count = sum(1 for v in (payload.operator_id, payload.client_id, payload.vendor_id) if v is not None)
    if payload.role in ("OPERATOR", "CLIENT", "VENDOR") and linked_count != 1:
        raise ValidationFailedError(
            "role", f"{payload.role} role must link to exactly one of operator_id/client_id/vendor_id"
        )
    if payload.role in ("AGENT", "WALK_IN") and linked_count != 0:
        raise ValidationFailedError("role", f"{payload.role} role must not link to an existing operator/client/vendor")

    repo = Repository(session, PartyRole)
    try:
        created = await repo.create(PartyRole(**payload.model_dump()))
    except IntegrityError as exc:
        await session.rollback()
        linked_id = payload.operator_id or payload.client_id or payload.vendor_id
        raise ConflictError(f"{payload.role.value} entity {linked_id} is already linked to another Party") from exc
    await write_audit_log(
        session, actor_user_id=actor_id, actor_email=actor_email, action="CREATE",
        entity_type="PartyRole", entity_id=str(created.id), to_value=payload.model_dump(mode="json"),
    )
    names = await _linked_names(session, [created])
    return _role_out(created, names)


async def update_role(session: AsyncSession, role_id: UUID, payload: PartyRoleUpdate, *, actor_id: UUID, actor_email: str) -> PartyRoleOut:
    repo = Repository(session, PartyRole)
    values = payload.model_dump(exclude={"version"}, exclude_unset=True)
    updated = await repo.update(role_id, payload.version, values)
    await write_audit_log(
        session, actor_user_id=actor_id, actor_email=actor_email, action="UPDATE",
        entity_type="PartyRole", entity_id=str(updated.id), to_value=values,
    )
    names = await _linked_names(session, [updated])
    return _role_out(updated, names)


async def remove_role(session: AsyncSession, role_id: UUID, version: int, *, actor_id: UUID, actor_email: str) -> None:
    repo = Repository(session, PartyRole)
    deleted = await repo.soft_delete(role_id, version)
    await write_audit_log(
        session, actor_user_id=actor_id, actor_email=actor_email, action="DELETE",
        entity_type="PartyRole", entity_id=str(deleted.id),
    )
