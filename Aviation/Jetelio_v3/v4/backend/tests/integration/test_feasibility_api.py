"""Public Feasibility IQ router — full multi-leg check -> request-quote
flow, avoid/include (state + FIR), plus the abuse-prevention surface
(rate limiting; captcha was removed in task #110). Needs real Postgres+PostGIS
and real Redis (both reachable from the api-test service).
"""

import random
import uuid
from datetime import date, datetime, timedelta, timezone

import httpx
import pytest
import pytest_asyncio
from geoalchemy2.shape import from_shape
from shapely.geometry import MultiPolygon, Polygon
from sqlalchemy import select

from app.models.aircraft import AircraftPerformance
from app.models.airport import Airport
from app.models.country import Country
from app.models.geometry import CountryGeometry, FirBoundary
from app.models.notification import Notification
from app.models.settings import Setting
from app.models.trip import Trip, TripLeg
MAILHOG_API = "http://mailhog:8025/api/v2"


async def _latest_mailhog_messages_to(recipient: str) -> list[dict]:
    async with httpx.AsyncClient() as http:
        resp = await http.get(f"{MAILHOG_API}/messages", params={"limit": 50})
    resp.raise_for_status()
    return [m for m in resp.json()["items"] if recipient in m["Content"]["Headers"].get("To", [""])[0]]


def _square(min_lon: float, min_lat: float, max_lon: float, max_lat: float) -> MultiPolygon:
    return MultiPolygon(
        [Polygon([(min_lon, min_lat), (max_lon, min_lat), (max_lon, max_lat), (min_lon, max_lat), (min_lon, min_lat)])]
    )


def _ip_headers() -> dict[str, str]:
    # A fresh, high-entropy random source IP per call so tests get
    # independent rate-limit buckets — collisions would make tests flaky.
    return {
        "X-Forwarded-For": f"{random.randint(1, 223)}.{random.randint(0, 255)}.{random.randint(0, 255)}.{random.randint(1, 254)}"
    }


@pytest_asyncio.fixture
async def public_leg_fixture(session, geo_region_base_lon, draw_unique_iso3):
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

    fir_code = f"F{uuid.uuid4().hex[:3]}".upper()
    session.add(
        FirBoundary(
            icao_fir_code=fir_code, name=f"FIR {fir_code}", geom=from_shape(_square(lon, -5, lon + 4, 5), srid=4326), source="test"
        )
    )

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
        "fir_code": fir_code,
        "aircraft_icao_type": icao_type,
    }


def _leg(fixture: dict, *, reverse: bool = False, avoid_firs: list[str] | None = None) -> dict:
    dep, arr = (fixture["arr_icao"], fixture["dep_icao"]) if reverse else (fixture["dep_icao"], fixture["arr_icao"])
    return {
        "dep_icao": dep,
        "arr_icao": arr,
        "reference_datetime": (datetime.now(timezone.utc) + timedelta(hours=200)).isoformat(),
        "avoid_states": [],
        "include_states": [],
        "avoid_firs": avoid_firs or [],
        "include_firs": [],
    }


def _check_payload(fixture: dict, legs: list[dict] | None = None) -> dict:
    return {
        "aircraft_icao_type": fixture["aircraft_icao_type"],
        "persons": [{"role": "CREW", "nationality_iso3": fixture["iso_b"]}],
        "legs": legs or [_leg(fixture)],
    }


