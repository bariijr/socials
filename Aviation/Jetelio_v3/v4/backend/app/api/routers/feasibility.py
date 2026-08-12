"""Public Feasibility IQ — the one unauthenticated front door. No cost or
vendor data anywhere in this router; see app.services.feasibility_iq_service
for the public-safe projection of the internal engine output.
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

import logging

from app.core.email_client import send_email
from app.core.rate_limit import rate_limit
from app.database import get_db
from app.schemas.feasibility import (
    AircraftTypeLookupOut,
    AirportLookupOut,
    CountryLookupOut,
    FeasibilityCheckIn,
    FeasibilityCheckOut,
    FirLookupOut,
    FirOut,
    RequestQuoteIn,
    RequestQuoteOut,
    RoutePreviewOut,
    StateOut,
)
from app.services import feasibility_iq_service, notification_service, pnr_pdf_service, route_preview_service, trip_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/feasibility", tags=["feasibility-iq"])


@router.get("/airports", response_model=list[AirportLookupOut], dependencies=[Depends(rate_limit("lookup"))])
async def airports_lookup(
    q: str = Query(min_length=2, max_length=100), session: AsyncSession = Depends(get_db)
) -> list[AirportLookupOut]:
    return await feasibility_iq_service.search_airports(session, q)


@router.get("/aircraft-types", response_model=list[AircraftTypeLookupOut], dependencies=[Depends(rate_limit("lookup"))])
async def aircraft_types_lookup(
    q: str = Query(min_length=1, max_length=100), session: AsyncSession = Depends(get_db)
) -> list[AircraftTypeLookupOut]:
    return await feasibility_iq_service.search_aircraft_types(session, q)


@router.get("/countries", response_model=list[CountryLookupOut], dependencies=[Depends(rate_limit("lookup"))])
async def countries_lookup(
    q: str = Query(min_length=2, max_length=100), session: AsyncSession = Depends(get_db)
) -> list[CountryLookupOut]:
    return await feasibility_iq_service.search_countries(session, q)


@router.get("/firs", response_model=list[FirLookupOut], dependencies=[Depends(rate_limit("lookup"))])
async def firs_lookup(
    q: str = Query(min_length=2, max_length=100), session: AsyncSession = Depends(get_db)
) -> list[FirLookupOut]:
    return await feasibility_iq_service.search_firs(session, q)


@router.get("/route-preview", response_model=RoutePreviewOut, dependencies=[Depends(rate_limit("lookup"))])
async def route_preview(
    dep_icao: str = Query(min_length=3, max_length=4),
    arr_icao: str = Query(min_length=3, max_length=4),
    session: AsyncSession = Depends(get_db),
) -> RoutePreviewOut:
    """Engine 1 only — real distance/EET/states/FIRs and simplified real
    polygon geometry for a map. No captcha (cheap, read-only, no cost or
    vendor data) so the leg builder can call this live as soon as both
    airports are picked, on both Feasibility IQ and the authenticated
    admin trip builder (route geometry itself isn't sensitive).
    """
    preview = await route_preview_service.preview_route(session, dep_icao.upper(), arr_icao.upper())
    await session.commit()
    return RoutePreviewOut(
        distance_nm=preview.distance_nm,
        eet_hours=preview.eet_hours,
        states=[StateOut(iso3=iso3, name=name) for iso3, name in preview.states],
        firs=[FirOut(icao_fir_code=code, name=name) for code, name in preview.firs],
        track_points=preview.track_points,
        state_geometry=preview.state_geometry,
        fir_geometry=preview.fir_geometry,
    )


@router.post("/check", response_model=FeasibilityCheckOut, dependencies=[Depends(rate_limit("check"))])
async def check(payload: FeasibilityCheckIn, session: AsyncSession = Depends(get_db)) -> FeasibilityCheckOut:
    result = await feasibility_iq_service.check_trip_feasibility(
        session,
        aircraft_icao_type=payload.aircraft_icao_type.upper(),
        aircraft_registration=payload.aircraft_registration,
        entered_mtow_kg=payload.entered_mtow_kg,
        operator_airline_name=payload.operator_airline_name,
        persons=payload.persons,
        legs=payload.legs,
    )
    await session.commit()
    return result


@router.post("/request-quote", response_model=RequestQuoteOut, dependencies=[Depends(rate_limit("quote"))])
async def request_quote(payload: RequestQuoteIn, session: AsyncSession = Depends(get_db)) -> RequestQuoteOut:
    trip = await feasibility_iq_service.create_enquiry_trip(
        session,
        check_id=payload.check_id,
        contact_name=payload.contact_name,
        contact_email=payload.contact_email,
        contact_phone=payload.contact_phone,
        notes=payload.notes,
    )
    await session.commit()

    # Notification + PNR email (task #106) are best-effort side effects of
    # an already-committed trip — neither failing should turn a
    # successfully created enquiry into a 500 for the public submitter.
    try:
        await notification_service.create_notification(
            session,
            entity_type="Trip",
            entity_id=str(trip.id),
            kind="NEW_ENQUIRY",
            message=f"New enquiry from {trip.requested_by_name or trip.requested_by_email or 'unknown'} "
            f"({trip.aircraft_registration or trip.operator_airline_name or 'aircraft TBD'})",
        )
        await session.commit()
    except Exception:
        logger.exception("Failed to write NEW_ENQUIRY notification for trip %s", trip.id)

    if trip.requested_by_email:
        try:
            detail = await trip_service.get_trip(session, trip.id)
            pdf_bytes = pnr_pdf_service.render_pnr_pdf(detail)
            await send_email(
                to=[trip.requested_by_email],
                subject=f"Your Jetelio itinerary — reference {str(trip.id)[:8]}",
                body=(
                    f"Thank you for your enquiry, {trip.requested_by_name or ''}.\n\n"
                    "Your itinerary (PNR) is attached for reference. Our team will be in touch shortly.\n\n"
                    f"Reference: {trip.id}"
                ),
                attachments=[(f"jetelio-pnr-{str(trip.id)[:8]}.pdf", pdf_bytes, "application/pdf")],
            )
        except Exception:
            logger.exception("Failed to send PNR email for trip %s", trip.id)

    return RequestQuoteOut(trip_id=str(trip.id), status=trip.status.value)
