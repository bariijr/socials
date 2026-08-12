from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit import AuditLog


async def write_audit_log(
    session: AsyncSession,
    *,
    actor_user_id: UUID | None,
    actor_email: str | None,
    action: str,
    entity_type: str,
    entity_id: str,
    from_value: dict[str, Any] | None = None,
    to_value: dict[str, Any] | None = None,
    reason: str | None = None,
) -> AuditLog:
    entry = AuditLog(
        actor_user_id=actor_user_id,
        actor_email=actor_email,
        action=action,
        entity_type=entity_type,
        entity_id=str(entity_id),
        from_value=from_value,
        to_value=to_value,
        reason=reason,
    )
    session.add(entry)
    await session.flush()
    return entry
