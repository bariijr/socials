from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_current_user, require_delete_access, require_write_access
from app.database import get_db
from app.schemas.common import Page
from app.schemas.party import (
    PartyCreate,
    PartyDetailOut,
    PartyOut,
    PartyRoleCreate,
    PartyRoleOut,
    PartyRoleUpdate,
    PartyUpdate,
)
from app.services import party_service

router = APIRouter(tags=["reference-data"])


@router.get("/parties", response_model=Page[PartyOut])
async def list_parties(
    page: int = 1,
    page_size: int = Query(default=50, le=500),
    session: AsyncSession = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
) -> Page[PartyOut]:
    items, total = await party_service.list_parties(session, page=page, page_size=page_size)
    return Page(items=items, total=total, page=page, page_size=page_size)


@router.get("/parties/{party_id}", response_model=PartyDetailOut)
async def get_party(
    party_id: UUID, session: AsyncSession = Depends(get_db), _user: CurrentUser = Depends(get_current_user)
) -> PartyDetailOut:
    return await party_service.get_party(session, party_id)


@router.post("/parties", response_model=PartyOut, status_code=201)
async def create_party(
    payload: PartyCreate, session: AsyncSession = Depends(get_db), user: CurrentUser = Depends(require_write_access)
) -> PartyOut:
    result = await party_service.create_party(session, payload, actor_id=user.id, actor_email=user.email)
    await session.commit()
    return result


@router.patch("/parties/{party_id}", response_model=PartyOut)
async def update_party(
    party_id: UUID,
    payload: PartyUpdate,
    session: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(require_write_access),
) -> PartyOut:
    result = await party_service.update_party(session, party_id, payload, actor_id=user.id, actor_email=user.email)
    await session.commit()
    return result


@router.post("/party-roles", response_model=PartyRoleOut, status_code=201)
async def add_role(
    payload: PartyRoleCreate, session: AsyncSession = Depends(get_db), user: CurrentUser = Depends(require_write_access)
) -> PartyRoleOut:
    result = await party_service.add_role(session, payload, actor_id=user.id, actor_email=user.email)
    await session.commit()
    return result


@router.patch("/party-roles/{role_id}", response_model=PartyRoleOut)
async def update_role(
    role_id: UUID,
    payload: PartyRoleUpdate,
    session: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(require_write_access),
) -> PartyRoleOut:
    result = await party_service.update_role(session, role_id, payload, actor_id=user.id, actor_email=user.email)
    await session.commit()
    return result


@router.delete("/party-roles/{role_id}", status_code=204)
async def remove_role(
    role_id: UUID,
    version: int,
    session: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(require_delete_access),
) -> None:
    await party_service.remove_role(session, role_id, version, actor_id=user.id, actor_email=user.email)
    await session.commit()
