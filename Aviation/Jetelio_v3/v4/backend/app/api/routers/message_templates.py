from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_current_user, require_write_access
from app.database import get_db
from app.schemas.common import Page
from app.schemas.messaging import MessageTemplateCreate, MessageTemplateOut, MessageTemplateUpdate
from app.services import messaging_service

router = APIRouter(prefix="/message-templates", tags=["reference-data"])


@router.get("", response_model=Page[MessageTemplateOut])
async def list_templates(
    page: int = 1,
    page_size: int = Query(default=50, le=500),
    active_only: bool = False,
    session: AsyncSession = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
) -> Page[MessageTemplateOut]:
    items, total = await messaging_service.list_templates(session, page=page, page_size=page_size, active_only=active_only)
    return Page(items=items, total=total, page=page, page_size=page_size)


@router.get("/{template_id}", response_model=MessageTemplateOut)
async def get_template(
    template_id: UUID, session: AsyncSession = Depends(get_db), _user: CurrentUser = Depends(get_current_user)
) -> MessageTemplateOut:
    return await messaging_service.get_template(session, template_id)


@router.post("", response_model=MessageTemplateOut, status_code=201)
async def create_template(
    payload: MessageTemplateCreate,
    session: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(require_write_access),
) -> MessageTemplateOut:
    result = await messaging_service.create_template(session, payload, actor_id=user.id, actor_email=user.email)
    await session.commit()
    return result


@router.patch("/{template_id}", response_model=MessageTemplateOut)
async def update_template(
    template_id: UUID,
    payload: MessageTemplateUpdate,
    session: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(require_write_access),
) -> MessageTemplateOut:
    result = await messaging_service.update_template(session, template_id, payload, actor_id=user.id, actor_email=user.email)
    await session.commit()
    return result
