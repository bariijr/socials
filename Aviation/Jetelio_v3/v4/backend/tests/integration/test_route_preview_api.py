"""Public route-preview endpoint — real distance/EET/states/FIRs plus
simplified real polygon geometry, no captcha (cheap, read-only, no cost or
vendor data). Needs real Postgres+PostGIS.
"""

import uuid

import pytest
import pytest_asyncio
from geoalchemy2.shape import from_shape
from shapely.geometry import MultiPolygon, Polygon

from app.models.airport import Airport
from app.models.country import Country
from app.models.geometry import CountryGeometry


def _square(min_lon: float, min_lat: float, max_lon: float, max_lat: float) -> MultiPolygon:
    return MultiPolygon(
        [Polygon([(min_lon, min_lat), (max_lon, min_lat), (max_lon, max_lat), (min_lon, max_lat), (min_lon, min_lat)])]
    )


@pytest_asyncio.fixture
async def preview_leg_fixture(session, geo_region_base_lon, draw_unique_iso3):
    iso_a, iso_b = draw_unique_iso3(2)
    lon = geo_region_base_lon

    session.add_all([Country(iso3=iso_a, name=f"Country {iso_a}"), Country(iso3=iso_b, name=f"Country {iso_b}")])
    await session.flush()
    session.add_all(
        [
            CountryGeometry(iso3=iso_a, geom=from_shape(_square(lon, -1, lon + 2, 1), srid=4326)),
            CountryGeometry(iso3=iso_b, geom=from_shape(_square(lon + 2, -1, lon + 4, 1), srid=4326)),
        ]
    )
    dep_icao = f"D{iso_a}"[:4].upper()
    arr_icao = f"A{iso_b}"[:4].upper()
    session.add_all(
        [
            Airport(icao=dep_icao, name="Dep Test", lat=0.0, lon=lon + 0.5, country_iso3=iso_a),
            Airport(icao=arr_icao, name="Arr Test", lat=0.0, lon=lon + 3.5, country_iso3=iso_b),
        ]
    )
    await session.commit()
    return {"iso_a": iso_a, "iso_b": iso_b, "dep_icao": dep_icao, "arr_icao": arr_icao}


@pytest_asyncio.fixture
async def preview_corridor_with_middle_obstacle(session, geo_region_base_lon, draw_unique_iso3):
    """dep in A (west), arr in B (east), with a narrow state C straddling
    the midpoint between them — a direct track runs through C, so a
    genuine detour is required to avoid it. Committed (not just flushed)
    since this fixture is consumed over a real HTTP client, not the same
    session/connection the test body would otherwise share — so, unlike
    test_routing_engine_service.py's non-committing corridor_with_middle_obstacle
    fixture (which can safely hardcode -15..15 since it's rolled back),
    this one is scaled to fit inside geo_region_base_lon's 8-degree-wide
    non-overlapping slot instead of permanently polluting a fixed range
    every later test's route resolution would also cross. Kept entirely
    within [lon, lon+8) — like preview_leg_fixture above, never lon minus
    anything — since the counter only guarantees non-overlap going forward
    from lon, not centered on it; extending below lon collides with
    whichever test claimed the previous slot.
    """
    iso_a, iso_b, iso_c = draw_unique_iso3(3)
    lon = geo_region_base_lon

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
            CountryGeometry(iso3=iso_a, geom=from_shape(_square(lon, -3, lon + 2, 3), srid=4326)),
            CountryGeometry(iso3=iso_b, geom=from_shape(_square(lon + 5, -3, lon + 7, 3), srid=4326)),
            # 2 degrees wide (not the 1-degree sliver an earlier version used) —
            # narrow enough to fit the 8-degree slot, wide enough that the
            # direct route's sample points reliably land inside it regardless
            # of exactly where in that slot this particular test run's
            # geo_region_base_lon counter happens to land.
            CountryGeometry(iso3=iso_c, geom=from_shape(_square(lon + 2.5, -1, lon + 4.5, 1), srid=4326)),
        ]
    )
    dep_icao = f"D{iso_a}"[:4].upper()
    arr_icao = f"A{iso_b}"[:4].upper()
    session.add_all(
        [
            Airport(icao=dep_icao, name="Dep Test", lat=0.0, lon=lon + 1.0, country_iso3=iso_a),
            Airport(icao=arr_icao, name="Arr Test", lat=0.0, lon=lon + 6.0, country_iso3=iso_b),
        ]
    )
    await session.commit()
    return {"iso_a": iso_a, "iso_b": iso_b, "iso_c": iso_c, "dep_icao": dep_icao, "arr_icao": arr_icao}


