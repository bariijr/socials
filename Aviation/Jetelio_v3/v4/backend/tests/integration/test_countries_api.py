import uuid

import pytest

from app.core.security import create_access_token
from app.models.user import UserRole


def _auth_headers(role: UserRole = UserRole.SUPER_ADMIN) -> dict[str, str]:
    token = create_access_token(str(uuid.uuid4()), role.value, extra={"email": "test@example.com"})
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_create_and_get_country(client, unique_iso3):
    payload = {
        "iso3": unique_iso3,
        "iso2": unique_iso3[:2],
        "name": "Test Country",
        "region": "Africa",
    }
    resp = await client.post("/countries", json=payload, headers=_auth_headers())
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["iso3"] == unique_iso3
    # No provenance yet -> falls back to the named-setting default, flagged.
    assert body["reference_status"] == "UNVERIFIED - USING FALLBACK"
    assert body["effective_lead_time_hours"] == 72
    assert body["effective_lead_time_is_fallback"] is True

    resp = await client.get(f"/countries/{unique_iso3}", headers=_auth_headers())
    assert resp.status_code == 200
    assert resp.json()["name"] == "Test Country"


@pytest.mark.asyncio
async def test_create_country_requires_write_role(client, unique_iso3):
    payload = {"iso3": unique_iso3, "iso2": unique_iso3[:2], "name": "Blocked Country"}
    resp = await client.post("/countries", json=payload, headers=_auth_headers(UserRole.AUDITOR))
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_update_country_with_stale_version_conflicts(client, unique_iso3):
    payload = {"iso3": unique_iso3, "iso2": unique_iso3[:2], "name": "Versioned Country"}
    created = (await client.post("/countries", json=payload, headers=_auth_headers())).json()

    ok = await client.patch(
        f"/countries/{unique_iso3}", json={"version": created["version"], "name": "Renamed"}, headers=_auth_headers()
    )
    assert ok.status_code == 200

    stale = await client.patch(
        f"/countries/{unique_iso3}",
        json={"version": created["version"], "name": "Renamed Again"},
        headers=_auth_headers(),
    )
    assert stale.status_code == 409


@pytest.mark.asyncio
async def test_fully_verified_country_reports_verified_status(client, unique_iso3):
    payload = {
        "iso3": unique_iso3,
        "iso2": unique_iso3[:2],
        "name": "Verified Country",
        "standard_lead_time_hours": 48,
        "lead_time_source": "AIP ENR 1.1",
        "lead_time_verified_by": "J. Ops",
        "lead_time_verified_on": "2026-01-01",
        "permit_flags_source": "CAA email",
        "permit_flags_verified_by": "J. Ops",
        "permit_flags_verified_on": "2026-01-01",
    }
    resp = await client.post("/countries", json=payload, headers=_auth_headers())
    assert resp.status_code == 201
    body = resp.json()
    assert body["reference_status"] == "VERIFIED"
    assert body["effective_lead_time_hours"] == 48
    assert body["effective_lead_time_is_fallback"] is False
