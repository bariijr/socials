from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import asc, select
from sqlalchemy import update as sa_update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ValidationFailedError, VersionConflictError
from app.domain.reference_status import resolve_operator_assignable
from app.models.aircraft import Aircraft
from app.models.client import Client
from app.models.operator import Operator
from app.models.party import PartyRole
from app.models.service_delivery import ConfirmationRoutingConfig, ServiceDeliveryConfig
from app.models.user import User
from app.repositories.audit import write_audit_log
from app.repositories.base import Repository
from app.schemas.operator import OperatorBase, OperatorCreate, OperatorMergeIn, OperatorMergeOut, OperatorOut, OperatorUpdate


def _to_out(operator: Operator) -> OperatorOut:
    assignable = resolve_operator_assignable(operator.name)
    base_fields = {name: getattr(operator, name) for name in OperatorOut.model_fields if hasattr(operator, name)}
    return OperatorOut(**{**base_fields, "assignable_status": assignable})


async def list_operators(session: AsyncSession, *, page: int, page_size: int) -> tuple[list[OperatorOut], int]:
    repo = Repository(session, Operator)
    items, total = await repo.list(page=page, page_size=page_size, order_by=asc(Operator.name))
    return [_to_out(o) for o in items], total


async def get_operator(session: AsyncSession, operator_id: UUID) -> OperatorOut:
    repo = Repository(session, Operator)
    operator = await repo.get(operator_id)
    return _to_out(operator)


async def create_operator(
    session: AsyncSession, payload: OperatorCreate, *, actor_id: UUID, actor_email: str
) -> OperatorOut:
    repo = Repository(session, Operator)
    data = payload.model_dump()
    name = data.get("name")
    quarantined = not name or not name.strip()
    operator = Operator(
        **data,
        quarantined=quarantined,
        quarantine_reason="BLOCKED - OPERATOR NAME REQUIRED" if quarantined else None,
    )
    created = await repo.create(operator)
    await write_audit_log(
        session,
        actor_user_id=actor_id,
        actor_email=actor_email,
        action="CREATE",
        entity_type="Operator",
        entity_id=str(created.id),
        to_value=payload.model_dump(mode="json"),
    )
    return _to_out(created)


async def update_operator(
    session: AsyncSession, operator_id: UUID, payload: OperatorUpdate, *, actor_id: UUID, actor_email: str
) -> OperatorOut:
    repo = Repository(session, Operator)
    values = payload.model_dump(exclude={"version"}, exclude_unset=True)
    if "name" in values:
        name = values["name"]
        values["quarantined"] = not name or not name.strip()
        values["quarantine_reason"] = "BLOCKED - OPERATOR NAME REQUIRED" if values["quarantined"] else None
    updated = await repo.update(operator_id, payload.version, values)
    await write_audit_log(
        session,
        actor_user_id=actor_id,
        actor_email=actor_email,
        action="UPDATE",
        entity_type="Operator",
        entity_id=str(updated.id),
        to_value=values,
    )
    return _to_out(updated)


async def delete_operator(
    session: AsyncSession, operator_id: UUID, version: int, *, actor_id: UUID, actor_email: str
) -> None:
    repo = Repository(session, Operator)
    await repo.soft_delete(operator_id, version)
    await write_audit_log(
        session,
        actor_user_id=actor_id,
        actor_email=actor_email,
        action="DELETE",
        entity_type="Operator",
        entity_id=str(operator_id),
    )


async def _reassign_fk(session: AsyncSession, model: type, *, keep_id: UUID, duplicate_id: UUID) -> int:
    result = await session.execute(sa_update(model).where(model.operator_id == duplicate_id).values(operator_id=keep_id))
    return result.rowcount or 0


