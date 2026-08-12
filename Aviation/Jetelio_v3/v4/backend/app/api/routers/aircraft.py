from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_current_user, require_write_access
from app.database import get_db
from app.schemas.aircraft import (
    AircraftCreate,
    AircraftOut,
    AircraftPerformanceCreate,
    AircraftPerformanceOut,
    AircraftPerformanceUpdate,
    AircraftUpdate,
)
from app.schemas.common import Page
from app.services import aircraft_service, settings_service

router = APIRouter(tags=["reference-data"])


@router.get("/aircraft", response_model=Page[AircraftOut])
async def list_aircraft(
    page: int = 1,
    page_size: int = Query(default=50, le=500),
    operator_id: UUID | None = None,
    session: AsyncSession = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
) -> Page[AircraftOut]:
    items, total = await aircraft_service.list_aircraft(session, page=page, page_size=page_size, operator_id=operator_id)
    return Page(items=items, total=total, page=page, page_size=page_size)


@router.get("/aircraft/{aircraft_id}", response_model=AircraftOut)
async def get_aircraft(
    aircraft_id: UUID, session: AsyncSession = Depends(get_db), _user: CurrentUser = Depends(get_current_user)
) -> AircraftOut:
    return await aircraft_service.get_aircraft(session, aircraft_id)


@router.post("/aircraft", response_model=AircraftOut, status_code=201)
async def create_aircraft(
    payload: AircraftCreate, session: AsyncSession = Depends(get_db), user: CurrentUser = Depends(require_write_access)
) -> AircraftOut:
    result = await aircraft_service.create_aircraft(session, payload, actor_id=user.id, actor_email=user.email)
    await session.commit()
    return result


@router.patch("/aircraft/{aircraft_id}", response_model=AircraftOut)
async def update_aircraft(
    aircraft_id: UUID,
    payload: AircraftUpdate,
    session: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(require_write_access),
) -> AircraftOut:
    result = await aircraft_service.update_aircraft(session, aircraft_id, payload, actor_id=user.id, actor_email=user.email)
    await session.commit()
    return result


@router.get("/aircraft-performance", response_model=Page[AircraftPerformanceOut])
async def list_aircraft_performance(
    page: int = 1,
    page_size: int = Query(default=50, le=500),
    session: AsyncSession = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
) -> Page[AircraftPerformanceOut]:
    settings_map = await settings_service.get_typed_settings_map(session)
    items, total = await aircraft_service.list_aircraft_performance(
        session, page=page, page_size=page_size, reserve_margin_setting=settings_map["range_reserve_margin"]
    )
    return Page(items=items, total=total, page=page, page_size=page_size)


@router.get("/aircraft-performance/{icao_type}", response_model=AircraftPerformanceOut)
async def get_aircraft_performance(
    icao_type: str, session: AsyncSession = Depends(get_db), _user: CurrentUser = Depends(get_current_user)
) -> AircraftPerformanceOut:
    settings_map = await settings_service.get_typed_settings_map(session)
    return await aircraft_service.get_aircraft_performance(
        session, icao_type, reserve_margin_setting=settings_map["range_reserve_margin"]
    )


@router.post("/aircraft-performance", response_model=AircraftPerformanceOut, status_code=201)
async def create_aircraft_performance(
    payload: AircraftPerformanceCreate,
    session: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(require_write_access),
) -> AircraftPerformanceOut:
    settings_map = await settings_service.get_typed_settings_map(session)
    result = await aircraft_service.create_aircraft_performance(
        session,
        payload,
        reserve_margin_setting=settings_map["range_reserve_margin"],
        actor_id=user.id,
        actor_email=user.email,
    )
    await session.commit()
    return result


@router.patch("/aircraft-performance/{icao_type}", response_model=AircraftPerformanceOut)
async def update_aircraft_performance(
    icao_type: str,
    payload: AircraftPerformanceUpdate,
    session: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(require_write_access),
) -> AircraftPerformanceOut:
    settings_map = await settings_service.get_typed_settings_map(session)
    result = await aircraft_service.update_aircraft_performance(
        session,
        icao_type,
        payload,
        reserve_margin_setting=settings_map["range_reserve_margin"],
        actor_id=user.id,
        actor_email=user.email,
    )
    await session.commit()
    return result
