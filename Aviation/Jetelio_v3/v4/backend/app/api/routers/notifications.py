from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_current_user
from app.database import get_db
from app.schemas.common import Page
from app.schemas.notification import NotificationOut
from app.services import notification_service

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=Page[NotificationOut])
async def list_notifications(
    unseen: bool = False,
    page: int = 1,
    page_size: int = Query(default=50, le=200),
    session: AsyncSession = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
) -> Page[NotificationOut]:
    items, total = await notification_service.list_notifications(session, unseen_only=unseen, page=page, page_size=page_size)
    return Page(items=items, total=total, page=page, page_size=page_size)


@router.post("/{notification_id}/seen", response_model=NotificationOut)
async def mark_seen(
    notification_id: UUID, session: AsyncSession = Depends(get_db), _user: CurrentUser = Depends(get_current_user)
) -> NotificationOut:
    result = await notification_service.mark_seen(session, notification_id)
    await session.commit()
    return result


@router.post("/mark-all-seen")
async def mark_all_seen(session: AsyncSession = Depends(get_db), _user: CurrentUser = Depends(get_current_user)) -> dict:
    count = await notification_service.mark_all_seen(session)
    await session.commit()
    return {"marked": count}
