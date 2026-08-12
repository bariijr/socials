from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_current_user, require_delete_access, require_write_access
from app.database import get_db
from app.schemas.common import Page
from app.schemas.vendor import (
    VendorCoverageAirportCreate,
    VendorCoverageAirportOut,
    VendorCoverageCountryCreate,
    VendorCoverageCountryOut,
    VendorCreate,
    VendorOut,
    VendorUpdate,
)
from app.services import vendor_service

router = APIRouter(prefix="/vendors", tags=["reference-data"])


@router.get("", response_model=Page[VendorOut])
async def list_vendors(
    page: int = 1,
    page_size: int = Query(default=50, le=500),
    session: AsyncSession = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
) -> Page[VendorOut]:
    items, total = await vendor_service.list_vendors(session, page=page, page_size=page_size)
    return Page(items=items, total=total, page=page, page_size=page_size)


@router.get("/{vendor_id}", response_model=VendorOut)
async def get_vendor(
    vendor_id: UUID, session: AsyncSession = Depends(get_db), _user: CurrentUser = Depends(get_current_user)
) -> VendorOut:
    return await vendor_service.get_vendor(session, vendor_id)


@router.post("", response_model=VendorOut, status_code=201)
async def create_vendor(
    payload: VendorCreate, session: AsyncSession = Depends(get_db), user: CurrentUser = Depends(require_write_access)
) -> VendorOut:
    result = await vendor_service.create_vendor(session, payload, actor_id=user.id, actor_email=user.email)
    await session.commit()
    return result


@router.patch("/{vendor_id}", response_model=VendorOut)
async def update_vendor(
    vendor_id: UUID,
    payload: VendorUpdate,
    session: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(require_write_access),
) -> VendorOut:
    result = await vendor_service.update_vendor(session, vendor_id, payload, actor_id=user.id, actor_email=user.email)
    await session.commit()
    return result


@router.delete("/{vendor_id}", status_code=204)
async def delete_vendor(
    vendor_id: UUID,
    version: int,
    session: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(require_delete_access),
) -> None:
    await vendor_service.delete_vendor(session, vendor_id, version, actor_id=user.id, actor_email=user.email)
    await session.commit()


@router.get("/coverage/airports", response_model=Page[VendorCoverageAirportOut])
async def list_coverage_airports(
    page: int = 1,
    page_size: int = Query(default=50, le=500),
    icao: str | None = None,
    vendor_id: UUID | None = None,
    session: AsyncSession = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
) -> Page[VendorCoverageAirportOut]:
    items, total = await vendor_service.list_coverage_airports(
        session, page=page, page_size=page_size, icao=icao, vendor_id=vendor_id
    )
    return Page(items=items, total=total, page=page, page_size=page_size)


@router.post("/coverage/airports", response_model=VendorCoverageAirportOut, status_code=201)
async def create_coverage_airport(
    payload: VendorCoverageAirportCreate,
    session: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(require_write_access),
) -> VendorCoverageAirportOut:
    result = await vendor_service.create_coverage_airport(session, payload, actor_id=user.id, actor_email=user.email)
    await session.commit()
    return result


@router.get("/coverage/countries", response_model=Page[VendorCoverageCountryOut])
async def list_coverage_countries(
    page: int = 1,
    page_size: int = Query(default=50, le=500),
    country_iso3: str | None = None,
    vendor_id: UUID | None = None,
    session: AsyncSession = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
) -> Page[VendorCoverageCountryOut]:
    items, total = await vendor_service.list_coverage_countries(
        session, page=page, page_size=page_size, country_iso3=country_iso3, vendor_id=vendor_id
    )
    return Page(items=items, total=total, page=page, page_size=page_size)


@router.post("/coverage/countries", response_model=VendorCoverageCountryOut, status_code=201)
async def create_coverage_country(
    payload: VendorCoverageCountryCreate,
    session: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(require_write_access),
) -> VendorCoverageCountryOut:
    result = await vendor_service.create_coverage_country(session, payload, actor_id=user.id, actor_email=user.email)
    await session.commit()
    return result
