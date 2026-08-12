from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_current_user, require_delete_access, require_write_access
from app.database import get_db
from app.schemas.common import Page
from app.schemas.person import PersonCreate, PersonOut, PersonUpdate
from app.services import person_service

router = APIRouter(prefix="/persons", tags=["reference-data"])


@router.get("", response_model=Page[PersonOut])
async def list_persons(
    page: int = 1,
    page_size: int = Query(default=50, le=500),
    party_id: UUID | None = None,
    session: AsyncSession = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
) -> Page[PersonOut]:
    items, total = await person_service.list_persons(session, page=page, page_size=page_size, party_id=party_id)
    return Page(items=items, total=total, page=page, page_size=page_size)


@router.get("/{person_id}", response_model=PersonOut)
async def get_person(
    person_id: UUID, session: AsyncSession = Depends(get_db), _user: CurrentUser = Depends(get_current_user)
) -> PersonOut:
    return await person_service.get_person(session, person_id)


@router.post("", response_model=PersonOut, status_code=201)
async def create_person(
    payload: PersonCreate, session: AsyncSession = Depends(get_db), user: CurrentUser = Depends(require_write_access)
) -> PersonOut:
    result = await person_service.create_person(session, payload, actor_id=user.id, actor_email=user.email)
    await session.commit()
    return result


@router.patch("/{person_id}", response_model=PersonOut)
async def update_person(
    person_id: UUID,
    payload: PersonUpdate,
    session: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(require_write_access),
) -> PersonOut:
    result = await person_service.update_person(session, person_id, payload, actor_id=user.id, actor_email=user.email)
    await session.commit()
    return result


@router.delete("/{person_id}", status_code=204)
async def delete_person(
    person_id: UUID,
    version: int,
    session: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(require_delete_access),
) -> None:
    await person_service.delete_person(session, person_id, version, actor_id=user.id, actor_email=user.email)
    await session.commit()
