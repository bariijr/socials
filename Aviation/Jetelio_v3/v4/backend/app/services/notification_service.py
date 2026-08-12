from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import Notification
from app.repositories.base import Repository
from app.schemas.notification import NotificationOut


async def create_notification(session: AsyncSession, *, entity_type: str, entity_id: str, kind: str, message: str) -> Notification:
    repo = Repository(session, Notification)
    return await repo.create(Notification(entity_type=entity_type, entity_id=entity_id, kind=kind, message=message))


async def list_notifications(
    session: AsyncSession, *, unseen_only: bool, page: int, page_size: int
) -> tuple[list[NotificationOut], int]:
    stmt = select(Notification)
    if unseen_only:
        stmt = stmt.where(Notification.seen_at.is_(None))
    stmt = stmt.order_by(Notification.created_at.desc())

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await session.execute(count_stmt)).scalar_one()

    stmt = stmt.offset((page - 1) * page_size).limit(page_size)
    items = (await session.execute(stmt)).scalars().all()
    return [NotificationOut.model_validate(n) for n in items], total


async def mark_seen(session: AsyncSession, notification_id: UUID) -> NotificationOut:
    repo = Repository(session, Notification)
    notification = await repo.get(notification_id)
    if notification.seen_at is None:
        notification.seen_at = datetime.now(timezone.utc)
        await session.flush()
        await session.refresh(notification)
    return NotificationOut.model_validate(notification)


async def mark_all_seen(session: AsyncSession) -> int:
    rows = (await session.execute(select(Notification).where(Notification.seen_at.is_(None)))).scalars().all()
    now = datetime.now(timezone.utc)
    for row in rows:
        row.seen_at = now
    await session.flush()
    return len(rows)