async def _reassign_party_role(session: AsyncSession, *, keep_id: UUID, duplicate_id: UUID) -> int:
    """PartyRole.operator_id is 1:1 (uq_party_role_operator) — a plain bulk
    UPDATE would violate that constraint if `keep` already has its own
    PartyRole row. In that case the duplicate's PartyRole is redundant
    (the surviving Party grouping for `keep` stays authoritative) and gets
    soft-deleted instead of reassigned; otherwise it's moved over like
    every other FK in _reassign_fk.
    """
    keep_has_role = (
        await session.execute(select(PartyRole.id).where(PartyRole.operator_id == keep_id, PartyRole.deleted_at.is_(None)))
    ).scalar_one_or_none()
    duplicate_role = (
        await session.execute(select(PartyRole).where(PartyRole.operator_id == duplicate_id, PartyRole.deleted_at.is_(None)))
    ).scalar_one_or_none()
    if duplicate_role is None:
        return 0
    duplicate_role.version = duplicate_role.version + 1
    if keep_has_role is not None:
        duplicate_role.deleted_at = datetime.now(timezone.utc)
        return 0
    duplicate_role.operator_id = keep_id
    return 1


async def merge_operators(
    session: AsyncSession, keep_id: UUID, payload: OperatorMergeIn, *, actor_id: UUID, actor_email: str
) -> OperatorMergeOut:
    """Folds `payload.duplicate_operator_id` into `keep_id`: every real
    reference (fleet, clients, service-delivery/confirmation-routing
    configs, portal users, party grouping) moves onto the surviving
    operator, any of the surviving operator's own blank fields get
    backfilled from the duplicate's real data (never silently dropped),
    and the duplicate is soft-deleted — never a hard DELETE, same as
    everywhere else in this codebase.
    """
    if keep_id == payload.duplicate_operator_id:
        raise ValidationFailedError("duplicate_operator_id", "cannot merge an operator into itself")

    repo = Repository(session, Operator)
    keep = await repo.get(keep_id)
    duplicate = await repo.get(payload.duplicate_operator_id)

    if keep.version != payload.keep_version:
        raise VersionConflictError("Operator", keep_id, payload.keep_version, keep.version)
    if duplicate.version != payload.duplicate_version:
        raise VersionConflictError("Operator", duplicate.id, payload.duplicate_version, duplicate.version)

    reassigned = {
        "aircraft": await _reassign_fk(session, Aircraft, keep_id=keep_id, duplicate_id=duplicate.id),
        "clients": await _reassign_fk(session, Client, keep_id=keep_id, duplicate_id=duplicate.id),
        "service_delivery_configs": await _reassign_fk(session, ServiceDeliveryConfig, keep_id=keep_id, duplicate_id=duplicate.id),
        "confirmation_routing_configs": await _reassign_fk(
            session, ConfirmationRoutingConfig, keep_id=keep_id, duplicate_id=duplicate.id
        ),
        "users": await _reassign_fk(session, User, keep_id=keep_id, duplicate_id=duplicate.id),
        "party_roles": await _reassign_party_role(session, keep_id=keep_id, duplicate_id=duplicate.id),
    }

    fields_backfilled: list[str] = []
    for field in OperatorBase.model_fields:
        if field == "status":  # a state, not data — never inherited from a merged-away duplicate
            continue
        current = getattr(keep, field, None)
        candidate = getattr(duplicate, field, None)
        if current in (None, "", []) and candidate not in (None, "", []):
            setattr(keep, field, candidate)
            fields_backfilled.append(field)

    if fields_backfilled:
        keep.version = keep.version + 1
    duplicate.deleted_at = datetime.now(timezone.utc)
    duplicate.version = duplicate.version + 1

    await session.flush()
    await session.refresh(keep)

    await write_audit_log(
        session,
        actor_user_id=actor_id,
        actor_email=actor_email,
        action="MERGE",
        entity_type="Operator",
        entity_id=str(keep_id),
        from_value={"duplicate_id": str(duplicate.id), "duplicate_name": duplicate.name},
        to_value={"reassigned": reassigned, "fields_backfilled": fields_backfilled},
    )

    return OperatorMergeOut(kept=_to_out(keep), duplicate_id=duplicate.id, reassigned=reassigned, fields_backfilled=fields_backfilled)
