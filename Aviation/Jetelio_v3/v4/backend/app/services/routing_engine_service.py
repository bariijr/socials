"""Engine 1 (routing) — service layer. Assembles DB data, calls the pure
domain functions in app.domain.great_circle and app.domain.waypoint_routing,
and owns the route_cache read/write. No business logic of its own lives
here beyond that assembly, matching app.services.readiness_service.
"""

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFoundError
from app.core.rule_engine import RULE_ENGINE_VERSION
from app.domain.great_circle import (
    compute_eet_hours,
    great_circle_distance_nm,
    initial_bearing_deg,
    offset_point_lateral,
    sample_great_circle_track,
)
from app.domain.waypoint_routing import a_star_search
from app.models.airport import Airport
from app.models.route_cache import RouteCache
from app.repositories import geo_repository
from app.services import settings_service


@dataclass(frozen=True)
class StateEntry:
    iso3: str
    first_entry_index: int


@dataclass(frozen=True)
class FirEntry:
    icao_fir_code: str
    name: str | None
    first_entry_index: int


@dataclass(frozen=True)
class RoutePlan:
    dep_icao: str
    arr_icao: str
    distance_nm: float
    sample_point_count: int
    states: list[StateEntry]
    firs: list[FirEntry]
    from_cache: bool


def _states_to_json(states: list[StateEntry]) -> list[dict]:
    return [{"iso3": s.iso3, "first_entry_index": s.first_entry_index} for s in states]


def _firs_to_json(firs: list[FirEntry]) -> list[dict]:
    return [{"icao_fir_code": f.icao_fir_code, "name": f.name, "first_entry_index": f.first_entry_index} for f in firs]


async def _get_airport(session: AsyncSession, icao: str) -> Airport:
    airport = await session.get(Airport, icao)
    if airport is None:
        raise NotFoundError("Airport", icao)
    return airport


async def resolve_leg_route(session: AsyncSession, dep_icao: str, arr_icao: str) -> RoutePlan:
    """Reads the cache first; on a miss, samples the track, resolves every
    sample against country/FIR polygons in two batched queries, and writes
    the result back keyed on (dep_icao, arr_icao, RULE_ENGINE_VERSION).
    """
    cached = (
        await session.execute(
            select(RouteCache).where(
                RouteCache.dep_icao == dep_icao,
                RouteCache.arr_icao == arr_icao,
                RouteCache.rule_engine_version == RULE_ENGINE_VERSION,
            )
        )
    ).scalar_one_or_none()
    if cached is not None:
        return RoutePlan(
            dep_icao=dep_icao,
            arr_icao=arr_icao,
            distance_nm=cached.distance_nm,
            sample_point_count=cached.sample_point_count,
            states=[StateEntry(**s) for s in cached.states],
            firs=[FirEntry(**f) for f in cached.firs],
            from_cache=True,
        )

    dep = await _get_airport(session, dep_icao)
    arr = await _get_airport(session, arr_icao)
    settings_map = await settings_service.get_typed_settings_map(session)

    points = sample_great_circle_track(
        dep.lat,
        dep.lon,
        arr.lat,
        arr.lon,
        interval_nm=settings_map["route_sample_interval_nm"],
        min_points=settings_map["route_sample_min_points"],
    )
    lats = [p.lat for p in points]
    lons = [p.lon for p in points]

    country_hits = geo_repository.first_entry_ordered(await geo_repository.resolve_country_hits(session, lats, lons))
    fir_hits = geo_repository.first_entry_ordered(await geo_repository.resolve_fir_hits(session, lats, lons))

    states = [StateEntry(iso3=h.code, first_entry_index=h.point_index) for h in country_hits]
    firs = [FirEntry(icao_fir_code=h.code, name=h.name, first_entry_index=h.point_index) for h in fir_hits]
    distance_nm = points[-1].cumulative_nm

    session.add(
        RouteCache(
            dep_icao=dep_icao,
            arr_icao=arr_icao,
            rule_engine_version=RULE_ENGINE_VERSION,
            distance_nm=distance_nm,
            sample_point_count=len(points),
            states=_states_to_json(states),
            firs=_firs_to_json(firs),
        )
    )
    await session.flush()

    return RoutePlan(
        dep_icao=dep_icao,
        arr_icao=arr_icao,
        distance_nm=distance_nm,
        sample_point_count=len(points),
        states=states,
        firs=firs,
        from_cache=False,
    )


def resolve_eet_hours(distance_nm: float, cruise_tas_kts: float | None, settings_map: dict) -> float:
    block_speed = cruise_tas_kts if cruise_tas_kts else settings_map["default_block_speed_kts"]
    return compute_eet_hours(distance_nm, block_speed, settings_map["taxi_allowance_hours"])


