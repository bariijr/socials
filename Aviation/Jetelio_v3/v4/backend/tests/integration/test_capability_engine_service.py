"""Engine 3 (capability) service-layer coverage — tech-stop candidate
selection needs a real DB query (app.services.capability_engine_service._
fetch_tech_stop_candidates), so this can't be a domain unit test.
"""

import uuid
from datetime import date

import pytest
import pytest_asyncio

from app.models.aircraft import AircraftPerformance
from app.models.airport import Airport
from app.models.country import Country
from app.services import capability_engine_service


@pytest_asyncio.fixture
async def range_exceeded_leg_with_candidates(session, draw_unique_iso3):
    """dep/arr far enough apart to exceed a short-range aircraft's practical
    range, with two airport-of-entry tech-stop candidates roughly midway —
    one in a "safe" country, one in a country the leg is avoiding. Both
    would otherwise qualify (within range of both ends, real runway/fuel/
    hours data) — only the avoid_states filter should tell them apart.
    """
    iso_dep, iso_arr, iso_safe, iso_avoided = draw_unique_iso3(4)
    session.add_all([Country(iso3=c, name=f"Country {c}") for c in (iso_dep, iso_arr, iso_safe, iso_avoided)])
    await session.flush()

    dep_icao = f"D{iso_dep}"[:4].upper()
    arr_icao = f"A{iso_arr}"[:4].upper()
    safe_icao = f"S{iso_safe}"[:4].upper()
    avoided_icao = f"V{iso_avoided}"[:4].upper()
    session.add_all(
        [
            Airport(icao=dep_icao, name="Dep Test", lat=0.0, lon=0.0, country_iso3=iso_dep),
            Airport(icao=arr_icao, name="Arr Test", lat=0.0, lon=10.0, country_iso3=iso_arr),
            Airport(
                icao=safe_icao,
                name="Safe Candidate",
                lat=0.1,
                lon=5.0,
                country_iso3=iso_safe,
                is_airport_of_entry=True,
                operating_hours="H24",
            ),
            Airport(
                icao=avoided_icao,
                name="Avoided Candidate",
                lat=-0.1,
                lon=5.0,
                country_iso3=iso_avoided,
                is_airport_of_entry=True,
                operating_hours="H24",
            ),
        ]
    )
    await session.flush()

    icao_type = f"T{uuid.uuid4().hex[:6]}".upper()
    session.add(
        AircraftPerformance(
            icao_type=icao_type,
            max_range_nm=400,  # well under the ~600nm dep->arr distance
            cruise_tas_kts=470,
            fuel_burn_kg_per_hr=1200,
            max_pax=10,
            verified=True,
            verified_by="Test Engineer",
            verified_on=date.today(),
        )
    )
    await session.flush()

    return {
        "iso_safe": iso_safe,
        "iso_avoided": iso_avoided,
        "dep_icao": dep_icao,
        "arr_icao": arr_icao,
        "safe_icao": safe_icao,
        "avoided_icao": avoided_icao,
        "icao_type": icao_type,
    }


class TestTechStopAvoidsExcludedStates:
    @pytest.mark.asyncio
    async def test_candidate_in_avoided_state_is_excluded(self, session, range_exceeded_leg_with_candidates):
        g = range_exceeded_leg_with_candidates
        dep = await session.get(Airport, g["dep_icao"])
        arr = await session.get(Airport, g["arr_icao"])

        # Confirm the premise: with no avoid constraint, both candidates
        # qualify.
        baseline = await capability_engine_service.compute_leg_capability(
            session,
            aircraft_icao_type=g["icao_type"],
            dep_icao=g["dep_icao"],
            arr_icao=g["arr_icao"],
            dep_lat=dep.lat,
            dep_lon=dep.lon,
            arr_lat=arr.lat,
            arr_lon=arr.lon,
            distance_nm=600.0,
        )
        baseline_icaos = {t.icao for t in baseline.tech_stop_suggestions}
        assert g["safe_icao"] in baseline_icaos
        assert g["avoided_icao"] in baseline_icaos

        result = await capability_engine_service.compute_leg_capability(
            session,
            aircraft_icao_type=g["icao_type"],
            dep_icao=g["dep_icao"],
            arr_icao=g["arr_icao"],
            dep_lat=dep.lat,
            dep_lon=dep.lon,
            arr_lat=arr.lat,
            arr_lon=arr.lon,
            distance_nm=600.0,
            avoid_states={g["iso_avoided"]},
        )

        assert result.capability.exceeds is True
        suggested_icaos = {t.icao for t in result.tech_stop_suggestions}
        assert g["safe_icao"] in suggested_icaos
        assert g["avoided_icao"] not in suggested_icaos
