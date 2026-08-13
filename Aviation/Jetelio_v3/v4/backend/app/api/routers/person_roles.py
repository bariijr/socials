from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_current_user, require_write_access
from app.database import get_db
from app.schemas.person_role import PersonRoleCreate, PersonRoleOut, PersonRoleUpdate
from app.services import person_role_service

router = APIRouter(prefix="/person-roles", tags=["reference-data"])


@router.get("", response_model=list[PersonRoleOut])
async def list_roles(
    session: AsyncSession = Depends(get_db), _user: CurrentUser = Depends(get_current_user)
) -> list[PersonRoleOut]:
    return await person_role_service.list_roles(session)


@router.post("", response_model=PersonRoleOut, status_code=201)
async def create_role(
    payload: PersonRoleCreate,
    session: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(require_write_access),
) -> PersonRoleOut:
    result = await person_role_service.create_role(session, payload, actor_id=user.id, actor_email=user.email)
    await session.commit()
    return result


@router.patch("/{role_id}", response_model=PersonRoleOut)
async def update_role(
    role_id: UUID,
    payload: PersonRoleUpdate,
    session: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(require_write_access),
) -> PersonRoleOut:
    result = await person_role_service.update_role(session, role_id, payload, actor_id=user.id, actor_email=user.email)
    await session.commit()
    return result
