"""Live route preview for the leg builder — Engine 1 only (no permits,
capability or credentials, so no captcha/heavy compute is needed). Real
distance/EET/states/FIRs plus simplified real polygon geometry for a map,
all from data already in this system (route_cache, country_geometry,
fir_boundaries). Deliberately does NOT attempt an airway/waypoint route
string (SIDs, airways, STARs) — that requires a licensed navdata source
this system doesn't have, and fabricating one would be actively
dangerous on an aviation platform.
"""

from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession

from sqlalchemy import select

from app.core.errors import ValidationFailedError
from app.domain.great_circle import compute_eet_hours, sample_great_circle_track
from app.domain.permits import check_avoid_include_violation
from app.models.airport import Airport
from app.models.country import Country
from app.repositories import geo_repository
from app.services import routing_engine_service, settings_service

PREVIEW_TRACK_MIN_POINTS = 30


async def _get_airport(session: AsyncSession, icao: str) -> Airport:
    airport = await session.get(Airport, icao)
    if airport is None:
        raise ValidationFailedError("icao", f"Airport {icao} not found")
    return airport


@dataclass(frozen=True)
class ReroutePreview:
    found: bool
    extra_distance_nm: float | None
    extra_time_hours: float | None
    track_points: list[tuple[float, float]]
    states: list[tuple[str, str]]
    firs: list[tuple[str, str | None]]


@dataclass(frozen=True)
class RoutePreview:
    distance_nm: float
    eet_hours: float
    states: list[tuple[str, str]]  # (iso3, name-or-code)
    firs: list[tuple[str, str | None]]
    track_points: list[tuple[float, float]]
    state_geometry: dict[str, dict]
    fir_geometry: dict[str, dict]
    avoid_include_violated: bool = False
    reroute: ReroutePreview | None = None


async def preview_route(
    session: AsyncSession,
    dep_icao: str,
    arr_icao: str,
    *,
    avoid_states: set[str] | None = None,
    include_states: set[str] | None = None,
    avoid_firs: set[str] | None = None,
    include_firs: set[str] | None = None,
) -> RoutePreview:
    route = await routing_engine_service.resolve_leg_route(session, dep_icao, arr_icao)
    settings_map = await settings_service.get_typed_settings_map(session)

    dep = await _get_airport(session, dep_icao)
    arr = await _get_airport(session, arr_icao)
    track = sample_great_circle_track(
        dep.lat, dep.lon, arr.lat, arr.lon, interval_nm=settings_map["route_sample_interval_nm"] * 3, min_points=PREVIEW_TRACK_MIN_POINTS
    )
    eet_hours = compute_eet_hours(route.distance_nm, settings_map["default_block_speed_kts"], settings_map["taxi_allowance_hours"])

    route_states_iso3 = [s.iso3 for s in route.states]
    route_firs_codes = [f.icao_fir_code for f in route.firs]
    state_violation = check_avoid_include_violation(route_states_iso3, avoid_states or set(), include_states or set())
    fir_violation = check_avoid_include_violation(route_firs_codes, avoid_firs or set(), include_firs or set())
    avoid_include_violated = state_violation.violated or fir_violation.violated

    alt_state_codes: list[str] = []
    alt_fir_codes: list[tuple[str, str | None]] = []
    alt_track_points: list[tuple[float, float]] = []
    alt_found = False
    alt_extra_distance_nm: float | None = None
    alt_extra_time_hours: float | None = None
    if avoid_include_violated:
        alt = await routing_engine_service.find_alternate_route(
            session,
            dep_icao,
            arr_icao,
            route.distance_nm,
            avoid_states or set(),
            avoid_firs=avoid_firs,
            include_states=include_states,
            include_firs=include_firs,
            block_speed_kts=settings_map["default_block_speed_kts"],
            fuel_burn_kg_per_hr=None,
        )
        alt_found = alt.found
        alt_extra_distance_nm = alt.extra_distance_nm
        alt_extra_time_hours = alt.extra_time_hours
        alt_track_points = alt.track_points or []
        alt_state_codes = [s.iso3 for s in (alt.states or [])]
        alt_fir_codes = [(f.icao_fir_code, f.name) for f in (alt.firs or [])]

    all_state_codes = list({*route_states_iso3, *alt_state_codes})
    all_fir_codes = list({*route_firs_codes, *(code for code, _ in alt_fir_codes)})
    state_geometry = await geo_repository.fetch_simplified_country_geometry(session, all_state_codes)
    fir_geometry = await geo_repository.fetch_simplified_fir_geometry(session, all_fir_codes)

    country_rows = (await session.execute(select(Country).where(Country.iso3.in_(all_state_codes)))).scalars().all()
    country_names = {c.iso3: c.name for c in country_rows}

    reroute = (
        ReroutePreview(
            found=alt_found,
            extra_distance_nm=alt_extra_distance_nm,
            extra_time_hours=alt_extra_time_hours,
            track_points=alt_track_points,
            states=[(iso3, country_names.get(iso3, iso3)) for iso3 in alt_state_codes],
            firs=alt_fir_codes,
        )
        if avoid_include_violated
        else None
    )

    return RoutePreview(
        distance_nm=route.distance_nm,
        eet_hours=eet_hours,
        states=[(s.iso3, country_names.get(s.iso3, s.iso3)) for s in route.states],
        firs=[(f.icao_fir_code, f.name) for f in route.firs],
        track_points=[(p.lat, p.lon) for p in track],
        state_geometry=state_geometry,
        fir_geometry=fir_geometry,
        avoid_include_violated=avoid_include_violated,
        reroute=reroute,
    )


async def get_world_outline(session: AsyncSession) -> dict[str, dict]:
    """Every country's own real (heavily simplified) polygon — the map's
    background layer. Never changes at runtime, so the router leans on
    HTTP caching rather than a bespoke in-app cache table.
    """
    return await geo_repository.fetch_world_outline(session)
