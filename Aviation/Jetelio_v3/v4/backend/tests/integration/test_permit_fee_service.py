"""permit_fee_service integration coverage — needs a real route resolution
(PostGIS state crossing, for the overflight distance segmentation) and
a hand-built PermitPlan (going through the full permit engine isn't needed
to exercise this service's own lookup/pricing-completeness logic). Formula
math itself is covered by tests/unit/domain/test_nav_fees.py, reused here
verbatim. A permit line item with no configured CAA_FEE/NAFISAT provider
must never produce a guessed dollar figure — see
app.services.permit_fee_service's module docstring for why.
"""

import uuid
from datetime import date, datetime, timezone

import pytest
import pytest_asyncio
from geoalchemy2.shape import from_shape
from shapely.geometry import MultiPolygon, Polygon

from app.domain.permits import AvoidIncludeViolation
from app.domain.reference_status import NavFeeProviderStatus
from app.models.airport import Airport
from app.models.country import Country
from app.models.geometry import CountryGeometry
from app.models.permit_fee_provider import PermitFeeCategory, PermitFeeProvider, PermitFeeType
from app.services import permit_fee_service, routing_engine_service
from app.services.permit_engine_service import GroundHandlingOrderResult, LandingPermit, OverflightPermit, PermitDeadline, PermitPlan

JTL_FEE = 25.0


def _square(min_lon: float, min_lat: float, max_lon: float, max_lat: float) -> MultiPolygon:
    return MultiPolygon(
        [Polygon([(min_lon, min_lat), (max_lon, min_lat), (max_lon, max_lat), (min_lon, max_lat), (min_lon, min_lat)])]
    )


def _deadline() -> PermitDeadline:
    return PermitDeadline(
        file_by=datetime(2026, 9, 1, tzinfo=timezone.utc), deadline_status="PENDING", lead_time_hours=72.0, lead_time_is_fallback=False
    )


@pytest_asyncio.fixture
async def two_country_route(session, draw_unique_iso3):
    iso_a, iso_b = draw_unique_iso3(2)
    session.add_all([Country(iso3=iso_a, name=f"Country {iso_a}"), Country(iso3=iso_b, name=f"Country {iso_b}")])
    await session.flush()

    session.add_all(
        [
            CountryGeometry(iso3=iso_a, geom=from_shape(_square(-5, -5, 5, 5), srid=4326)),
            CountryGeometry(iso3=iso_b, geom=from_shape(_square(5, -5, 15, 5), srid=4326)),
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

    permits = PermitPlan(
        overflight_permits=[],
        landing_permits=[
            LandingPermit(
                country_iso3=iso_b, country_name=f"Country {iso_b}", entry_datetime=datetime.now(timezone.utc),
                exit_datetime=datetime.now(timezone.utc), deadline=_deadline(),
            )
        ],
        ground_handling_orders=[
            GroundHandlingOrderResult(
                country_iso3=iso_a, country_name=f"Country {iso_a}", earliest_icao=dep_icao,
                earliest_event_at=datetime.now(timezone.utc), deadline=_deadline(),
            )
        ],
        service_requirements=[],
        state_avoid_include=AvoidIncludeViolation(violated=False),
        fir_avoid_include=AvoidIncludeViolation(violated=False),
    )
    return {"iso_a": iso_a, "iso_b": iso_b, "route": route, "permits": permits}


class TestComputeLegPermitFees:
    @pytest.mark.asyncio
    async def test_mtow_unknown_returns_empty_uncomputed_result(self, session, two_country_route):
        g = two_country_route
        result = await permit_fee_service.compute_leg_permit_fees(
            session, route=g["route"], permits=g["permits"], aircraft_mtow_kg=None, jtl_service_fee_usd=JTL_FEE
        )
        assert result.mtow_known is False
        assert result.fully_priced is False
        assert result.items == []
        assert result.total_usd is None

    @pytest.mark.asyncio
    async def test_unconfigured_permit_fee_has_no_amount_and_is_not_fully_priced(self, session, two_country_route):
        g = two_country_route
        result = await permit_fee_service.compute_leg_permit_fees(
            session, route=g["route"], permits=g["permits"], aircraft_mtow_kg=5000.0, jtl_service_fee_usd=JTL_FEE
        )

        assert result.mtow_known is True
        assert result.fully_priced is False
        assert len(result.items) == 2
        for item in result.items:
            assert item.caa_status == NavFeeProviderStatus.NO_PROVIDER_CONFIGURED
            assert item.caa_fee_usd is None
            assert item.nafisat_status == NavFeeProviderStatus.NO_PROVIDER_CONFIGURED
            assert item.nafisat_fee_usd is None
            # JTL is a flat named setting, always known regardless of provider config.
            assert item.jtl_fee_usd == pytest.approx(JTL_FEE)
            assert item.line_total_usd is None
        assert result.caa_subtotal_usd is None
        assert result.nafisat_subtotal_usd is None
        assert result.total_usd is None

    @pytest.mark.asyncio
    async def test_configured_caa_and_nafisat_providers_are_used_and_fully_priced(self, session, two_country_route):
        g = two_country_route
        session.add_all(
            [
                PermitFeeProvider(
                    country_iso3=g["iso_b"], permit_type=PermitFeeType.LANDING.value, fee_category=PermitFeeCategory.CAA_FEE.value,
                    provider_name="Test CAA", formula="FLAT_RATE", base_rate=100.0, minimum_fee=0.0, vat_rate=0.0,
                    currency="USD", source="Test AIP", verified_by="Test Engineer", verified_on=date.today(),
                ),
                PermitFeeProvider(
                    country_iso3=g["iso_b"], permit_type=PermitFeeType.LANDING.value, fee_category=PermitFeeCategory.NAFISAT.value,
                    provider_name="Test nafisat", formula="FLAT_RATE", base_rate=50.0, minimum_fee=0.0, vat_rate=0.0,
                    currency="USD",
                ),
            ]
        )
        await session.flush()

        result = await permit_fee_service.compute_leg_permit_fees(
            session, route=g["route"], permits=g["permits"], aircraft_mtow_kg=5000.0, jtl_service_fee_usd=JTL_FEE
        )

        landing_item = next(i for i in result.items if i.permit_type == PermitFeeType.LANDING.value)
        assert landing_item.caa_fee_usd == pytest.approx(100.0)
        assert landing_item.caa_status == NavFeeProviderStatus.VERIFIED
        assert landing_item.nafisat_fee_usd == pytest.approx(50.0)
        assert landing_item.nafisat_status == NavFeeProviderStatus.UNVERIFIED_NO_SOURCE
        assert landing_item.line_total_usd == pytest.approx(100.0 + 50.0 + JTL_FEE)

        # The ground-handling item for the other country still has no
        # provider configured, so the leg overall is NOT fully priced yet.
        assert result.fully_priced is False
        assert result.total_usd is None