class TestFeasibilityCheck:
    @pytest.mark.asyncio
    async def test_check_returns_public_projection_without_passport_fields(self, client, public_leg_fixture):
        resp = await client.post(
            "/feasibility/check", json=_check_payload(public_leg_fixture), headers=_ip_headers()
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()

        assert body["overall_verdict"] == "FEASIBLE"
        assert len(body["legs"]) == 1
        leg = body["legs"][0]
        assert leg["verdict"] == "FEASIBLE"
        assert leg["route"]["distance_nm"] > 0
        assert leg["credentials"]["persons"][0]["nationality_iso3"] == public_leg_fixture["iso_b"]
        assert "passport_status" not in leg["credentials"]["persons"][0]
        assert "rollup_status" not in leg["credentials"]["persons"][0]
        assert "check_id" in body

    @pytest.mark.asyncio
    async def test_multi_leg_trip_computes_each_leg_independently(self, client, public_leg_fixture):
        legs = [_leg(public_leg_fixture), _leg(public_leg_fixture, reverse=True)]
        resp = await client.post(
            "/feasibility/check", json=_check_payload(public_leg_fixture, legs=legs), headers=_ip_headers()
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()

        assert len(body["legs"]) == 2
        assert body["legs"][0]["dep_icao"] == public_leg_fixture["dep_icao"]
        assert body["legs"][0]["arr_icao"] == public_leg_fixture["arr_icao"]
        assert body["legs"][1]["dep_icao"] == public_leg_fixture["arr_icao"]
        assert body["legs"][1]["arr_icao"] == public_leg_fixture["dep_icao"]
        assert body["overall_verdict"] == "FEASIBLE"

    @pytest.mark.asyncio
    async def test_specific_role_vocabulary_buckets_into_crew_and_pax_for_souls_on_board(self, client, public_leg_fixture):
        # Task #107: role widened from CREW|PAX to specific positions. PIC/FA
        # are crew sub-roles, VIP/PRINCIPAL are pax sub-roles — confirm the
        # souls-on-board split still comes out right end to end, not just at
        # the domain-function unit level.
        payload = _check_payload(public_leg_fixture)
        payload["persons"] = [
            {"role": "PIC", "nationality_iso3": public_leg_fixture["iso_b"]},
            {"role": "FA", "nationality_iso3": public_leg_fixture["iso_b"]},
            {"role": "VIP", "nationality_iso3": public_leg_fixture["iso_b"]},
            {"role": "PRINCIPAL", "nationality_iso3": public_leg_fixture["iso_b"]},
        ]
        resp = await client.post("/feasibility/check", json=payload, headers=_ip_headers())
        assert resp.status_code == 200, resp.text
        credentials = resp.json()["legs"][0]["credentials"]

        assert credentials["souls_on_board_total"] == 4
        assert credentials["souls_on_board_exceeds_max_pax"] is False
        roles = {p["role"] for p in credentials["persons"]}
        assert roles == {"PIC", "FA", "VIP", "PRINCIPAL"}

    @pytest.mark.asyncio
    async def test_avoiding_a_fir_that_blocks_the_whole_corridor_is_not_feasible(self, client, public_leg_fixture):
        legs = [_leg(public_leg_fixture, avoid_firs=[public_leg_fixture["fir_code"]])]
        resp = await client.post(
            "/feasibility/check", json=_check_payload(public_leg_fixture, legs=legs), headers=_ip_headers()
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()

        leg = body["legs"][0]
        assert leg["permits"]["fir_avoid_include"]["violated"] is True
        assert public_leg_fixture["fir_code"] in leg["permits"]["fir_avoid_include"]["avoided_transited"]
        # The FIR spans the whole corridor width (lat -5..5, well beyond the
        # default reroute half-width), so no detour exists — must fail
        # honestly rather than silently ignore the avoid request.
        assert leg["verdict"] == "NOT FEASIBLE"
        assert body["overall_verdict"] == "NOT FEASIBLE"


class TestRequestQuote:
    @pytest.mark.asyncio
    async def test_request_quote_creates_enquiry_trip(self, client, session, public_leg_fixture):
        check_resp = await client.post(
            "/feasibility/check", json=_check_payload(public_leg_fixture), headers=_ip_headers()
        )
        check_id = check_resp.json()["check_id"]

        quote_resp = await client.post(
            "/feasibility/request-quote",
            json={"check_id": check_id, "contact_name": "Test Contact", "contact_email": "test@example.com"},
            headers=_ip_headers(),
        )
        assert quote_resp.status_code == 200, quote_resp.text
        body = quote_resp.json()
        assert body["status"] == "LEAD"

        trip = await session.get(Trip, uuid.UUID(body["trip_id"]))
        assert trip is not None
        assert trip.requested_by_email == "test@example.com"
        assert trip.source.value == "PUBLIC_FEASIBILITY_IQ"

        legs = (
            (await session.execute(select(TripLeg).where(TripLeg.trip_id == trip.id).order_by(TripLeg.leg_index)))
            .scalars()
            .all()
        )
        assert len(legs) == 1
        assert legs[0].dep_icao == public_leg_fixture["dep_icao"]
        assert legs[0].verdict == "FEASIBLE"

    @pytest.mark.asyncio
    async def test_multi_leg_quote_creates_one_trip_leg_per_leg(self, client, session, public_leg_fixture):
        legs = [_leg(public_leg_fixture), _leg(public_leg_fixture, reverse=True)]
        check_resp = await client.post(
            "/feasibility/check", json=_check_payload(public_leg_fixture, legs=legs), headers=_ip_headers()
        )
        check_id = check_resp.json()["check_id"]

        quote_resp = await client.post(
            "/feasibility/request-quote",
            json={"check_id": check_id, "contact_name": "Multi Leg", "contact_email": "multileg@example.com"},
            headers=_ip_headers(),
        )
        assert quote_resp.status_code == 200, quote_resp.text
        trip_id = uuid.UUID(quote_resp.json()["trip_id"])

        trip_legs = (
            (await session.execute(select(TripLeg).where(TripLeg.trip_id == trip_id).order_by(TripLeg.leg_index)))
            .scalars()
            .all()
        )
        assert [tl.leg_index for tl in trip_legs] == [0, 1]
        assert trip_legs[0].dep_icao == public_leg_fixture["dep_icao"]
        assert trip_legs[1].dep_icao == public_leg_fixture["arr_icao"]

    @pytest.mark.asyncio
    async def test_replayed_check_id_is_rejected(self, client, public_leg_fixture):
        check_resp = await client.post(
            "/feasibility/check", json=_check_payload(public_leg_fixture), headers=_ip_headers()
        )
        check_id = check_resp.json()["check_id"]

        quote_payload = {"check_id": check_id, "contact_name": "Test", "contact_email": "test2@example.com"}
        first = await client.post("/feasibility/request-quote", json=quote_payload, headers=_ip_headers())
        assert first.status_code == 200

        second = await client.post("/feasibility/request-quote", json=quote_payload, headers=_ip_headers())
        assert second.status_code == 404

    @pytest.mark.asyncio
    async def test_unknown_check_id_is_rejected(self, client):
        resp = await client.post(
            "/feasibility/request-quote",
            json={"check_id": "not-a-real-check-id", "contact_name": "Test", "contact_email": "test3@example.com"},
            headers=_ip_headers(),
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_writes_a_notification_and_emails_the_pnr(self, client, session, public_leg_fixture):
        """Task #106 — both are best-effort side effects of the same
        already-committed enquiry trip, verified for real rather than
        trusting the 200 response alone (same MailHog-capture discipline as
        test_service_send_api.py)."""
        check_resp = await client.post(
            "/feasibility/check", json=_check_payload(public_leg_fixture), headers=_ip_headers()
        )
        check_id = check_resp.json()["check_id"]

        recipient = f"pnr-test-{uuid.uuid4().hex[:8]}@example.com"
        quote_resp = await client.post(
            "/feasibility/request-quote",
            json={"check_id": check_id, "contact_name": "Notification Test", "contact_email": recipient},
            headers=_ip_headers(),
        )
        assert quote_resp.status_code == 200, quote_resp.text
        trip_id = quote_resp.json()["trip_id"]

        notification = (
            await session.execute(select(Notification).where(Notification.entity_id == trip_id))
        ).scalar_one_or_none()
        assert notification is not None
        assert notification.entity_type == "Trip"
        assert notification.kind == "NEW_ENQUIRY"
        assert notification.seen_at is None

        matches = await _latest_mailhog_messages_to(recipient)
        assert len(matches) == 1, matches


class TestRateLimit:
    @pytest.mark.asyncio
    async def test_exceeding_rate_limit_returns_429(self, client, session):
        setting = await session.get(Setting, "feasibility_iq_rate_limit_per_hour")
        original_value = setting.value
        setting.value = "2"
        await session.commit()

        try:
            fixed_ip = _ip_headers()
            for _ in range(2):
                resp = await client.get("/feasibility/aircraft-types", params={"q": "a"}, headers=fixed_ip)
                assert resp.status_code == 200

            blocked = await client.get("/feasibility/aircraft-types", params={"q": "a"}, headers=fixed_ip)
            assert blocked.status_code == 429
            assert "Retry-After" in blocked.headers
        finally:
            setting.value = original_value
            await session.commit()

    @pytest.mark.asyncio
    async def test_different_ips_get_independent_buckets(self, client, session):
        setting = await session.get(Setting, "feasibility_iq_rate_limit_per_hour")
        original_value = setting.value
        setting.value = "1"
        await session.commit()

        try:
            ip_one = _ip_headers()
            ip_two = _ip_headers()
            while ip_two == ip_one:
                ip_two = _ip_headers()
            first = await client.get("/feasibility/aircraft-types", params={"q": "a"}, headers=ip_one)
            second = await client.get("/feasibility/aircraft-types", params={"q": "a"}, headers=ip_two)
            assert first.status_code == 200
            assert second.status_code == 200
        finally:
            setting.value = original_value
            await session.commit()
