"""Trip Manager — authenticated CRUD, RBAC, live deadline refresh, service
assignment round-trip. Needs real Postgres+PostGIS (reachable from the
api-test service).
"""

import uuid
from datetime import date, datetime, timedelta, timezone

import pytest
import pytest_asyncio
from geoalchemy2.shape import from_shape
from shapely.geometry import MultiPolygon, Polygon

from app.core.security import create_access_token
from app.models.aircraft import AircraftPerformance
from app.models.airport import Airport
from app.models.country import Country
from app.models.geometry import CountryGeometry
from app.models.service_catalogue import ServiceCatalogueEntry, ServiceCategory, ServiceLevel
from app.models.user import UserRole


def _square(min_lon: float, min_lat: float, max_lon: float, max_lat: float) -> MultiPolygon:
    return MultiPolygon(
        [Polygon([(min_lon, min_lat), (max_lon, min_lat), (max_lon, max_lat), (min_lon, max_lat), (min_lon, min_lat)])]
    )


def _auth_headers(role: UserRole = UserRole.SUPER_ADMIN) -> dict[str, str]:
    token = create_access_token(str(uuid.uuid4()), role.value, extra={"email": "test@example.com"})
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def trip_leg_fixture(session, geo_region_base_lon, draw_unique_iso3):
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
            Airport(icao=dep_icao, name="Dep Test", lat=0.0, lon=lon + 0.5, country_iso3=iso_a, is_airport_of_entry=True),
            Airport(icao=arr_icao, name="Arr Test", lat=0.0, lon=lon + 3.5, country_iso3=iso_b, is_airport_of_entry=True),
        ]
    )

    # A service catalogue entry so PER_STOP service_requirements (and thus
    # service_assignments to test against) actually get generated.
    service_code = f"S{uuid.uuid4().hex[:6]}".upper()
    session.add(ServiceCatalogueEntry(code=service_code, name="Fuel", category=ServiceCategory.GROUND, level=ServiceLevel.SERVICE))

    icao_type = f"T{uuid.uuid4().hex[:6]}".upper()
    session.add(
        AircraftPerformance(
            icao_type=icao_type,
            max_range_nm=3000,
            cruise_tas_kts=470,
            fuel_burn_kg_per_hr=1200,
            max_pax=10,
            verified=True,
            verified_by="Test Engineer",
            verified_on=date.today(),
        )
    )
    await session.commit()

    return {
        "iso_a": iso_a,
        "iso_b": iso_b,
        "dep_icao": dep_icao,
        "arr_icao": arr_icao,
        "aircraft_icao_type": icao_type,
        "service_code": service_code,
    }


def _leg_payload(fixture: dict, *, reverse: bool = False, hour_offset: float = 200) -> dict:
    dep, arr = (fixture["arr_icao"], fixture["dep_icao"]) if reverse else (fixture["dep_icao"], fixture["arr_icao"])
    return {
        "dep_icao": dep,
        "arr_icao": arr,
        "reference_datetime": (datetime.now(timezone.utc) + timedelta(hours=hour_offset)).isoformat(),
        "avoid_states": [],
        "include_states": [],
        "avoid_firs": [],
        "include_firs": [],
    }


def _create_payload(fixture: dict, legs: list[dict] | None = None) -> dict:
    return {
        "aircraft_icao_type": fixture["aircraft_icao_type"],
        "persons": [{"role": "CREW", "nationality_iso3": fixture["iso_b"]}],
        "legs": legs or [_leg_payload(fixture)],
        "requested_by_name": "Ops Team",
        "requested_by_email": "ops@example.com",
    }


