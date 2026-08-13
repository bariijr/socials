"""End-to-end orchestrator coverage — confirms the four engines wire
together correctly. Each engine's own internal logic already has
dedicated unit (domain) and, for routing, integration coverage; this file
checks the composition, not each rule again.
"""

import uuid
from datetime import date, datetime, timedelta, timezone

import pytest
import pytest_asyncio
from geoalchemy2.shape import from_shape
from shapely.geometry import MultiPolygon, Polygon

from app.domain.permits import FeasibilityVerdict
from app.models.aircraft import AircraftPerformance
from app.models.airport import Airport
from app.models.country import Country
from app.models.country_requirements import CountryRequirement
from app.models.geometry import CountryGeometry
from app.models.visa import VisaMatrixCell, VisaRequirement
from app.services import leg_feasibility_service
from app.services.credentials_engine_service import PersonInput


def _square(min_lon: float, min_lat: float, max_lon: float, max_lat: float) -> MultiPolygon:
    return MultiPolygon(
        [Polygon([(min_lon, min_lat), (max_lon, min_lat), (max_lon, max_lat), (min_lon, max_lat), (min_lon, min_lat)])]
    )


@pytest_asyncio.fixture
async def two_country_leg(session, draw_unique_iso3):
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
            Airport(icao=dep_icao, name="Dep Test", lat=0.0, lon=-3.0, country_iso3=iso_a, is_airport_of_entry=True),
            Airport(icao=arr_icao, name="Arr Test", lat=0.0, lon=12.0, country_iso3=iso_b, is_airport_of_entry=True),
        ]
    )

    session.add(
        VisaMatrixCell(
            country_iso3=iso_b, nationality_iso3=iso_b, requirement=VisaRequirement.NOT_REQUIRED, source="test"
        )
    )
    await session.flush()

    return {"iso_a": iso_a, "iso_b": iso_b, "dep_icao": dep_icao, "arr_icao": arr_icao}


async def _seed_aircraft(session, *, max_range_nm: float) -> str:
    icao_type = f"T{uuid.uuid4().hex[:6]}".upper()
    session.add(
        AircraftPerformance(
            icao_type=icao_type,
            max_range_nm=max_range_nm,
            cruise_tas_kts=470,
            fuel_burn_kg_per_hr=1200,
            max_pax=10,
            verified=True,
            verified_by="Test Engineer",
            verified_on=date.today(),
        )
    )
    await session.flush()
    return icao_type


