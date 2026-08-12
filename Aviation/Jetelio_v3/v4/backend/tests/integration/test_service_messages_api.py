"""ServiceMessage comms log (task #102) — one thread per (leg, service_code,
icao), reuses test_trips_api.py's trip-creation fixtures for a real
leg/service pair rather than re-deriving a full geo+aircraft+route setup.
"""

import uuid

import pytest

from tests.integration.test_trips_api import _auth_headers, _create_payload, trip_leg_fixture  # noqa: F401


async def _create_trip_with_service(client, trip_leg_fixture, headers):
    created = (await client.post("/trips", headers=headers, json=_create_payload(trip_leg_fixture))).json()
    trip_id = created["id"]
    leg_id = created["legs"][0]["id"]
    service = created["legs"][0]["service_assignments"][0]
    return trip_id, leg_id, service["service_code"], service["icao"]


def _messages_url(trip_id, leg_id, service_code, icao, suffix: str = "") -> str:
    return f"/trips/{trip_id}/legs/{leg_id}/services/{service_code}/{icao}/messages{suffix}"


class TestServiceMessages:
    @pytest.mark.asyncio
    async def test_create_and_list_round_trip(self, client, trip_leg_fixture):
        headers = _auth_headers()
        trip_id, leg_id, service_code, icao = await _create_trip_with_service(client, trip_leg_fixture, headers)

        note = await client.post(
            _messages_url(trip_id, leg_id, service_code, icao),
            headers=headers,
            json={"direction": "MANUAL_NOTE", "body": "Permit will be ready in 72hrs"},
        )
        assert note.status_code == 201, note.text
        assert note.json()["channel"] is None
        assert note.json()["sent_by_name"] == "test@example.com"

        sent = await client.post(
            _messages_url(trip_id, leg_id, service_code, icao),
            headers=headers,
            json={"direction": "OUTBOUND", "channel": "EMAIL", "subject": "Overflight request", "body": "Please confirm."},
        )
        assert sent.status_code == 201, sent.text
        assert sent.json()["channel"] == "EMAIL"

        listing = await client.get(_messages_url(trip_id, leg_id, service_code, icao), headers=headers)
        assert listing.status_code == 200
        bodies = [m["body"] for m in listing.json()]
        assert bodies == ["Permit will be ready in 72hrs", "Please confirm."]

    @pytest.mark.asyncio
    async def test_delete_removes_from_list(self, client, trip_leg_fixture):
        headers = _auth_headers()
        trip_id, leg_id, service_code, icao = await _create_trip_with_service(client, trip_leg_fixture, headers)

        created = await client.post(
            _messages_url(trip_id, leg_id, service_code, icao),
            headers=headers,
            json={"direction": "MANUAL_NOTE", "body": "note"},
        )
        message = created.json()

        deleted = await client.delete(
            _messages_url(trip_id, leg_id, service_code, icao, f"/{message['id']}"),
            headers=headers,
            params={"version": message["version"]},
        )
        assert deleted.status_code == 204, deleted.text

        listing = await client.get(_messages_url(trip_id, leg_id, service_code, icao), headers=headers)
        assert listing.json() == []

    @pytest.mark.asyncio
    async def test_unknown_leg_404s(self, client, trip_leg_fixture):
        headers = _auth_headers()
        trip_id, _leg_id, service_code, icao = await _create_trip_with_service(client, trip_leg_fixture, headers)

        resp = await client.get(
            _messages_url(trip_id, "00000000-0000-0000-0000-000000000000", service_code, icao), headers=headers
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_leg_from_a_different_trip_404s(self, client, trip_leg_fixture):
        headers = _auth_headers()
        trip_id_a, leg_id_a, service_code, icao = await _create_trip_with_service(client, trip_leg_fixture, headers)
        trip_id_b, _leg_id_b, _sc_b, _icao_b = await _create_trip_with_service(client, trip_leg_fixture, headers)

        # leg_id_a genuinely exists, but not under trip_id_b — must still 404.
        resp = await client.get(_messages_url(trip_id_b, leg_id_a, service_code, icao), headers=headers)
        assert resp.status_code == 404
        assert trip_id_a != trip_id_b
