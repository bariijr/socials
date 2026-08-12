from uuid import UUID

from sqlalchemy import asc
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.reference_status import resolve_operator_assignable
from app.models.operator import Operator
from app.repositories.audit import write_audit_log
from app.repositories.base import Repository
from app.schemas.operator import OperatorCreate, OperatorOut, OperatorUpdate


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
