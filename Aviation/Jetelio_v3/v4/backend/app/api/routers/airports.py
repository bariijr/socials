from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_current_user, require_delete_access, require_write_access
from app.database import get_db
from app.schemas.airport import AirportCreate, AirportOut, AirportUpdate
from app.schemas.common import Page
from app.services import airport_service

router = APIRouter(prefix="/airports", tags=["reference-data"])


@router.get("", response_model=Page[AirportOut])
async def list_airports(
    page: int = 1,
    page_size: int = Query(default=50, le=500),
    country_iso3: str | None = None,
    session: AsyncSession = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
) -> Page[AirportOut]:
    items, total = await airport_service.list_airports(
        session, page=page, page_size=page_size, country_iso3=country_iso3
    )
    return Page(items=items, total=total, page=page, page_size=page_size)


@router.get("/{icao}", response_model=AirportOut)
async def get_airport(
    icao: str, session: AsyncSession = Depends(get_db), _user: CurrentUser = Depends(get_current_user)
) -> AirportOut:
    return await airport_service.get_airport(session, icao)


@router.post("", response_model=AirportOut, status_code=201)
async def create_airport(
    payload: AirportCreate, session: AsyncSession = Depends(get_db), user: CurrentUser = Depends(require_write_access)
) -> AirportOut:
    result = await airport_service.create_airport(session, payload, actor_id=user.id, actor_email=user.email)
    await session.commit()
    return result


@router.patch("/{icao}", response_model=AirportOut)
async def update_airport(
    icao: str,
    payload: AirportUpdate,
    session: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(require_write_access),
) -> AirportOut:
    result = await airport_service.update_airport(session, icao, payload, actor_id=user.id, actor_email=user.email)
    await session.commit()
    return result


@router.delete("/{icao}", status_code=204)
async def delete_airport(
    icao: str,
    version: int,
    session: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(require_delete_access),
) -> None:
    await airport_service.delete_airport(session, icao, version, actor_id=user.id, actor_email=user.email)
    await session.commit()