class TestCreateTrip:
    @pytest.mark.asyncio
    async def test_super_admin_can_create_trip(self, client, trip_leg_fixture):
        resp = await client.post("/trips", json=_create_payload(trip_leg_fixture), headers=_auth_headers())
        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body["status"] == "LEAD"
        assert body["source"] == "INTERNAL"
        assert len(body["legs"]) == 1
        assert body["legs"][0]["result"]["dep_icao"] == trip_leg_fixture["dep_icao"]
        assert body["legs"][0]["result"]["verdict"] == "FEASIBLE"

    @pytest.mark.asyncio
    async def test_no_leg_cap_for_internal_trips(self, client, trip_leg_fixture):
        # Each leg staggered well past the previous one's arrival —
        # primary legs must be chronologically ordered (see
        # app.domain.trip_legs.validate_primary_leg_ordering); this test is
        # about the leg-count cap, not sequencing, so stagger generously.
        legs = [_leg_payload(trip_leg_fixture, reverse=bool(i % 2), hour_offset=200 + i * 10) for i in range(10)]
        resp = await client.post("/trips", json=_create_payload(trip_leg_fixture, legs=legs), headers=_auth_headers())
        assert resp.status_code == 201, resp.text
        assert len(resp.json()["legs"]) == 10

    @pytest.mark.asyncio
    async def test_out_of_order_primary_legs_are_rejected(self, client, trip_leg_fixture):
        legs = [
            _leg_payload(trip_leg_fixture, hour_offset=200),
            _leg_payload(trip_leg_fixture, reverse=True, hour_offset=100),  # well before leg 1 even departs
        ]
        resp = await client.post("/trips", json=_create_payload(trip_leg_fixture, legs=legs), headers=_auth_headers())
        assert resp.status_code == 422
        assert "chronological order" in resp.text

    @pytest.mark.asyncio
    async def test_alternate_leg_exempt_from_ordering(self, client, trip_leg_fixture):
        legs = [
            _leg_payload(trip_leg_fixture, hour_offset=200),
            {**_leg_payload(trip_leg_fixture, reverse=True, hour_offset=201), "leg_type": "ALTERNATE"},
        ]
        resp = await client.post("/trips", json=_create_payload(trip_leg_fixture, legs=legs), headers=_auth_headers())
        assert resp.status_code == 201, resp.text
        assert resp.json()["legs"][1]["leg_type"] == "ALTERNATE"

    @pytest.mark.asyncio
    async def test_auditor_cannot_create_trip(self, client, trip_leg_fixture):
        resp = await client.post(
            "/trips", json=_create_payload(trip_leg_fixture), headers=_auth_headers(UserRole.AUDITOR)
        )
        assert resp.status_code == 403

    @pytest.mark.asyncio
    async def test_operations_specialist_can_create_trip(self, client, trip_leg_fixture):
        resp = await client.post(
            "/trips", json=_create_payload(trip_leg_fixture), headers=_auth_headers(UserRole.OPERATIONS_SPECIALIST)
        )
        assert resp.status_code == 201