class TestComputeLegFeasibility:
    @pytest.mark.asyncio
    async def test_within_range_no_violations_is_feasible(self, session, two_country_leg):
        g = two_country_leg
        aircraft_icao_type = await _seed_aircraft(session, max_range_nm=3000)

        result = await leg_feasibility_service.compute_leg_feasibility(
            session,
            dep_icao=g["dep_icao"],
            arr_icao=g["arr_icao"],
            aircraft_icao_type=aircraft_icao_type,
            persons=[PersonInput(person_id="p1", role="CREW", nationality_iso3=g["iso_b"], passport_expiry=date(2030, 1, 1))],
            reference_datetime=datetime.now(timezone.utc) + timedelta(hours=200),
        )

        assert result.verdict == FeasibilityVerdict.FEASIBLE
        assert result.capability.capability.exceeds is False
        assert result.permits.avoid_include_violated is False
        assert result.route.distance_nm > 0
        assert result.credentials.persons[0].rollup_status == "OK"

    @pytest.mark.asyncio
    async def test_exceeding_range_with_no_tech_stop_is_not_feasible(self, session, two_country_leg):
        g = two_country_leg
        aircraft_icao_type = await _seed_aircraft(session, max_range_nm=100)  # far too short for this leg

        result = await leg_feasibility_service.compute_leg_feasibility(
            session,
            dep_icao=g["dep_icao"],
            arr_icao=g["arr_icao"],
            aircraft_icao_type=aircraft_icao_type,
            persons=[PersonInput(person_id="p1", role="CREW", nationality_iso3=g["iso_b"], passport_expiry=date(2030, 1, 1))],
            reference_datetime=datetime.now(timezone.utc) + timedelta(hours=200),
        )

        assert result.capability.capability.exceeds is True
        assert result.capability.tech_stop_suggestions == []
        assert result.verdict == FeasibilityVerdict.NOT_FEASIBLE

    @pytest.mark.asyncio
    async def test_required_arrival_datetime_back_calculates_departure(self, session, two_country_leg):
        g = two_country_leg
        aircraft_icao_type = await _seed_aircraft(session, max_range_nm=3000)
        required_arrival = datetime.now(timezone.utc) + timedelta(hours=200)

        result = await leg_feasibility_service.compute_leg_feasibility(
            session,
            dep_icao=g["dep_icao"],
            arr_icao=g["arr_icao"],
            aircraft_icao_type=aircraft_icao_type,
            persons=[],
            required_arrival_datetime=required_arrival,
        )

        assert result.reference_datetime == required_arrival - timedelta(hours=result.eet_hours)
        # Downstream computation (permits, entry/exit) keys off the
        # resolved reference_datetime exactly as a departure-driven leg —
        # landing permit deadline is still relative to the real departure.
        assert result.permits.landing_permits[0].deadline.file_by < required_arrival

    @pytest.mark.asyncio
    async def test_neither_time_driver_given_raises(self, session, two_country_leg):
        g = two_country_leg
        aircraft_icao_type = await _seed_aircraft(session, max_range_nm=3000)

        with pytest.raises(Exception):
            await leg_feasibility_service.compute_leg_feasibility(
                session,
                dep_icao=g["dep_icao"],
                arr_icao=g["arr_icao"],
                aircraft_icao_type=aircraft_icao_type,
                persons=[],
            )

    @pytest.mark.asyncio
    async def test_overflight_and_landing_permits_computed_for_both_states(self, session, two_country_leg):
        g = two_country_leg
        aircraft_icao_type = await _seed_aircraft(session, max_range_nm=3000)

        result = await leg_feasibility_service.compute_leg_feasibility(
            session,
            dep_icao=g["dep_icao"],
            arr_icao=g["arr_icao"],
            aircraft_icao_type=aircraft_icao_type,
            persons=[],
            reference_datetime=datetime.now(timezone.utc) + timedelta(hours=200),
        )

        # Direct A->B leg: A is the departure state (clearance held) and B
        # is the arrival state (covered by the landing permit), so neither
        # generates an overflight permit — only the landing permit on B.
        assert result.permits.overflight_permits == []
        assert [p.country_iso3 for p in result.permits.landing_permits] == [g["iso_b"]]
        assert len(result.permits.ground_handling_orders) == 2  # one per country, dep and arr

    @pytest.mark.asyncio
    async def test_ground_handling_lead_time_uses_country_requirement_override(self, session, two_country_leg):
        # Regression for task #108: CountryRequirement.request_type is free
        # text from the source workbook ("GROUND HANDLING", with a space) —
        # the lookup used to compare against a "GROUND_HANDLING" constant
        # with `==` and would silently never match, always falling back to
        # the global default. Confirms the normalized comparison actually
        # picks up a real per-country override end to end.
        g = two_country_leg
        aircraft_icao_type = await _seed_aircraft(session, max_range_nm=3000)
        session.add(
            CountryRequirement(
                source_ref=f"REG-{uuid.uuid4().hex[:8]}",
                country_iso3=g["iso_a"],
                request_type="GROUND HANDLING",
                lead_time_hours=11,
            )
        )
        await session.flush()

        result = await leg_feasibility_service.compute_leg_feasibility(
            session,
            dep_icao=g["dep_icao"],
            arr_icao=g["arr_icao"],
            aircraft_icao_type=aircraft_icao_type,
            persons=[],
            reference_datetime=datetime.now(timezone.utc) + timedelta(hours=200),
        )

        dep_order = next(o for o in result.permits.ground_handling_orders if o.country_iso3 == g["iso_a"])
        assert dep_order.deadline.lead_time_hours == 11

    @pytest.mark.asyncio
    async def test_landing_permit_entry_exit_equals_trip_end(self, session, two_country_leg):
        g = two_country_leg
        aircraft_icao_type = await _seed_aircraft(session, max_range_nm=3000)
        reference_datetime = datetime.now(timezone.utc) + timedelta(hours=200)

        result = await leg_feasibility_service.compute_leg_feasibility(
            session,
            dep_icao=g["dep_icao"],
            arr_icao=g["arr_icao"],
            aircraft_icao_type=aircraft_icao_type,
            persons=[],
            reference_datetime=reference_datetime,
        )

        landing = result.permits.landing_permits[0]
        trip_end = reference_datetime + timedelta(hours=result.eet_hours)
        assert landing.entry_datetime == trip_end
        assert landing.exit_datetime == trip_end
        # No overflight permits on this direct A->B leg, but nav fees and
        # filed_route (unset here) must still round-trip through the result.
        assert result.filed_route is None
        assert result.nav_fees is not None  # aircraft has no mtow_kg seeded -> not mtow_known
        assert result.nav_fees.mtow_known is False

    @pytest.mark.asyncio
    async def test_filed_route_passes_through_uninterpreted(self, session, two_country_leg):
        g = two_country_leg
        aircraft_icao_type = await _seed_aircraft(session, max_range_nm=3000)
        route_text = "FAKN PKV UT915 VHA UL432 TUPIR B527 BJA L432 GAVDA GAVDA1B HRYR"

        result = await leg_feasibility_service.compute_leg_feasibility(
            session,
            dep_icao=g["dep_icao"],
            arr_icao=g["arr_icao"],
            aircraft_icao_type=aircraft_icao_type,
            persons=[],
            reference_datetime=datetime.now(timezone.utc) + timedelta(hours=200),
            filed_route=route_text,
        )

        assert result.filed_route == route_text


