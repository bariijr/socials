"""Engine 1 integration coverage — needs real PostGIS ST_Contains
resolution against seeded polygons, so this can't be a domain unit test.
See tests/integration/conftest.py for how to point this at a real DB.
"""

import uuid

import pytest
import pytest_asyncio
from geoalchemy2.shape import from_shape
from shapely.geometry import MultiPolygon, Polygon
from sqlalchemy import select

from app.core.rule_engine import RULE_ENGINE_VERSION
from app.models.airport import Airport
from app.models.country import Country
from app.models.geometry import CountryGeometry, FirBoundary
from app.models.route_cache import RouteCache
from app.services import routing_engine_service


def _square(min_lon: float, min_lat: float, max_lon: float, max_lat: float) -> MultiPolygon:
    # country_geometry/fir_boundaries columns are typed MULTIPOLYGON — a
    # bare Polygon insert fails the PostGIS type check, same as the real
    # importer (app/importer/geo_loader.py) has to account for.
    return MultiPolygon(
        [Polygon([(min_lon, min_lat), (max_lon, min_lat), (max_lon, max_lat), (min_lon, max_lat), (min_lon, min_lat)])]
    )


@pytest_asyncio.fixture
async def two_country_route(session, draw_unique_iso3):
    """Two adjacent square 'countries' along the equator, a FIR spanning
    both, and one airport in each — a direct equatorial leg crosses A then
    B in that order.
    """
    iso_a, iso_b = draw_unique_iso3(2)

    session.add_all(
        [
            Country(iso3=iso_a, name=f"Country {iso_a}"),
            Country(iso3=iso_b, name=f"Country {iso_b}"),
        ]
    )
    await session.flush()

    session.add_all(
        [
            CountryGeometry(iso3=iso_a, geom=from_shape(_square(-5, -5, 5, 5), srid=4326)),
            CountryGeometry(iso3=iso_b, geom=from_shape(_square(5, -5, 15, 5), srid=4326)),
            FirBoundary(
                icao_fir_code="TEST", name="Test FIR", geom=from_shape(_square(-5, -5, 15, 5), srid=4326), source="test"
            ),
        ]
    )

    dep_icao = f"D{iso_a}"[:4].upper()
    arr_icao = f"A{iso_b}"[:4].upper()
    session.add_all(
        [
            Airport(icao=dep_icao, name="Dep Test", lat=0.0, lon=-3.0, country_iso3=iso_a),
            Airport(icao=arr_icao, name="Arr Test", lat=0.0, lon=12.0, country_iso3=iso_b),
        ]
    )
    await session.flush()

    return {"iso_a": iso_a, "iso_b": iso_b, "dep_icao": dep_icao, "arr_icao": arr_icao}


class TestResolveLegRoute:
    @pytest.mark.asyncio
    async def test_resolves_states_and_firs_in_crossing_order(self, session, two_country_route):
        g = two_country_route
        route = await routing_engine_service.resolve_leg_route(session, g["dep_icao"], g["arr_icao"])

        assert route.from_cache is False
        assert [s.iso3 for s in route.states] == [g["iso_a"], g["iso_b"]]
        assert [f.icao_fir_code for f in route.firs] == ["TEST"]
        assert route.distance_nm > 0
        assert route.sample_point_count >= 50

    @pytest.mark.asyncio
    async def test_writes_cache_keyed_on_dep_arr_and_rule_engine_version(self, session, two_country_route):
        g = two_country_route
        route = await routing_engine_service.resolve_leg_route(session, g["dep_icao"], g["arr_icao"])

        cached = (
            await session.execute(
                select(RouteCache).where(
                    RouteCache.dep_icao == g["dep_icao"],
                    RouteCache.arr_icao == g["arr_icao"],
                    RouteCache.rule_engine_version == RULE_ENGINE_VERSION,
                )
            )
        ).scalar_one()
        assert cached.distance_nm == pytest.approx(route.distance_nm)
        assert [s["iso3"] for s in cached.states] == [g["iso_a"], g["iso_b"]]

    @pytest.mark.asyncio
    async def test_second_call_is_served_from_cache(self, session, two_country_route):
        g = two_country_route
        first = await routing_engine_service.resolve_leg_route(session, g["dep_icao"], g["arr_icao"])
        second = await routing_engine_service.resolve_leg_route(session, g["dep_icao"], g["arr_icao"])

        assert first.from_cache is False
        assert second.from_cache is True
        assert second.distance_nm == pytest.approx(first.distance_nm)
        assert [s.iso3 for s in second.states] == [s.iso3 for s in first.states]


