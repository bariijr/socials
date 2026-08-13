"""Public Feasibility IQ — the one unauthenticated front door. No cost or
vendor data anywhere in this router; see app.services.feasibility_iq_service
for the public-safe projection of the internal engine output.
"""

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

import logging

from app.config import get_settings
from app.core.chat import dispatcher as chat_dispatcher
from app.core.email_client import send_email
from app.core.errors import NotFoundError
from app.core.rate_limit import rate_limit
from app.database import get_db
from app.schemas.feasibility import (
    AircraftTypeLookupOut,
    AirportLookupOut,
    ChatLegDraftOut,
    ChatParseIn,
    ChatTripDraftOut,
    CountryLookupOut,
    FeasibilityCheckIn,
    FeasibilityCheckOut,
    FirLookupOut,
    FirOut,
    PublicAircraftLookupOut,
    RequestQuoteIn,
    RequestQuoteOut,
    ReroutePreviewOut,
    ResolvedAircraftTypeOut,
    ResolvedAirportOut,
    ResolvedCountryOut,
    RoutePreviewOut,
    StateOut,
    WorldOutlineOut,
)
from app.schemas.person_role import PersonRoleOut
from app.services import (
    feasibility_iq_service,
    notification_service,
    person_role_service,
    pnr_pdf_service,
    route_preview_service,
    trip_chat_service,
    trip_service,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/feasibility", tags=["feasibility-iq"])


@router.get("/airports", response_model=list[AirportLookupOut], dependencies=[Depends(rate_limit("lookup"))])
async def airports_lookup(
    q: str = Query(min_length=2, max_length=100), session: AsyncSession = Depends(get_db)
) -> list[AirportLookupOut]:
    return await feasibility_iq_service.search_airports(session, q)


@router.get("/person-roles", response_model=list[PersonRoleOut], dependencies=[Depends(rate_limit("lookup"))])
async def person_roles_lookup(session: AsyncSession = Depends(get_db)) -> list[PersonRoleOut]:
    """Task #120 — the full active role list (small, no query param needed
    unlike the search-style lookups above) for the public Crew & Pax
    picker. Public, not the admin-authenticated /person-roles CRUD
    router — same public-lookup pattern as /countries, /firs,
    /aircraft-types above."""
    return [r for r in await person_role_service.list_roles(session) if r.active]


@router.get("/aircraft-types", response_model=list[AircraftTypeLookupOut], dependencies=[Depends(rate_limit("lookup"))])
async def aircraft_types_lookup(
    q: str = Query(min_length=1, max_length=100), session: AsyncSession = Depends(get_db)
) -> list[AircraftTypeLookupOut]:
    return await feasibility_iq_service.search_aircraft_types(session, q)


@router.get("/aircraft-lookup", response_model=PublicAircraftLookupOut, dependencies=[Depends(rate_limit("lookup"))])
async def aircraft_lookup(
    registration: str = Query(min_length=1, max_length=20), session: AsyncSession = Depends(get_db)
) -> PublicAircraftLookupOut:
    """Public-safe registration autofill for the VIQ door — type + MTOW
    only. Deliberately not the admin Trip Manager's `/trips/aircraft-lookup`
    (see PublicAircraftLookupOut's docstring): this never returns operator
    name, contact details, or billing clients, so a stranger typing any
    real tail number learns only its type and MTOW, not who operates it.
    """
    result = await feasibility_iq_service.lookup_aircraft_by_registration(session, registration)
    if result is None:
        raise NotFoundError("Aircraft", registration)
    return result


@router.post(
    "/chat-parse",
    response_model=ChatTripDraftOut,
    dependencies=[Depends(rate_limit("chat", limit_setting_key="chat_parse_rate_limit_per_hour"))],
)
async def chat_parse(payload: ChatParseIn, session: AsyncSession = Depends(get_db)) -> ChatTripDraftOut:
    """Parses a free-text or structured permit-request message into a
    pre-fillable trip/leg draft (task #125; ollama/deepseek/anthropic/
    openai all wired at once and tried in priority order with workload-
    based failover since task #131) — used to pre-fill the existing
    trip/leg builder form on both VIQ and admin, never to submit anything
    directly. Public (no cost/vendor data involved, same rationale as the
    rest of this router) but on its own, much stricter rate-limit bucket
    since each call is a real LLM inference request.
    """
    if not await chat_dispatcher.is_any_provider_available(session):
        raise HTTPException(status_code=503, detail="Trip-builder chat isn't configured on this deployment yet.")

    draft = await trip_chat_service.parse_trip_message(session, payload.message, today=date.today())
    if draft is None:
        raise HTTPException(
            status_code=502, detail="Couldn't parse that message — try rephrasing, or fill in the form manually."
        )

    return ChatTripDraftOut(
        aircraft_registration=draft.aircraft_registration,
        aircraft_type=(
            ResolvedAircraftTypeOut(query=draft.aircraft_type.query, icao_type=draft.aircraft_type.icao_type, name=draft.aircraft_type.name)
            if draft.aircraft_type
            else None
        ),
        operator_name=draft.operator_name,
        crew_count=draft.crew_count,
        pax_count=draft.pax_count,
        legs=[
            ChatLegDraftOut(
                departure=ResolvedAirportOut(query=leg.departure.query, icao=leg.departure.icao, name=leg.departure.name),
                arrival=ResolvedAirportOut(query=leg.arrival.query, icao=leg.arrival.icao, name=leg.arrival.name),
                departure_date=leg.departure_date,
                departure_time_utc=leg.departure_time_utc,
                avoid_countries=[ResolvedCountryOut(query=c.query, iso3=c.iso3, name=c.name) for c in leg.avoid_countries],
                include_countries=[ResolvedCountryOut(query=c.query, iso3=c.iso3, name=c.name) for c in leg.include_countries],
            )
            for leg in draft.legs
        ],
        warnings=draft.warnings,
    )


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


@router.get("/world-outline", response_model=WorldOutlineOut, dependencies=[Depends(rate_limit("lookup"))])
async def world_outline(response: Response, session: AsyncSession = Depends(get_db)) -> WorldOutlineOut:
    """Every country's own real (heavily simplified) Natural Earth polygon
    — the route map's world-scale background layer. Country borders don't
    move between requests, so this is safe for the frontend to cache
    indefinitely rather than refetch per page.
    """
    countries = await route_preview_service.get_world_outline(session)
    response.headers["Cache-Control"] = "public, max-age=86400"
    return WorldOutlineOut(countries=countries)


@router.get("/route-preview", response_model=RoutePreviewOut, dependencies=[Depends(rate_limit("lookup"))])
async def route_preview(
    dep_icao: str = Query(min_length=3, max_length=4),
    arr_icao: str = Query(min_length=3, max_length=4),
    avoid_states: list[str] = Query(default=[]),
    include_states: list[str] = Query(default=[]),
    avoid_firs: list[str] = Query(default=[]),
    include_firs: list[str] = Query(default=[]),
    session: AsyncSession = Depends(get_db),
) -> RoutePreviewOut:
    """Engine 1 only — real distance/EET/states/FIRs and simplified real
    polygon geometry for a map. No captcha (cheap, read-only, no cost or
    vendor data) so the leg builder can call this live as soon as both
    airports are picked, on both Feasibility IQ and the authenticated
    admin trip builder (route geometry itself isn't sensitive).

    avoid/include params are optional — when given and the direct route
    above actually violates one of them, the response's `reroute` carries
    the real alternate track (not just a distance delta), so the map can
    show a trajectory that actually changes instead of always drawing the
    unconstrained direct route.
    """
    preview = await route_preview_service.preview_route(
        session,
        dep_icao.upper(),
        arr_icao.upper(),
        avoid_states={s.upper() for s in avoid_states},
        include_states={s.upper() for s in include_states},
        avoid_firs={f.upper() for f in avoid_firs},
        include_firs={f.upper() for f in include_firs},
    )
    await session.commit()
    return RoutePreviewOut(
        distance_nm=preview.distance_nm,
        eet_hours=preview.eet_hours,
        states=[StateOut(iso3=iso3, name=name) for iso3, name in preview.states],
        firs=[FirOut(icao_fir_code=code, name=name) for code, name in preview.firs],
        track_points=preview.track_points,
        state_geometry=preview.state_geometry,
        fir_geometry=preview.fir_geometry,
        avoid_include_violated=preview.avoid_include_violated,
        reroute=(
            ReroutePreviewOut(
                found=preview.reroute.found,
                extra_distance_nm=preview.reroute.extra_distance_nm,
                extra_time_hours=preview.reroute.extra_time_hours,
                track_points=preview.reroute.track_points,
                states=[StateOut(iso3=iso3, name=name) for iso3, name in preview.reroute.states],
                firs=[FirOut(icao_fir_code=code, name=name) for code, name in preview.reroute.firs],
            )
            if preview.reroute is not None
            else None
        ),
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
