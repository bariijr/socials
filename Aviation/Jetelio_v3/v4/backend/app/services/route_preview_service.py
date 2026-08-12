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
class RoutePreview:
    distance_nm: float
    eet_hours: float
    states: list[tuple[str, str]]  # (iso3, name-or-code)
    firs: list[tuple[str, str | None]]
    track_points: list[tuple[float, float]]
    state_geometry: dict[str, dict]
    fir_geometry: dict[str, dict]


async def preview_route(session: AsyncSession, dep_icao: str, arr_icao: str) -> RoutePreview:
    route = await routing_engine_service.resolve_leg_route(session, dep_icao, arr_icao)
    settings_map = await settings_service.get_typed_settings_map(session)

    dep = await _get_airport(session, dep_icao)
    arr = await _get_airport(session, arr_icao)
    track = sample_great_circle_track(
        dep.lat, dep.lon, arr.lat, arr.lon, interval_nm=settings_map["route_sample_interval_nm"] * 3, min_points=PREVIEW_TRACK_MIN_POINTS
    )
    eet_hours = compute_eet_hours(route.distance_nm, settings_map["default_block_speed_kts"], settings_map["taxi_allowance_hours"])

    state_geometry = await geo_repository.fetch_simplified_country_geometry(session, [s.iso3 for s in route.states])
    fir_geometry = await geo_repository.fetch_simplified_fir_geometry(session, [f.icao_fir_code for f in route.firs])

    country_rows = (
        await session.execute(select(Country).where(Country.iso3.in_([s.iso3 for s in route.states])))
    ).scalars().all()
    country_names = {c.iso3: c.name for c in country_rows}

    return RoutePreview(
        distance_nm=route.distance_nm,
        eet_hours=eet_hours,
        states=[(s.iso3, country_names.get(s.iso3, s.iso3)) for s in route.states],
        firs=[(f.icao_fir_code, f.name) for f in route.firs],
        track_points=[(p.lat, p.lon) for p in track],
        state_geometry=state_geometry,
        fir_geometry=fir_geometry,
    )
