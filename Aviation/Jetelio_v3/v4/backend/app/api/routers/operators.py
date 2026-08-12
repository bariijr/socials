from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_current_user, require_delete_access, require_write_access
from app.database import get_db
from app.schemas.common import Page
from app.schemas.operator import OperatorCreate, OperatorOut, OperatorUpdate
from app.services import operator_service

router = APIRouter(prefix="/operators", tags=["reference-data"])


@router.get("", response_model=Page[OperatorOut])
async def list_operators(
    page: int = 1,
    page_size: int = Query(default=50, le=500),
    session: AsyncSession = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
) -> Page[OperatorOut]:
    items, total = await operator_service.list_operators(session, page=page, page_size=page_size)
    return Page(items=items, total=total, page=page, page_size=page_size)


@router.get("/{operator_id}", response_model=OperatorOut)
async def get_operator(
    operator_id: UUID, session: AsyncSession = Depends(get_db), _user: CurrentUser = Depends(get_current_user)
) -> OperatorOut:
    return await operator_service.get_operator(session, operator_id)


@router.post("", response_model=OperatorOut, status_code=201)
async def create_operator(
    payload: OperatorCreate, session: AsyncSession = Depends(get_db), user: CurrentUser = Depends(require_write_access)
) -> OperatorOut:
    result = await operator_service.create_operator(session, payload, actor_id=user.id, actor_email=user.email)
    await session.commit()
    return result


@router.patch("/{operator_id}", response_model=OperatorOut)
async def update_operator(
    operator_id: UUID,
    payload: OperatorUpdate,
    session: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(require_write_access),
) -> OperatorOut:
    result = await operator_service.update_operator(session, operator_id, payload, actor_id=user.id, actor_email=user.email)
    await session.commit()
    return result


@router.delete("/{operator_id}", status_code=204)
async def delete_operator(
    operator_id: UUID,
    version: int,
    session: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(require_delete_access),
) -> None:
    await operator_service.delete_operator(session, operator_id, version, actor_id=user.id, actor_email=user.email)
    await session.commit()
