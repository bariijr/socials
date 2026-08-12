from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, require_admin
from app.database import get_db
from app.schemas.common import Page
from app.schemas.user import UserOut, UserUpdate
from app.services import auth_service

router = APIRouter(prefix="/users", tags=["admin"])


@router.get("", response_model=Page[UserOut])
async def list_users(
    page: int = 1,
    page_size: int = Query(default=50, le=500),
    session: AsyncSession = Depends(get_db),
    _user: CurrentUser = Depends(require_admin),
) -> Page[UserOut]:
    items, total = await auth_service.list_users(session, page=page, page_size=page_size)
    return Page(items=items, total=total, page=page, page_size=page_size)


@router.patch("/{user_id}", response_model=UserOut)
async def update_user(
    user_id: UUID,
    payload: UserUpdate,
    session: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(require_admin),
) -> UserOut:
    result = await auth_service.update_user(session, user_id, payload, actor_id=user.id, actor_email=user.email)
    await session.commit()
    return result