@pytest_asyncio.fixture
async def corridor_with_avoid_and_include(session, draw_unique_iso3):
    """dep in A (west), arr in B (east), with C directly on the equator
    between them (the avoided state — a direct track genuinely crosses it)
    and D off to the south (the included state — nothing about the direct
    A->B track would otherwise pass anywhere near it). Mirrors the real
    scenario the user reported (task #124): avoid one real country, include
    another the direct route never touches at all.
    """
    iso_a, iso_b, iso_c, iso_d = draw_unique_iso3(4)

    session.add_all(
        [
            Country(iso3=iso_a, name=f"Country {iso_a}"),
            Country(iso3=iso_b, name=f"Country {iso_b}"),
            Country(iso3=iso_c, name=f"Country {iso_c}"),
            Country(iso3=iso_d, name=f"Country {iso_d}"),
        ]
    )
    await session.flush()
    session.add_all(
        [
            CountryGeometry(iso3=iso_a, geom=from_shape(_square(-15, -5, -5, 5), srid=4326)),
            CountryGeometry(iso3=iso_b, geom=from_shape(_square(5, -5, 15, 5), srid=4326)),
            CountryGeometry(iso3=iso_c, geom=from_shape(_square(-2, -1, 2, 1), srid=4326)),
            CountryGeometry(iso3=iso_d, geom=from_shape(_square(-2, -10, 2, -6), srid=4326)),
        ]
    )

    dep_icao = f"D{iso_a}"[:4].upper()
    arr_icao = f"A{iso_b}"[:4].upper()
    session.add_all(
        [
            Airport(icao=dep_icao, name="Dep Test", lat=0.0, lon=-10.0, country_iso3=iso_a, is_airport_of_entry=True),
            Airport(icao=arr_icao, name="Arr Test", lat=0.0, lon=10.0, country_iso3=iso_b, is_airport_of_entry=True),
        ]
    )
    session.add(VisaMatrixCell(country_iso3=iso_b, nationality_iso3=iso_b, requirement=VisaRequirement.NOT_REQUIRED, source="test"))
    await session.flush()

    return {"iso_a": iso_a, "iso_b": iso_b, "iso_c": iso_c, "iso_d": iso_d, "dep_icao": dep_icao, "arr_icao": arr_icao}