class TestRoutePreview:
    @pytest.mark.asyncio
    async def test_avoided_state_returns_a_real_alternate_track(self, client, preview_corridor_with_middle_obstacle):
        g = preview_corridor_with_middle_obstacle
        # Confirm the premise first: with no constraint, the direct route
        # really does cross C.
        direct = await client.get(
            "/feasibility/route-preview", params={"dep_icao": g["dep_icao"], "arr_icao": g["arr_icao"]}
        )
        assert g["iso_c"] in [s["iso3"] for s in direct.json()["states"]]
        assert direct.json()["avoid_include_violated"] is False
        assert direct.json()["reroute"] is None

        resp = await client.get(
            "/feasibility/route-preview",
            params={"dep_icao": g["dep_icao"], "arr_icao": g["arr_icao"], "avoid_states": [g["iso_c"]]},
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()

        assert body["avoid_include_violated"] is True
        # The direct route/track above is untouched (still the raw great
        # circle) — the alternate lives entirely under "reroute".
        assert g["iso_c"] in [s["iso3"] for s in body["states"]]
        assert body["reroute"]["found"] is True
        assert body["reroute"]["extra_distance_nm"] > 0
        assert len(body["reroute"]["track_points"]) >= 2
        assert g["iso_c"] not in [s["iso3"] for s in body["reroute"]["states"]]

    @pytest.mark.asyncio
    async def test_returns_real_distance_states_and_geometry(self, client, preview_leg_fixture):
        g = preview_leg_fixture
        resp = await client.get("/feasibility/route-preview", params={"dep_icao": g["dep_icao"], "arr_icao": g["arr_icao"]})
        assert resp.status_code == 200, resp.text
        body = resp.json()

        assert body["distance_nm"] > 0
        assert body["eet_hours"] > 0
        assert [s["iso3"] for s in body["states"]] == [g["iso_a"], g["iso_b"]]
        assert len(body["track_points"]) >= 2
        assert g["iso_a"] in body["state_geometry"]
        assert body["state_geometry"][g["iso_a"]]["type"] in ("Polygon", "MultiPolygon")

    @pytest.mark.asyncio
    async def test_unknown_airport_is_rejected(self, client):
        # resolve_leg_route looks up the airports first and raises
        # NotFoundError (-> 404) before route_preview_service's own lookup
        # is ever reached.
        resp = await client.get("/feasibility/route-preview", params={"dep_icao": "ZZZZ", "arr_icao": "YYYY"})
        assert resp.status_code == 404


class TestWorldOutline:
    @pytest.mark.asyncio
    async def test_returns_real_country_geometry_and_is_cacheable(self, client, preview_leg_fixture):
        g = preview_leg_fixture
        resp = await client.get("/feasibility/world-outline")
        assert resp.status_code == 200, resp.text
        body = resp.json()

        # The fixture's own two committed countries must be in the world
        # outline too — it's every country in country_geometry, not a
        # curated subset.
        assert g["iso_a"] in body["countries"]
        assert body["countries"][g["iso_a"]]["type"] in ("Polygon", "MultiPolygon")
        assert resp.headers["cache-control"] == "public, max-age=86400"