class TestTripLifecycle:
    @pytest.mark.asyncio
    async def test_list_and_get_trip(self, client, trip_leg_fixture):
        created = (await client.post("/trips", json=_create_payload(trip_leg_fixture), headers=_auth_headers())).json()
        trip_id = created["id"]

        listing = await client.get("/trips", headers=_auth_headers())
        assert listing.status_code == 200
        assert any(t["id"] == trip_id for t in listing.json()["items"])

        detail = await client.get(f"/trips/{trip_id}", headers=_auth_headers())
        assert detail.status_code == 200
        assert detail.json()["overall_verdict"] == "FEASIBLE"
        assert detail.json()["next_deadline"] is not None

    @pytest.mark.asyncio
    async def test_update_status_requires_write_access(self, client, trip_leg_fixture):
        created = (await client.post("/trips", json=_create_payload(trip_leg_fixture), headers=_auth_headers())).json()
        trip_id = created["id"]

        denied = await client.patch(
            f"/trips/{trip_id}",
            json={"version": created["version"], "status": "ACTIVE"},
            headers=_auth_headers(UserRole.AUDITOR),
        )
        assert denied.status_code == 403

        ok = await client.patch(
            f"/trips/{trip_id}", json={"version": created["version"], "status": "ACTIVE"}, headers=_auth_headers()
        )
        assert ok.status_code == 200
        assert ok.json()["status"] == "ACTIVE"

    @pytest.mark.asyncio
    async def test_stale_version_conflicts(self, client, trip_leg_fixture):
        created = (await client.post("/trips", json=_create_payload(trip_leg_fixture), headers=_auth_headers())).json()
        trip_id = created["id"]

        await client.patch(f"/trips/{trip_id}", json={"version": created["version"], "notes": "first"}, headers=_auth_headers())
        stale = await client.patch(
            f"/trips/{trip_id}", json={"version": created["version"], "notes": "second"}, headers=_auth_headers()
        )
        assert stale.status_code == 409

    @pytest.mark.asyncio
    async def test_add_and_remove_leg(self, client, trip_leg_fixture):
        created = (await client.post("/trips", json=_create_payload(trip_leg_fixture), headers=_auth_headers())).json()
        trip_id = created["id"]

        added = await client.post(
            f"/trips/{trip_id}/legs", json=_leg_payload(trip_leg_fixture, reverse=True), headers=_auth_headers()
        )
        assert added.status_code == 201, added.text
        assert len(added.json()["legs"]) == 2
        leg_to_remove = added.json()["legs"][1]["id"]

        denied = await client.delete(
            f"/trips/{trip_id}/legs/{leg_to_remove}", headers=_auth_headers(UserRole.OPERATIONS_SPECIALIST)
        )
        assert denied.status_code == 403

        removed = await client.delete(f"/trips/{trip_id}/legs/{leg_to_remove}", headers=_auth_headers())
        assert removed.status_code == 200
        assert len(removed.json()["legs"]) == 1

    @pytest.mark.asyncio
    async def test_update_leg_recomputes_route(self, client, trip_leg_fixture):
        created = (await client.post("/trips", json=_create_payload(trip_leg_fixture), headers=_auth_headers())).json()
        trip_id = created["id"]
        leg_id = created["legs"][0]["id"]

        updated = await client.patch(
            f"/trips/{trip_id}/legs/{leg_id}", json=_leg_payload(trip_leg_fixture, reverse=True), headers=_auth_headers()
        )
        assert updated.status_code == 200, updated.text
        assert updated.json()["legs"][0]["result"]["dep_icao"] == trip_leg_fixture["arr_icao"]

    @pytest.mark.asyncio
    async def test_service_assignment_round_trip(self, client, trip_leg_fixture):
        created = (await client.post("/trips", json=_create_payload(trip_leg_fixture), headers=_auth_headers())).json()
        trip_id = created["id"]
        leg = created["legs"][0]
        leg_id = leg["id"]
        assert len(leg["service_assignments"]) > 0
        service = leg["service_assignments"][0]
        assert service["provider"] == "JETELIO"  # unassigned defaults to JETELIO-requested for display

        resp = await client.put(
            f"/trips/{trip_id}/legs/{leg_id}/service-assignments/{service['service_code']}/{service['icao']}",
            json={"provider": "THIRD_PARTY", "vendor_id": "vendor-123", "notes": "test"},
            headers=_auth_headers(),
        )
        assert resp.status_code == 200, resp.text
        updated_service = next(
            s
            for s in resp.json()["legs"][0]["service_assignments"]
            if s["service_code"] == service["service_code"] and s["icao"] == service["icao"]
        )
        assert updated_service["provider"] == "THIRD_PARTY"
        assert updated_service["vendor_id"] == "vendor-123"
        assert updated_service["status"] == "PENDING"
        assert updated_service["confirmation_number"] is None
        assert updated_service["granted_at"] is None
        assert updated_service["valid_until"] is None

    @pytest.mark.asyncio
    async def test_confirming_a_service_assignment_sets_granted_at_and_valid_until(self, client, trip_leg_fixture):
        created = (await client.post("/trips", json=_create_payload(trip_leg_fixture), headers=_auth_headers())).json()
        trip_id = created["id"]
        leg_id = created["legs"][0]["id"]
        service = created["legs"][0]["service_assignments"][0]

        resp = await client.put(
            f"/trips/{trip_id}/legs/{leg_id}/service-assignments/{service['service_code']}/{service['icao']}",
            json={"provider": "JETELIO", "status": "CONFIRMED", "confirmation_number": "CONF-001"},
            headers=_auth_headers(),
        )
        assert resp.status_code == 200, resp.text
        updated = next(
            s
            for s in resp.json()["legs"][0]["service_assignments"]
            if s["service_code"] == service["service_code"] and s["icao"] == service["icao"]
        )
        assert updated["status"] == "CONFIRMED"
        assert updated["confirmation_number"] == "CONF-001"
        assert updated["granted_at"] is not None
        # No permit_validity_amount/unit set on the fixture's test country,
        # so this falls back to the named setting default (30 DAYS) — still
        # a real computed value, not null, matching the fallback discipline
        # used everywhere else in this system.
        assert updated["valid_until"] is not None
        assert updated["valid_until"] > updated["granted_at"]

        # Re-confirming (e.g. editing notes while already CONFIRMED) must
        # not reset the original grant instant.
        second = await client.put(
            f"/trips/{trip_id}/legs/{leg_id}/service-assignments/{service['service_code']}/{service['icao']}",
            json={"provider": "JETELIO", "status": "CONFIRMED", "confirmation_number": "CONF-001", "notes": "edited"},
            headers=_auth_headers(),
        )
        assert second.status_code == 200, second.text
        second_updated = next(
            s
            for s in second.json()["legs"][0]["service_assignments"]
            if s["service_code"] == service["service_code"] and s["icao"] == service["icao"]
        )
        assert second_updated["granted_at"] == updated["granted_at"]
        assert second_updated["valid_until"] == updated["valid_until"]
        assert second_updated["notes"] == "edited"
