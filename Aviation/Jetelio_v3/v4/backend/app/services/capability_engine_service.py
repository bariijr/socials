"""Engine 3 (capability) — service layer. Fetches AircraftPerformance and
candidate tech-stop airports, calls app.domain.capability and reuses
app.domain.reference_status.resolve_aircraft_planning_status for the
engineer sign-off gate (not reimplemented here).
"""

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFoundError
from app.domain.capability import (
    CapabilityResult,
    TechStopCandidate,
    TechStopSuggestion,
    capability_check,
    compute_practical_range_nm,
    filter_tech_stop_candidates,
    is_capability_margin_tight,
)
from app.domain.reference_status import resolve_aircraft_planning_status
from app.models.aircraft import AircraftPerformance
from app.models.airport import Airport
from app.services import settings_service


@dataclass(frozen=True)
class CapabilityPlan:
    aircraft_icao_type: str
    max_range_nm: float | None
    practical_range_nm: float | None
    planning_status: str
    capability: CapabilityResult | None
    margin_tight: bool
    tech_stop_suggestions: list[TechStopSuggestion]


async def _fetch_tech_stop_candidates(
    session: AsyncSession, exclude_icao: set[str], avoid_states: set[str] | None = None
) -> list[TechStopCandidate]:
    stmt = select(Airport).where(Airport.is_airport_of_entry.is_(True), Airport.deleted_at.is_(None))
    if avoid_states:
        # A tech stop is a real landing, not just an overflight — suggesting
        # one inside a country the trip is explicitly avoiding would defeat
        # the constraint the user just set (task #124).
        stmt = stmt.where(Airport.country_iso3.not_in(avoid_states))
    rows = (await session.execute(stmt)).scalars().all()
    return [
        TechStopCandidate(
            icao=row.icao,
            lat=row.lat,
            lon=row.lon,
            longest_runway_ft=row.longest_runway_ft,
            fuel_grades=row.fuel_grades,
            is_airport_of_entry=row.is_airport_of_entry,
            operating_hours_present=row.operating_hours is not None,
        )
        for row in rows
        if row.icao not in exclude_icao
    ]


async def compute_leg_capability(
    session: AsyncSession,
    *,
    aircraft_icao_type: str,
    dep_icao: str,
    arr_icao: str,
    dep_lat: float,
    dep_lon: float,
    arr_lat: float,
    arr_lon: float,
    distance_nm: float,
    avoid_states: set[str] | None = None,
) -> CapabilityPlan:
    perf = await session.get(AircraftPerformance, aircraft_icao_type)
    if perf is None:
        raise NotFoundError("AircraftPerformance", aircraft_icao_type)

    settings_map = await settings_service.get_typed_settings_map(session)
    planning_status = resolve_aircraft_planning_status(
        verified=perf.verified, verified_by=perf.verified_by, verified_on=perf.verified_on
    )

    if perf.max_range_nm is None:
        return CapabilityPlan(
            aircraft_icao_type=aircraft_icao_type,
            max_range_nm=None,
            practical_range_nm=None,
            planning_status=planning_status,
            capability=None,
            margin_tight=False,
            tech_stop_suggestions=[],
        )

    practical_range_nm = compute_practical_range_nm(perf.max_range_nm, settings_map["range_reserve_margin"])
    capability = capability_check(distance_nm, practical_range_nm)
    margin_tight = is_capability_margin_tight(capability, settings_map["capability_tight_margin_fraction"])

    tech_stop_suggestions: list[TechStopSuggestion] = []
    if capability.exceeds:
        candidates = await _fetch_tech_stop_candidates(session, {dep_icao, arr_icao}, avoid_states)
        # No per-aircraft minimum-runway/fuel-grade requirement is modeled
        # yet (AircraftPerformance carries no landing-distance field), so
        # those two filters are left open here — range/AOE/operating-hours
        # still apply. Revisit once that data exists.
        tech_stop_suggestions = filter_tech_stop_candidates(
            dep_lat=dep_lat,
            dep_lon=dep_lon,
            arr_lat=arr_lat,
            arr_lon=arr_lon,
            direct_distance_nm=distance_nm,
            candidates=candidates,
            practical_range_nm=practical_range_nm,
            min_runway_ft=None,
            required_fuel_grades=None,
        )

    return CapabilityPlan(
        aircraft_icao_type=aircraft_icao_type,
        max_range_nm=perf.max_range_nm,
        practical_range_nm=practical_range_nm,
        planning_status=planning_status,
        capability=capability,
        margin_tight=margin_tight,
        tech_stop_suggestions=tech_stop_suggestions,
    )
