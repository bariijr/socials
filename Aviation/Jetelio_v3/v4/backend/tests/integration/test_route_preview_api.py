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


class TestRoutePreview:
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
