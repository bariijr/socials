"""Document auto-attach on permit application (task #108) — matches a
country's free-text required_documents against real Aircraft/Party
documents on file and wires the result into #104's Format & send flow.
"""

import uuid
from datetime import date, datetime, timedelta, timezone

import pytest

from app.models.aircraft import Aircraft
from app.models.aircraft_document import AircraftDocument, AircraftDocumentType
from app.models.country_requirements import CountryRequirement
from app.models.operator import Operator
from tests.integration.test_service_send_api import _create_vendor_with_contact
from tests.integration.test_trips_api import _auth_headers, trip_leg_fixture  # noqa: F401


@pytest.mark.asyncio
async def test_document_check_reports_attached_when_a_valid_document_is_on_file(client, session, trip_leg_fixture):
    fixture = trip_leg_fixture
    headers = _auth_headers()

    operator = Operator(name="Doc Test Operator")
    session.add(operator)
    await session.flush()
    registration = f"N{uuid.uuid4().hex[:5]}".upper()
    aircraft = Aircraft(registration=registration, icao_type=fixture["aircraft_icao_type"], operator_id=operator.id)
    session.add(aircraft)
    await session.flush()
    session.add(
        AircraftDocument(
            aircraft_id=aircraft.id, doc_type=AircraftDocumentType.INSURANCE, filename="insurance.pdf",
            s3_key=f"test/{uuid.uuid4().hex}.pdf", content_type="application/pdf", expiry_date=date(2030, 1, 1),
        )
    )
    session.add(
        CountryRequirement(
            source_ref=f"DOC-{uuid.uuid4().hex[:8]}", country_iso3=fixture["iso_b"], request_type="LANDING",
            required_documents=["Insurance Certificate"],
        )
    )
    await session.commit()

    payload = {
        "aircraft_icao_type": fixture["aircraft_icao_type"],
        "aircraft_registration": registration,
        "persons": [],
        "legs": [
            {
                "dep_icao": fixture["dep_icao"], "arr_icao": fixture["arr_icao"],
                "reference_datetime": (datetime.now(timezone.utc) + timedelta(hours=200)).isoformat(),
                "avoid_states": [], "include_states": [], "avoid_firs": [], "include_firs": [],
            }
        ],
    }
    created = (await client.post("/trips", headers=headers, json=payload)).json()
    trip_id, leg_id = created["id"], created["legs"][0]["id"]

    check = await client.get(
        f"/trips/{trip_id}/legs/{leg_id}/services/document-check", headers=headers, params={"icao": fixture["arr_icao"]}
    )
    assert check.status_code == 200, check.text
    results = check.json()
    assert len(results) == 1
    assert results[0]["requirement"] == "Insurance Certificate"
    assert results[0]["status"] == "ATTACHED"
    assert results[0]["source"] == "AIRCRAFT"


@pytest.mark.asyncio
async def test_document_check_reports_missing_when_no_matching_aircraft(client, session, trip_leg_fixture):
    fixture = trip_leg_fixture
    headers = _auth_headers()

    session.add(
        CountryRequirement(
            source_ref=f"DOC-{uuid.uuid4().hex[:8]}", country_iso3=fixture["iso_b"], request_type="LANDING",
            required_documents=["Insurance Certificate"],
        )
    )
    await session.commit()

    payload = {
        "aircraft_icao_type": fixture["aircraft_icao_type"],
        "persons": [],
        "legs": [
            {
                "dep_icao": fixture["dep_icao"], "arr_icao": fixture["arr_icao"],
                "reference_datetime": (datetime.now(timezone.utc) + timedelta(hours=200)).isoformat(),
                "avoid_states": [], "include_states": [], "avoid_firs": [], "include_firs": [],
            }
        ],
    }
    created = (await client.post("/trips", headers=headers, json=payload)).json()
    trip_id, leg_id = created["id"], created["legs"][0]["id"]

    check = await client.get(
        f"/trips/{trip_id}/legs/{leg_id}/services/document-check", headers=headers, params={"icao": fixture["arr_icao"]}
    )
    assert check.status_code == 200, check.text
    assert check.json()[0]["status"] == "MISSING"


@pytest.mark.asyncio
async def test_document_check_returns_empty_when_country_has_no_requirements_on_file(client, trip_leg_fixture):
    # This is the real-world default today (see Prompt.md §4.21) — must
    # degrade to "nothing required" rather than erroring or fabricating.
    fixture = trip_leg_fixture
    headers = _auth_headers()

    payload = {
        "aircraft_icao_type": fixture["aircraft_icao_type"],
        "persons": [],
        "legs": [
            {
                "dep_icao": fixture["dep_icao"], "arr_icao": fixture["arr_icao"],
                "reference_datetime": (datetime.now(timezone.utc) + timedelta(hours=200)).isoformat(),
                "avoid_states": [], "include_states": [], "avoid_firs": [], "include_firs": [],
            }
        ],
    }
    created = (await client.post("/trips", headers=headers, json=payload)).json()
    trip_id, leg_id = created["id"], created["legs"][0]["id"]

    check = await client.get(
        f"/trips/{trip_id}/legs/{leg_id}/services/document-check", headers=headers, params={"icao": fixture["arr_icao"]}
    )
    assert check.status_code == 200, check.text
    assert check.json() == []


@pytest.mark.asyncio
async def test_send_reports_document_warnings_for_unattached_requirements(client, session, trip_leg_fixture):
    fixture = trip_leg_fixture
    headers = _auth_headers()

    session.add(
        CountryRequirement(
            source_ref=f"DOC-{uuid.uuid4().hex[:8]}", country_iso3=fixture["iso_b"], request_type="LANDING",
            required_documents=["Insurance Certificate"],
        )
    )
    await session.commit()

    payload = {
        "aircraft_icao_type": fixture["aircraft_icao_type"],
        "persons": [],
        "legs": [
            {
                "dep_icao": fixture["dep_icao"], "arr_icao": fixture["arr_icao"],
                "reference_datetime": (datetime.now(timezone.utc) + timedelta(hours=200)).isoformat(),
                "avoid_states": [], "include_states": [], "avoid_firs": [], "include_firs": [],
            }
        ],
    }
    created = (await client.post("/trips", headers=headers, json=payload)).json()
    trip_id, leg_id = created["id"], created["legs"][0]["id"]
    service = next(s for s in created["legs"][0]["service_assignments"] if s["icao"] == fixture["arr_icao"])

    vendor = await _create_vendor_with_contact(client, headers, "EMAIL", "docwarn@vendor.example")
    config = await client.post(
        "/service-delivery-configs",
        headers=headers,
        json={"leg_id": leg_id, "service_code": service["service_code"], "vendor_id": vendor["id"], "delivery_channels": ["EMAIL"]},
    )
    assert config.status_code == 201, config.text

    resp = await client.post(
        f"/trips/{trip_id}/legs/{leg_id}/services/send",
        headers=headers,
        json={"items": [{"service_code": service["service_code"], "icao": fixture["arr_icao"]}]},
    )
    assert resp.status_code == 200, resp.text
    result = resp.json()[0]
    assert result["sent"] is True
    assert result["document_warnings"] == ["MISSING: Insurance Certificate"]
