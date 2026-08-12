"""Person — a reusable crew/pax reference record (task #89). Independent of
Trip's own JSON-snapshot persons field, which is untouched by this build.
"""

import uuid

import pytest
import pytest_asyncio
from sqlalchemy import select

from app.core.security import create_access_token
from app.models.country import Country
from app.models.user import UserRole


def _auth_headers(role: UserRole = UserRole.SUPER_ADMIN) -> dict[str, str]:
    token = create_access_token(str(uuid.uuid4()), role.value, extra={"email": "test@example.com"})
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def a_real_country_iso3(session):
    # nationality_iso3 is a real FK to countries.iso3 — needs an existing
    # row, unlike draw_unique_iso3 (which deliberately draws a code
    # guaranteed *not* to collide with any existing one, for tests that
    # create their own new Country row).
    existing = (await session.execute(select(Country.iso3).limit(1))).scalar_one_or_none()
    if existing:
        return existing
    country = Country(iso3="ZZZ", name="Testland")
    session.add(country)
    await session.commit()
    return country.iso3


class TestPersonCrud:
    @pytest.mark.asyncio
    async def test_create_get_update_delete_round_trip(self, client, a_real_country_iso3):
        headers = _auth_headers()
        iso3 = a_real_country_iso3

        create = await client.post(
            "/persons", headers=headers,
            json={"full_name": "Jane Pilot", "nationality_iso3": iso3, "role_hint": "CREW", "passport_number": "P123456"},
        )
        assert create.status_code == 201, create.text
        person = create.json()
        assert person["full_name"] == "Jane Pilot"
        assert person["nationality_iso3"] == iso3

        get_resp = await client.get(f"/persons/{person['id']}", headers=headers)
        assert get_resp.status_code == 200

        update = await client.patch(
            f"/persons/{person['id']}", headers=headers, json={"version": person["version"], "phone": "+255700000000"}
        )
        assert update.status_code == 200
        assert update.json()["phone"] == "+255700000000"

        delete = await client.delete(f"/persons/{person['id']}?version={update.json()['version']}", headers=headers)
        assert delete.status_code == 204

        after = await client.get(f"/persons/{person['id']}", headers=headers)
        assert after.status_code == 404

    @pytest.mark.asyncio
    async def test_auditor_cannot_create_person(self, client):
        headers = _auth_headers(UserRole.AUDITOR)
        resp = await client.post("/persons", headers=headers, json={"full_name": "Blocked"})
        assert resp.status_code == 403
