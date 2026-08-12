"""PNR PDF download (task #82) — reuses test_trips_api.py's trip-creation
fixtures rather than re-deriving a full geo+aircraft+route setup.
"""

import pytest

from tests.integration.test_trips_api import _auth_headers, _create_payload, trip_leg_fixture  # noqa: F401


class TestDownloadPnr:
    @pytest.mark.asyncio
    async def test_download_returns_a_pdf(self, client, trip_leg_fixture):
        headers = _auth_headers()
        create = await client.post("/trips", headers=headers, json=_create_payload(trip_leg_fixture))
        assert create.status_code == 201, create.text
        trip_id = create.json()["id"]

        resp = await client.get(f"/trips/{trip_id}/pnr.pdf", headers=headers)
        assert resp.status_code == 200, resp.text
        assert resp.headers["content-type"] == "application/pdf"
        assert resp.content.startswith(b"%PDF")
        assert len(resp.content) > 500

    @pytest.mark.asyncio
    async def test_download_requires_auth(self, client, trip_leg_fixture):
        headers = _auth_headers()
        create = await client.post("/trips", headers=headers, json=_create_payload(trip_leg_fixture))
        trip_id = create.json()["id"]

        resp = await client.get(f"/trips/{trip_id}/pnr.pdf")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_download_unknown_trip_404s(self, client):
        headers = _auth_headers()
        resp = await client.get("/trips/00000000-0000-0000-0000-000000000000/pnr.pdf", headers=headers)
        assert resp.status_code == 404