class TestAvoidIncludeAutoReroute:
    @pytest.mark.asyncio
    async def test_avoided_state_removed_and_included_state_added_after_reroute(
        self, session, corridor_with_avoid_and_include
    ):
        g = corridor_with_avoid_and_include
        aircraft_icao_type = await _seed_aircraft(session, max_range_nm=3000)

        # Confirm the premise: with no constraints, the direct route really
        # does cross C and does NOT cross D.
        direct = await leg_feasibility_service.compute_leg_feasibility(
            session,
            dep_icao=g["dep_icao"],
            arr_icao=g["arr_icao"],
            aircraft_icao_type=aircraft_icao_type,
            persons=[],
            reference_datetime=datetime.now(timezone.utc) + timedelta(hours=200),
        )
        direct_states = [s.iso3 for s in direct.route.states]
        assert g["iso_c"] in direct_states
        assert g["iso_d"] not in direct_states

        result = await leg_feasibility_service.compute_leg_feasibility(
            session,
            dep_icao=g["dep_icao"],
            arr_icao=g["arr_icao"],
            aircraft_icao_type=aircraft_icao_type,
            persons=[],
            reference_datetime=datetime.now(timezone.utc) + timedelta(hours=200),
            avoid_states={g["iso_c"]},
            include_states={g["iso_d"]},
        )

        # This is the exact bug reported: avoid Zimbabwe/include Zambia
        # returned a permit list with Zambia excluded and Zimbabwe included
        # — i.e. nothing downstream ever used the alternate route. The
        # committed route (and everything computed from it) must now
        # reflect the real, replanned path.
        committed_states = [s.iso3 for s in result.route.states]
        assert g["iso_c"] not in committed_states
        assert g["iso_d"] in committed_states
        assert g["iso_c"] not in [p.country_iso3 for p in result.permits.overflight_permits]
        assert g["iso_d"] in [p.country_iso3 for p in result.permits.overflight_permits]
        # permits' own avoid/include check now runs against the committed
        # (compliant) route, so it correctly no longer reports a violation.
        assert result.permits.avoid_include_violated is False
        # The committed distance/EET reflect the real (longer) path flown —
        # not the original direct-track numbers.
        assert result.route.distance_nm > direct.route.distance_nm
        assert result.eet_hours > direct.eet_hours
        # But the verdict still tells the truth about the original plan:
        # this leg only works because it was automatically replanned.
        assert result.verdict == FeasibilityVerdict.NOT_FEASIBLE_AS_ROUTED
        assert result.reroute is not None
        assert result.reroute.found is True
        assert result.reroute.extra_distance_nm > 0

    @pytest.mark.asyncio
    async def test_no_viable_alternate_keeps_direct_route_and_is_not_feasible(self, session, two_country_leg):
        g = two_country_leg
        aircraft_icao_type = await _seed_aircraft(session, max_range_nm=3000)

        # The arrival state itself is avoided — no detour can land in B
        # while also avoiding B, so this must fail honestly rather than
        # silently keep the (impossible) direct route.
        result = await leg_feasibility_service.compute_leg_feasibility(
            session,
            dep_icao=g["dep_icao"],
            arr_icao=g["arr_icao"],
            aircraft_icao_type=aircraft_icao_type,
            persons=[],
            reference_datetime=datetime.now(timezone.utc) + timedelta(hours=200),
            avoid_states={g["iso_b"]},
        )

        assert result.reroute is not None
        assert result.reroute.found is False
        assert result.verdict == FeasibilityVerdict.NOT_FEASIBLE
        # Route stays the direct (violating) one — the only route there is
        # to report anything real against.
        assert g["iso_b"] in [s.iso3 for s in result.route.states]
        assert result.permits.avoid_include_violated is True
