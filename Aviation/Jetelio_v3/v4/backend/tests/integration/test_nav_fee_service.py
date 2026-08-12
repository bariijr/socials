"""nav_fee_service integration coverage — needs a real route resolution
(PostGIS FIR crossing) and settings, so this can't be a domain unit test.
The formula math itself is covered in tests/unit/domain/test_nav_fees.py;
this checks the FIR-lookup/pricing-completeness assembly. A FIR with no
configured provider must never produce a guessed dollar figure — see
app.services.nav_fee_service's module docstring for why.
"""

import uuid
from datetime import date

import pytest
import pytest_asyncio
from geoalchemy2.shape import from_shape
from shapely.geometry import MultiPolygon, Polygon

from app.domain.reference_status import NavFeeProviderStatus
from app.models.airport import Airport
from app.models.country import Country
from app.models.geometry import CountryGeometry, FirBoundary
from app.models.nav_fee_provider import NavFeeProvider
from app.services import nav_fee_service, routing_engine_service

MARGIN_PERCENT = 15.0


def _square(min_lon: float, min_lat: float, max_lon: float, max_lat: float) -> MultiPolygon:
    return MultiPolygon(
        [Polygon([(min_lon, min_lat), (max_lon, min_lat), (max_lon, max_lat), (min_lon, max_lat), (min_lon, min_lat)])]
    )


@pytest_asyncio.fixture
async def single_fir_route(session, draw_unique_iso3):
    iso_a, iso_b = draw_unique_iso3(2)
    fir_code = f"F{uuid.uuid4().hex[:3]}".upper()

    session.add_all([Country(iso3=iso_a, name=f"Country {iso_a}"), Country(iso3=iso_b, name=f"Country {iso_b}")])
    await session.flush()

    session.add_all(
        [
            CountryGeometry(iso3=iso_a, geom=from_shape(_square(-5, -5, 5, 5), srid=4326)),
            CountryGeometry(iso3=iso_b, geom=from_shape(_square(5, -5, 15, 5), srid=4326)),
            FirBoundary(icao_fir_code=fir_code, name="Test FIR", geom=from_shape(_square(-5, -5, 15, 5), srid=4326), source="test"),
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

    route = await routing_engine_service.resolve_leg_route(session, dep_icao, arr_icao)
    return {"fir_code": fir_code, "route": route}


class TestComputeLegNavFees:
    @pytest.mark.asyncio
    async def test_mtow_unknown_returns_empty_uncomputed_result(self, session, single_fir_route):
        g = single_fir_route
        result = await nav_fee_service.compute_leg_nav_fees(
            session, route=g["route"], aircraft_mtow_kg=None, margin_percent=MARGIN_PERCENT
        )
        assert result.mtow_known is False
        assert result.fully_priced is False
        assert result.items == []
        assert result.total_usd is None

    @pytest.mark.asyncio
    async def test_unconfigured_fir_has_no_fee_and_is_not_fully_priced(self, session, single_fir_route):
        g = single_fir_route
        result = await nav_fee_service.compute_leg_nav_fees(
            session, route=g["route"], aircraft_mtow_kg=5000.0, margin_percent=MARGIN_PERCENT
        )

        assert result.mtow_known is True
        assert result.fully_priced is False
        assert len(result.items) == 1
        item = result.items[0]
        assert item.fir_code == g["fir_code"]
        assert item.status == NavFeeProviderStatus.NO_PROVIDER_CONFIGURED
        assert item.fee_usd is None
        assert item.provider_name is None
        # No dollar figure is ever synthesized when nothing is configured.
        assert result.subtotal_usd is None
        assert result.margin_usd is None
        assert result.total_usd is None

    @pytest.mark.asyncio
    async def test_configured_provider_is_used_verified_when_sourced_and_fully_priced(self, session, single_fir_route):
        g = single_fir_route
        mtow_kg = 5000.0
        session.add(
            NavFeeProvider(
                fir_code=g["fir_code"],
                provider_name="Test ANSP",
                country="Testland",
                formula="FLAT_RATE",
                base_rate=42.0,
                minimum_fee=0.0,
                vat_rate=0.0,
                applies_50km_deduction=False,
                currency="USD",
                source="Test AIP",
                verified_by="Test Engineer",
                verified_on=date.today(),
            )
        )
        await session.flush()

        result = await nav_fee_service.compute_leg_nav_fees(
            session, route=g["route"], aircraft_mtow_kg=mtow_kg, margin_percent=MARGIN_PERCENT
        )

        assert result.fully_priced is True
        assert len(result.items) == 1
        item = result.items[0]
        assert item.provider_name == "Test ANSP"
        assert item.status == NavFeeProviderStatus.VERIFIED
        assert item.fee_usd == pytest.approx(42.0)
        assert result.subtotal_usd == pytest.approx(42.0)
        assert result.margin_usd == pytest.approx(round(42.0 * 0.15, 2))
        assert result.total_usd == pytest.approx(result.subtotal_usd + result.margin_usd)

    @pytest.mark.asyncio
    async def test_configured_provider_without_source_is_unverified_no_source(self, session, single_fir_route):
        g = single_fir_route
        session.add(
            NavFeeProvider(
                fir_code=g["fir_code"],
                provider_name="Unsourced ANSP",
                formula="FLAT_RATE",
                base_rate=10.0,
                minimum_fee=0.0,
                vat_rate=0.0,
                applies_50km_deduction=False,
                currency="USD",
            )
        )
        await session.flush()

        result = await nav_fee_service.compute_leg_nav_fees(
            session, route=g["route"], aircraft_mtow_kg=5000.0, margin_percent=MARGIN_PERCENT
        )
        # Still fully_priced — a real rate exists, it's just not verified yet.
        assert result.fully_priced is True
        assert result.items[0].status == NavFeeProviderStatus.UNVERIFIED_NO_SOURCE
