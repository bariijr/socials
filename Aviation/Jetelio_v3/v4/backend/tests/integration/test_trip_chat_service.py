"""trip_chat_service — resolution-logic coverage (task #125). The
Anthropic call itself is always mocked here: never hit the real API from
an automated test (cost + nondeterminism), so this file exercises the
part with real correctness risk instead — that a query name only ever
becomes a resolved code when it genuinely matches something real in the
DB, and is honestly flagged (not guessed) otherwise.
"""

import uuid
from datetime import date

import pytest
import pytest_asyncio

from app.core.chat.schema import LegExtraction, TripExtraction
from app.models.aircraft import AircraftPerformance
from app.models.airport import Airport
from app.models.country import Country
from app.services import trip_chat_service


@pytest_asyncio.fixture
async def chat_fixture_data(session, draw_unique_iso3):
    iso_dep, iso_arr, iso_avoid = draw_unique_iso3(3)
    session.add_all(
        [
            Country(iso3=iso_dep, name=f"Country {iso_dep}"),
            Country(iso3=iso_arr, name=f"Country {iso_arr}"),
            Country(iso3=iso_avoid, name=f"Avoidistan {iso_avoid}"),
        ]
    )
    await session.flush()
    dep_icao = f"D{iso_dep}"[:4].upper()
    arr_icao = f"A{iso_arr}"[:4].upper()
    session.add_all(
        [
            Airport(icao=dep_icao, name="Departure City Intl", city="Departure City", country_iso3=iso_dep, lat=0.0, lon=0.0),
            Airport(icao=arr_icao, name="Arrival City Intl", city="Arrival City", country_iso3=iso_arr, lat=0.0, lon=10.0),
        ]
    )
    icao_type = f"T{uuid.uuid4().hex[:6]}".upper()
    session.add(AircraftPerformance(icao_type=icao_type, manufacturer="Gulfstream", model_series="G650", max_range_nm=7000))
    await session.flush()

    return {
        "iso_dep": iso_dep,
        "iso_arr": iso_arr,
        "iso_avoid": iso_avoid,
        "avoid_name": f"Avoidistan {iso_avoid}",
        "dep_icao": dep_icao,
        "arr_icao": arr_icao,
        "dep_city": "Departure City",
        "arr_city": "Arrival City",
        "icao_type": icao_type,
    }


def _mock_extraction(monkeypatch, extraction: TripExtraction | None) -> None:
    async def _fake(session, message: str, *, today: date):
        return extraction

    monkeypatch.setattr(trip_chat_service, "extract_trip_request", _fake)


class TestParseTripMessage:
    @pytest.mark.asyncio
    async def test_matched_locations_resolve_to_real_codes(self, session, monkeypatch, chat_fixture_data):
        g = chat_fixture_data
        extraction = TripExtraction(
            aircraft_registration="N123AB",
            aircraft_type_query="G650",
            operator_name="Test Operator LLC",
            crew_count=2,
            pax_count=4,
            legs=[
                LegExtraction(
                    departure_query=g["dep_city"],
                    arrival_query=g["arr_city"],
                    departure_date="2026-09-01",
                    departure_time_utc="14:30",
                    avoid_country_queries=[g["avoid_name"]],
                    include_country_queries=[],
                )
            ],
        )
        _mock_extraction(monkeypatch, extraction)

        draft = await trip_chat_service.parse_trip_message(session, "irrelevant — extraction is mocked", today=date(2026, 8, 13))

        assert draft is not None
        assert draft.aircraft_registration == "N123AB"
        assert draft.aircraft_type is not None
        assert draft.aircraft_type.icao_type == g["icao_type"]
        assert draft.operator_name == "Test Operator LLC"
        assert len(draft.legs) == 1
        leg = draft.legs[0]
        assert leg.departure.icao == g["dep_icao"]
        assert leg.arrival.icao == g["arr_icao"]
        assert leg.departure_date == "2026-09-01"
        assert leg.departure_time_utc == "14:30"
        assert len(leg.avoid_countries) == 1
        assert leg.avoid_countries[0].iso3 == g["iso_avoid"]
        assert draft.warnings == []

    @pytest.mark.asyncio
    async def test_unmatched_location_is_flagged_not_guessed(self, session, monkeypatch, chat_fixture_data):
        g = chat_fixture_data
        extraction = TripExtraction(
            aircraft_registration=None,
            aircraft_type_query=None,
            operator_name=None,
            crew_count=None,
            pax_count=None,
            legs=[
                LegExtraction(
                    departure_query=g["dep_city"],
                    arrival_query="Nowhere That Exists In This Database Whatsoever",
                    departure_date=None,
                    departure_time_utc=None,
                    avoid_country_queries=["Also Not A Real Country Name"],
                    include_country_queries=[],
                )
            ],
        )
        _mock_extraction(monkeypatch, extraction)

        draft = await trip_chat_service.parse_trip_message(session, "irrelevant", today=date(2026, 8, 13))

        assert draft is not None
        leg = draft.legs[0]
        # The real match still resolves...
        assert leg.departure.icao == g["dep_icao"]
        # ...but nothing invents a code for a query that doesn't match
        # anything real — it stays None and is surfaced as a warning
        # instead, exactly the discipline this task exists to enforce.
        assert leg.arrival.icao is None
        assert leg.avoid_countries[0].iso3 is None
        assert any("Nowhere That Exists" in w for w in draft.warnings)
        assert any("Also Not A Real Country Name" in w for w in draft.warnings)

    @pytest.mark.asyncio
    async def test_extraction_failure_returns_none(self, session, monkeypatch, chat_fixture_data):
        # No base URL configured / a failed Ollama call — the provider
        # itself already returns None in that case (see
        # ollama_provider.py); parse_trip_message must propagate that
        # honestly, never fabricate an empty-but-successful-looking draft.
        _mock_extraction(monkeypatch, None)

        draft = await trip_chat_service.parse_trip_message(session, "irrelevant", today=date(2026, 8, 13))

        assert draft is None
