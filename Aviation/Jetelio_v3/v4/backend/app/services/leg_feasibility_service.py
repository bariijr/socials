"""The single-leg composition of all four engines — exactly what Phase 3's
Feasibility IQ endpoint will call. Phase 3 only needs to add the public
router (rate limiting, no cost/vendor data) and the landing page;
the computation itself lives here.
"""

from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ValidationFailedError
from app.domain.permits import DeadlineStatus, StopEvent, compute_state_crossings, determine_feasibility_verdict
from app.models.aircraft import AircraftPerformance
from app.models.airport import Airport
from app.services import (
    capability_engine_service,
    credentials_engine_service,
    nav_fee_service,
    permit_engine_service,
    permit_fee_service,
    routing_engine_service,
    settings_service,
)
from app.services.capability_engine_service import CapabilityPlan
from app.services.credentials_engine_service import LegCredentialsResult, PersonInput
from app.services.nav_fee_service import NavFeesResult
from app.services.permit_engine_service import PermitPlan
from app.services.permit_fee_service import PermitFeesResult
from app.services.routing_engine_service import RerouteResult, RoutePlan


@dataclass(frozen=True)
class LegFeasibilityResult:
    route: RoutePlan
    eet_hours: float
    # The resolved departure instant — always populated, even when the
    # caller drove the plan off required_arrival_datetime instead (see
    # compute_leg_feasibility). Callers persist this, never the raw input.
    reference_datetime: datetime
    filed_route: str | None
    permits: PermitPlan
    capability: CapabilityPlan
    credentials: LegCredentialsResult
    reroute: RerouteResult | None
    nav_fees: NavFeesResult
    permit_fees: PermitFeesResult
    verdict: str


async def _get_airport(session: AsyncSession, icao: str) -> Airport:
    airport = await session.get(Airport, icao)
    if airport is None:
        raise ValidationFailedError("icao", f"Airport {icao} not found")
    return airport


