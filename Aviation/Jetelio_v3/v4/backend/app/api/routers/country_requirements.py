from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID

from app.api.deps import CurrentUser, get_current_user, require_write_access
from app.database import get_db
from app.schemas.common import Page
from app.schemas.country_requirements import (
    CountryRequirementCreate,
    CountryRequirementOut,
    CountryRequirementUpdate,
)
from app.services import country_requirements_service

router = APIRouter(prefix="/country-requirements", tags=["reference-data"])


@router.get("", response_model=Page[CountryRequirementOut])
async def list_requirements(
    page: int = 1,
    page_size: int = Query(default=50, le=500),
    country_iso3: str | None = None,
    session: AsyncSession = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
) -> Page[CountryRequirementOut]:
    items, total = await country_requirements_service.list_requirements(
        session, page=page, page_size=page_size, country_iso3=country_iso3
    )
    return Page(items=items, total=total, page=page, page_size=page_size)


@router.post("", response_model=CountryRequirementOut, status_code=201)
async def create_requirement(
    payload: CountryRequirementCreate,
    session: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(require_write_access),
) -> CountryRequirementOut:
    result = await country_requirements_service.create_requirement(session, payload, actor_id=user.id, actor_email=user.email)
    await session.commit()
    return result


@router.patch("/{requirement_id}", response_model=CountryRequirementOut)
async def update_requirement(
    requirement_id: UUID,
    payload: CountryRequirementUpdate,
    session: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(require_write_access),
) -> CountryRequirementOut:
    result = await country_requirements_service.update_requirement(
        session, requirement_id, payload, actor_id=user.id, actor_email=user.email
    )
    await session.commit()
    return result