@dataclass(frozen=True)
class RerouteResult:
    found: bool
    extra_distance_nm: float | None
    extra_time_hours: float | None
    extra_fuel_kg: float | None


async def find_alternate_route(
    session: AsyncSession,
    dep_icao: str,
    arr_icao: str,
    direct_distance_nm: float,
    avoid_states: set[str],
    *,
    avoid_firs: set[str] | None = None,
    block_speed_kts: float,
    fuel_burn_kg_per_hr: float | None,
) -> RerouteResult:
    """Builds a synthetic lateral-offset corridor grid around the direct
    track and runs A* over it, excluding any node that falls inside an
    avoided state's polygon. There is no real airway/waypoint dataset in
    this system, so this corridor grid is a deliberate, documented
    simplification — it produces a genuine extra-distance/time/fuel number
    without needing one.
    """
    dep = await _get_airport(session, dep_icao)
    arr = await _get_airport(session, arr_icao)
    settings_map = await settings_service.get_typed_settings_map(session)

    interval_nm = settings_map["route_sample_interval_nm"] * 3  # coarser grid than the display track
    half_width = settings_map["reroute_corridor_half_width_nm"]
    lane_count = settings_map["reroute_lane_count"]
    lane_offsets = [
        half_width * (2 * i / (lane_count - 1) - 1) if lane_count > 1 else 0.0 for i in range(lane_count)
    ]

    columns = sample_great_circle_track(dep.lat, dep.lon, arr.lat, arr.lon, interval_nm=interval_nm, min_points=8)

    # Build every corridor node's coordinates first, batch-resolve all of
    # them against avoided-state polygons in one query, then build the graph.
    node_coords: dict[tuple[int, int], tuple[float, float]] = {}
    for col_idx, point in enumerate(columns):
        bearing = initial_bearing_deg(point.lat, point.lon, arr.lat, arr.lon) if col_idx < len(columns) - 1 else 0.0
        for lane_idx, offset in enumerate(lane_offsets):
            lat, lon = offset_point_lateral(point.lat, point.lon, bearing, offset)
            node_coords[(col_idx, lane_idx)] = (lat, lon)

    node_order = list(node_coords.keys())
    lats = [node_coords[n][0] for n in node_order]
    lons = [node_coords[n][1] for n in node_order]
    country_hits = await geo_repository.resolve_country_hits(session, lats, lons)
    blocked_point_indices = {h.point_index for h in country_hits if h.code in avoid_states}
    if avoid_firs:
        fir_hits = await geo_repository.resolve_fir_hits(session, lats, lons)
        blocked_point_indices |= {h.point_index for h in fir_hits if h.code in avoid_firs}
    blocked_nodes = {node_order[i] for i in blocked_point_indices}

    center_lane = lane_count // 2
    start_node = (0, center_lane)
    goal_node = (len(columns) - 1, center_lane)

    graph: dict[tuple[int, int], list[tuple[tuple[int, int], float]]] = {n: [] for n in node_coords if n not in blocked_nodes}
    for (col_idx, lane_idx), (lat, lon) in node_coords.items():
        if (col_idx, lane_idx) in blocked_nodes or col_idx + 1 >= len(columns):
            continue
        for next_lane in range(lane_count):
            neighbor = (col_idx + 1, next_lane)
            if neighbor in blocked_nodes:
                continue
            n_lat, n_lon = node_coords[neighbor]
            cost = great_circle_distance_nm(lat, lon, n_lat, n_lon)
            graph[(col_idx, lane_idx)].append((neighbor, cost))

    def heuristic(node: tuple[int, int], goal: tuple[int, int]) -> float:
        lat, lon = node_coords[node]
        g_lat, g_lon = node_coords[goal]
        return great_circle_distance_nm(lat, lon, g_lat, g_lon)

    if start_node in blocked_nodes or goal_node in blocked_nodes:
        return RerouteResult(found=False, extra_distance_nm=None, extra_time_hours=None, extra_fuel_kg=None)

    result = a_star_search(graph, start_node, goal_node, heuristic)
    if not result.found:
        return RerouteResult(found=False, extra_distance_nm=None, extra_time_hours=None, extra_fuel_kg=None)

    extra_distance = max(result.total_cost - direct_distance_nm, 0.0)
    extra_time = extra_distance / block_speed_kts
    extra_fuel = extra_time * fuel_burn_kg_per_hr if fuel_burn_kg_per_hr else None
    return RerouteResult(
        found=True, extra_distance_nm=extra_distance, extra_time_hours=extra_time, extra_fuel_kg=extra_fuel
    )
