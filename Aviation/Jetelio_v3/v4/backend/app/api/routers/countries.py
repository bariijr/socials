from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_current_user, require_write_access
from app.database import get_db
from app.schemas.common import Page
from app.schemas.country import CountryCreate, CountryOut, CountryUpdate
from app.services import country_service

router = APIRouter(prefix="/countries", tags=["reference-data"])


@router.get("", response_model=Page[CountryOut])
async def list_countries(
    page: int = 1,
    page_size: int = Query(default=50, le=500),
    region: str | None = None,
    session: AsyncSession = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
) -> Page[CountryOut]:
    items, total = await country_service.list_countries(session, page=page, page_size=page_size, region=region)
    return Page(items=items, total=total, page=page, page_size=page_size)


@router.get("/{iso3}", response_model=CountryOut)
async def get_country(
    iso3: str, session: AsyncSession = Depends(get_db), _user: CurrentUser = Depends(get_current_user)
) -> CountryOut:
    return await country_service.get_country(session, iso3)


@router.post("", response_model=CountryOut, status_code=201)
async def create_country(
    payload: CountryCreate,
    session: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(require_write_access),
) -> CountryOut:
    result = await country_service.create_country(session, payload, actor_id=user.id, actor_email=user.email)
    await session.commit()
    return result


@router.patch("/{iso3}", response_model=CountryOut)
async def update_country(
    iso3: str,
    payload: CountryUpdate,
    session: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(require_write_access),
) -> CountryOut:
    result = await country_service.update_country(session, iso3, payload, actor_id=user.id, actor_email=user.email)
    await session.commit()
    return result
