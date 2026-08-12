from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_current_user, require_delete_access, require_write_access
from app.database import get_db
from app.schemas.client import ClientCreate, ClientOut, ClientUpdate
from app.schemas.common import Page
from app.services import client_service

router = APIRouter(prefix="/clients", tags=["reference-data"])


@router.get("", response_model=Page[ClientOut])
async def list_clients(
    page: int = 1,
    page_size: int = Query(default=50, le=500),
    operator_id: UUID | None = None,
    session: AsyncSession = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
) -> Page[ClientOut]:
    items, total = await client_service.list_clients(session, page=page, page_size=page_size, operator_id=operator_id)
    return Page(items=items, total=total, page=page, page_size=page_size)


@router.get("/{client_id}", response_model=ClientOut)
async def get_client(
    client_id: UUID, session: AsyncSession = Depends(get_db), _user: CurrentUser = Depends(get_current_user)
) -> ClientOut:
    return await client_service.get_client(session, client_id)


@router.post("", response_model=ClientOut, status_code=201)
async def create_client(
    payload: ClientCreate, session: AsyncSession = Depends(get_db), user: CurrentUser = Depends(require_write_access)
) -> ClientOut:
    result = await client_service.create_client(session, payload, actor_id=user.id, actor_email=user.email)
    await session.commit()
    return result


@router.patch("/{client_id}", response_model=ClientOut)
async def update_client(
    client_id: UUID,
    payload: ClientUpdate,
    session: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(require_write_access),
) -> ClientOut:
    result = await client_service.update_client(session, client_id, payload, actor_id=user.id, actor_email=user.email)
    await session.commit()
    return result


@router.delete("/{client_id}", status_code=204)
async def delete_client(
    client_id: UUID,
    version: int,
    session: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(require_delete_access),
) -> None:
    await client_service.delete_client(session, client_id, version, actor_id=user.id, actor_email=user.email)
    await session.commit()
