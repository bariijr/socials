"""Trip Manager — authenticated. Role-based RBAC only (no row-level
operator/client scoping yet — see app.services.trip_service module
docstring). OPERATIONS_SPECIALIST can create/edit but not delete a leg,
matching the same require_write_access/require_delete_access split used
by every reference-data router.
"""

import io
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_current_user, require_delete_access, require_write_access
from app.core.errors import NotFoundError
from app.database import get_db
from app.models.trip import TripStatus
from app.schemas.common import Page
from app.schemas.trip import (
    AircraftLookupOut,
    CustomServiceAssignmentIn,
    ServiceAssignmentIn,
    TripCreateIn,
    TripDetailOut,
    TripLegIn,
    TripOut,
    TripUpdateIn,
)
from app.services import pnr_pdf_service, trip_service

router = APIRouter(prefix="/trips", tags=["trips"])


@router.get("/aircraft-lookup", response_model=AircraftLookupOut)
async def lookup_aircraft(
    registration: str,
    session: AsyncSession = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
) -> AircraftLookupOut:
    """Admin-only (Trip Manager) — autopopulates AC type/MTOW/operator/
    billing-client options from a registration. Never exposed publicly;
    see app.schemas.trip.AircraftLookupOut for why.
    """
    result = await trip_service.lookup_aircraft_by_registration(session, registration)
    if result is None:
        raise NotFoundError("Aircraft", registration)
    return result


@router.get("", response_model=Page[TripOut])
async def list_trips(
    page: int = 1,
    page_size: int = Query(default=50, le=500),
    status: TripStatus | None = None,
    session: AsyncSession = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
) -> Page[TripOut]:
    items, total = await trip_service.list_trips(session, page=page, page_size=page_size, status=status)
    return Page(items=items, total=total, page=page, page_size=page_size)


@router.get("/{trip_id}", response_model=TripDetailOut)
async def get_trip(
    trip_id: UUID, session: AsyncSession = Depends(get_db), _user: CurrentUser = Depends(get_current_user)
) -> TripDetailOut:
    return await trip_service.get_trip(session, trip_id)


@router.get("/{trip_id}/pnr.pdf")
async def download_pnr(
    trip_id: UUID, session: AsyncSession = Depends(get_db), _user: CurrentUser = Depends(get_current_user)
) -> StreamingResponse:
    """PNR/itinerary PDF (task #82) — pure presentation over the same
    TripDetailOut every other trip view reads, never a second data path.
    """
    trip = await trip_service.get_trip(session, trip_id)
    pdf_bytes = pnr_pdf_service.render_pnr_pdf(trip)
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="jetelio-pnr-{str(trip_id)[:8]}.pdf"'},
    )


@router.post("", response_model=TripDetailOut, status_code=201)
async def create_trip(
    payload: TripCreateIn, session: AsyncSession = Depends(get_db), user: CurrentUser = Depends(require_write_access)
) -> TripDetailOut:
    trip = await trip_service.create_trip(session, payload, actor_id=user.id, actor_email=user.email)
    await session.commit()
    return await trip_service.get_trip(session, trip.id)


@router.patch("/{trip_id}", response_model=TripDetailOut)
async def update_trip(
    trip_id: UUID,
    payload: TripUpdateIn,
    session: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(require_write_access),
) -> TripDetailOut:
    await trip_service.update_trip(session, trip_id, payload, actor_id=user.id, actor_email=user.email)
    await session.commit()
    return await trip_service.get_trip(session, trip_id)


@router.post("/{trip_id}/legs", response_model=TripDetailOut, status_code=201)
async def add_leg(
    trip_id: UUID,
    payload: TripLegIn,
    session: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(require_write_access),
) -> TripDetailOut:
    await trip_service.add_leg(session, trip_id, payload, actor_id=user.id, actor_email=user.email)
    await session.commit()
    return await trip_service.get_trip(session, trip_id)


@router.patch("/{trip_id}/legs/{leg_id}", response_model=TripDetailOut)
async def update_leg(
    trip_id: UUID,
    leg_id: UUID,
    payload: TripLegIn,
    session: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(require_write_access),
) -> TripDetailOut:
    await trip_service.update_leg(session, trip_id, leg_id, payload, actor_id=user.id, actor_email=user.email)
    await session.commit()
    return await trip_service.get_trip(session, trip_id)


@router.delete("/{trip_id}/legs/{leg_id}", response_model=TripDetailOut)
async def remove_leg(
    trip_id: UUID,
    leg_id: UUID,
    session: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(require_delete_access),
) -> TripDetailOut:
    await trip_service.remove_leg(session, trip_id, leg_id, actor_id=user.id, actor_email=user.email)
    await session.commit()
    return await trip_service.get_trip(session, trip_id)


@router.put("/{trip_id}/legs/{leg_id}/service-assignments/{service_code}/{icao}", response_model=TripDetailOut)
async def update_service_assignment(
    trip_id: UUID,
    leg_id: UUID,
    service_code: str,
    icao: str,
    payload: ServiceAssignmentIn,
    session: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(require_write_access),
) -> TripDetailOut:
    await trip_service.update_service_assignment(
        session, trip_id, leg_id, service_code, icao, payload, actor_id=user.id, actor_email=user.email
    )
    await session.commit()
    return await trip_service.get_trip(session, trip_id)


@router.post("/{trip_id}/legs/{leg_id}/services/custom", response_model=TripDetailOut, status_code=201)
async def add_custom_service_assignment(
    trip_id: UUID,
    leg_id: UUID,
    payload: CustomServiceAssignmentIn,
    session: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(require_write_access),
) -> TripDetailOut:
    """"One may choose to add more sub-services" (task #105) — any
    service-catalogue entry (including GH sub-services like crew/pax
    transport or GPU) beyond what the engine auto-generated for this
    leg/stop."""
    await trip_service.add_custom_service_assignment(session, trip_id, leg_id, payload, actor_id=user.id, actor_email=user.email)
    await session.commit()
    return await trip_service.get_trip(session, trip_id)


@router.delete("/{trip_id}/legs/{leg_id}/services/custom/{service_code}/{icao}", response_model=TripDetailOut)
async def remove_custom_service_assignment(
    trip_id: UUID,
    leg_id: UUID,
    service_code: str,
    icao: str,
    session: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(require_delete_access),
) -> TripDetailOut:
    await trip_service.remove_custom_service_assignment(
        session, trip_id, leg_id, service_code, icao, actor_id=user.id, actor_email=user.email
    )
    await session.commit()
    return await trip_service.get_trip(session, trip_id)