@pytest_asyncio.fixture
async def corridor_with_middle_obstacle(session, draw_unique_iso3):
    """dep in A (west), arr in B (east), with a narrow avoided state C
    straddling the equator directly between them — a direct track runs
    through C, so a genuine detour (not just a blocked endpoint) is
    required to avoid it.
    """
    iso_a, iso_b, iso_c = draw_unique_iso3(3)

    session.add_all(
        [
            Country(iso3=iso_a, name=f"Country {iso_a}"),
            Country(iso3=iso_b, name=f"Country {iso_b}"),
            Country(iso3=iso_c, name=f"Country {iso_c}"),
        ]
    )
    await session.flush()

    session.add_all(
        [
            CountryGeometry(iso3=iso_a, geom=from_shape(_square(-15, -5, -5, 5), srid=4326)),
            CountryGeometry(iso3=iso_b, geom=from_shape(_square(5, -5, 15, 5), srid=4326)),
            CountryGeometry(iso3=iso_c, geom=from_shape(_square(-2, -1, 2, 1), srid=4326)),
        ]
    )

    dep_icao = f"D{iso_a}"[:4].upper()
    arr_icao = f"A{iso_b}"[:4].upper()
    session.add_all(
        [
            Airport(icao=dep_icao, name="Dep Test", lat=0.0, lon=-10.0, country_iso3=iso_a),
            Airport(icao=arr_icao, name="Arr Test", lat=0.0, lon=10.0, country_iso3=iso_b),
        ]
    )
    await session.flush()

    return {"iso_a": iso_a, "iso_b": iso_b, "iso_c": iso_c, "dep_icao": dep_icao, "arr_icao": arr_icao}


@pytest_asyncio.fixture
async def corridor_with_fir_obstacle(session, geo_region_base_lon, draw_unique_iso3):
    """Same shape as corridor_with_middle_obstacle, but the obstacle is a
    FIR rather than a country — avoid_firs must block the corridor grid
    exactly like avoid_states does.
    """
    lon = geo_region_base_lon
    fir_suffix, dep_suffix, arr_suffix = draw_unique_iso3(3)
    fir_code = f"F{fir_suffix}"

    dep_icao = f"D{dep_suffix}"
    arr_icao = f"A{arr_suffix}"

    session.add_all(
        [
            FirBoundary(
                icao_fir_code=fir_code,
                name=f"FIR {fir_code}",
                geom=from_shape(_square(lon - 2, -1, lon + 2, 1), srid=4326),
                source="test",
            ),
            Airport(icao=dep_icao, name="Dep Test", lat=0.0, lon=lon - 10.0),
            Airport(icao=arr_icao, name="Arr Test", lat=0.0, lon=lon + 10.0),
        ]
    )
    await session.flush()

    return {"fir_code": fir_code, "dep_icao": dep_icao, "arr_icao": arr_icao}


class TestFindAlternateRoute:
    @pytest.mark.asyncio
    async def test_avoided_state_forces_a_lateral_detour(self, session, corridor_with_middle_obstacle):
        g = corridor_with_middle_obstacle
        route = await routing_engine_service.resolve_leg_route(session, g["dep_icao"], g["arr_icao"])

        # Confirm the premise: the direct track really does cross C.
        assert g["iso_c"] in [s.iso3 for s in route.states]

        result = await routing_engine_service.find_alternate_route(
            session,
            g["dep_icao"],
            g["arr_icao"],
            route.distance_nm,
            avoid_states={g["iso_c"]},
            block_speed_kts=470,
            fuel_burn_kg_per_hr=250.0,
        )

        assert result.found is True
        assert result.extra_distance_nm is not None and result.extra_distance_nm > 0
        assert result.extra_time_hours == pytest.approx(result.extra_distance_nm / 470, rel=1e-6)
        assert result.extra_fuel_kg == pytest.approx(result.extra_time_hours * 250.0, rel=1e-6)
        # The alternate track's own geometry — not just the extra-distance
        # number — is what the map actually draws.
        assert result.track_points is not None and len(result.track_points) >= 2
        assert result.states is not None and g["iso_c"] not in result.states

    @pytest.mark.asyncio
    async def test_destination_inside_avoided_state_is_unreachable(self, session, two_country_route):
        g = two_country_route
        route = await routing_engine_service.resolve_leg_route(session, g["dep_icao"], g["arr_icao"])

        result = await routing_engine_service.find_alternate_route(
            session,
            g["dep_icao"],
            g["arr_icao"],
            route.distance_nm,
            avoid_states={g["iso_b"]},
            block_speed_kts=470,
            fuel_burn_kg_per_hr=None,
        )

        # The destination itself sits inside the avoided state — no
        # corridor detour can fix that, so this must fail honestly.
        assert result.found is False
        assert result.track_points is None

    @pytest.mark.asyncio
    async def test_avoided_fir_forces_a_lateral_detour(self, session, corridor_with_fir_obstacle):
        g = corridor_with_fir_obstacle
        direct_distance_nm = 20 * 60.04  # dep/arr are 20 degrees apart on the equator

        result = await routing_engine_service.find_alternate_route(
            session,
            g["dep_icao"],
            g["arr_icao"],
            direct_distance_nm,
            avoid_states=set(),
            avoid_firs={g["fir_code"]},
            block_speed_kts=470,
            fuel_burn_kg_per_hr=None,
        )

        assert result.found is True
        assert result.extra_distance_nm is not None and result.extra_distance_nm > 0