async def compute_leg_feasibility(
    session: AsyncSession,
    *,
    leg_index: int = 0,
    dep_icao: str,
    arr_icao: str,
    aircraft_icao_type: str,
    persons: list[PersonInput],
    reference_datetime: datetime | None = None,
    required_arrival_datetime: datetime | None = None,
    filed_route: str | None = None,
    avoid_states: set[str] | None = None,
    include_states: set[str] | None = None,
    avoid_firs: set[str] | None = None,
    include_firs: set[str] | None = None,
) -> LegFeasibilityResult:
    """Exactly one of reference_datetime/required_arrival_datetime must be
    given (enforced upstream by app.schemas.feasibility.LegCheckIn). Route
    and EET are resolved first regardless of which was given, so a
    required arrival time can be back-calculated into a departure instant
    before anything else (permits, entry/exit times, nav fees) runs — they
    all key off reference_datetime exactly as before.
    """
    avoid_states = avoid_states or set()
    include_states = include_states or set()
    avoid_firs = avoid_firs or set()
    include_firs = include_firs or set()

    dep = await _get_airport(session, dep_icao)
    arr = await _get_airport(session, arr_icao)
    if dep.country_iso3 is None:
        raise ValidationFailedError("dep_icao", f"{dep_icao} has no resolved country — cannot plan a leg from it")
    if arr.country_iso3 is None:
        raise ValidationFailedError("arr_icao", f"{arr_icao} has no resolved country — cannot plan a leg to it")

    settings_map = await settings_service.get_typed_settings_map(session)
    perf = await session.get(AircraftPerformance, aircraft_icao_type)

    route = await routing_engine_service.resolve_leg_route(session, dep_icao, arr_icao)
    eet_hours = routing_engine_service.resolve_eet_hours(
        route.distance_nm, perf.cruise_tas_kts if perf else None, settings_map
    )
    if reference_datetime is None:
        if required_arrival_datetime is None:
            raise ValidationFailedError(
                "reference_datetime", "Either reference_datetime or required_arrival_datetime is required"
            )
        reference_datetime = required_arrival_datetime - timedelta(hours=eet_hours)
    trip_end = reference_datetime + timedelta(hours=eet_hours)

    route_states = [s.iso3 for s in route.states]
    route_firs = [f.icao_fir_code for f in route.firs]
    stops = [
        StopEvent(country_iso3=dep.country_iso3, icao=dep_icao, event_datetime=reference_datetime),
        StopEvent(country_iso3=arr.country_iso3, icao=arr_icao, event_datetime=trip_end),
    ]
    state_crossings = compute_state_crossings(
        [(s.iso3, s.first_entry_index) for s in route.states], route.sample_point_count, reference_datetime, eet_hours
    )

    permits = await permit_engine_service.compute_leg_permits(
        session,
        leg_index=leg_index,
        route_states=route_states,
        route_firs=route_firs,
        departure_iso3=dep.country_iso3,
        arrival_iso3=arr.country_iso3,
        reference_datetime=reference_datetime,
        stops=stops,
        state_crossings=state_crossings,
        avoid_states=avoid_states,
        include_states=include_states,
        avoid_firs=avoid_firs,
        include_firs=include_firs,
    )

    capability = await capability_engine_service.compute_leg_capability(
        session,
        aircraft_icao_type=aircraft_icao_type,
        dep_icao=dep_icao,
        arr_icao=arr_icao,
        dep_lat=dep.lat,
        dep_lon=dep.lon,
        arr_lat=arr.lat,
        arr_lon=arr.lon,
        distance_nm=route.distance_nm,
    )

    credentials = await credentials_engine_service.compute_leg_credentials(
        session,
        persons=persons,
        arrival_iso3=arr.country_iso3,
        arrival_icao=arr_icao,
        trip_end_date=trip_end.date(),
        max_pax=perf.max_pax if perf else None,
    )

    reroute: RerouteResult | None = None
    if permits.avoid_include_violated:
        reroute = await routing_engine_service.find_alternate_route(
            session,
            dep_icao,
            arr_icao,
            route.distance_nm,
            avoid_states,
            avoid_firs=avoid_firs,
            block_speed_kts=perf.cruise_tas_kts if perf and perf.cruise_tas_kts else settings_map["default_block_speed_kts"],
            fuel_burn_kg_per_hr=perf.fuel_burn_kg_per_hr if perf else None,
        )

    capability_exceeds_even_with_tech_stop = bool(
        capability.capability and capability.capability.exceeds and not capability.tech_stop_suggestions
    )
    deadline_urgent = any(
        d.deadline_status == DeadlineStatus.URGENT
        for d in (
            [p.deadline for p in permits.overflight_permits]
            + [p.deadline for p in permits.landing_permits]
            + [g.deadline for g in permits.ground_handling_orders]
        )
    )
    margin_tight = capability.margin_tight or deadline_urgent

    verdict = determine_feasibility_verdict(
        capability_exceeds_even_with_tech_stop=capability_exceeds_even_with_tech_stop,
        avoid_include_violated=permits.avoid_include_violated,
        reroute_found=bool(reroute and reroute.found),
        margin_tight=margin_tight,
    )

    nav_fees = await nav_fee_service.compute_leg_nav_fees(
        session,
        route=route,
        aircraft_mtow_kg=perf.mtow_kg if perf else None,
        margin_percent=settings_map["nav_fee_margin_percent"],
    )

    permit_fees = await permit_fee_service.compute_leg_permit_fees(
        session,
        route=route,
        permits=permits,
        aircraft_mtow_kg=perf.mtow_kg if perf else None,
        jtl_service_fee_usd=settings_map["jtl_service_fee_usd"],
    )

    return LegFeasibilityResult(
        route=route,
        eet_hours=eet_hours,
        reference_datetime=reference_datetime,
        filed_route=filed_route,
        permits=permits,
        capability=capability,
        credentials=credentials,
        reroute=reroute,
        nav_fees=nav_fees,
        permit_fees=permit_fees,
        verdict=verdict,
    )
