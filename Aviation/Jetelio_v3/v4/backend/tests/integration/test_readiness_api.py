import pytest


@pytest.mark.asyncio
async def test_pilot_exit_gates_endpoint_returns_nine_gates_and_pilot_verdict_on_empty_db(client):
    """T14: with every gate blocked (starting condition on an empty DB),
    the endpoint reports PILOT mode.
    """
    resp = await client.get("/readiness/pilot-exit-gates")
    assert resp.status_code == 200
    body = resp.json()
    assert body["total_gate_count"] == 9
    assert len(body["gates"]) == 9
    assert body["verdict"] == "PILOT"
    assert body["allow_unverified_for_planning"] is False


@pytest.mark.asyncio
async def test_data_readiness_endpoint_returns_rows(client):
    resp = await client.get("/readiness/data-readiness")
    assert resp.status_code == 200
    rows = resp.json()
    assert len(rows) >= 9
    assert all("dataset" in row and "percent_complete" in row for row in rows)
