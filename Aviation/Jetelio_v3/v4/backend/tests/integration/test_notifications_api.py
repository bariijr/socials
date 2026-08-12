import uuid

import pytest

from app.core.security import create_access_token
from app.models.notification import Notification
from app.models.user import UserRole


def _auth_headers(role: UserRole = UserRole.SUPER_ADMIN) -> dict[str, str]:
    token = create_access_token(str(uuid.uuid4()), role.value, extra={"email": "test@example.com"})
    return {"Authorization": f"Bearer {token}"}


class TestNotifications:
    @pytest.mark.asyncio
    async def test_list_and_unseen_filter(self, client, session):
        headers = _auth_headers()
        entity_id = str(uuid.uuid4())
        session.add(Notification(entity_type="Trip", entity_id=entity_id, kind="NEW_ENQUIRY", message="Test notification"))
        await session.commit()

        listing = await client.get("/notifications?page_size=200", headers=headers)
        assert listing.status_code == 200
        assert any(n["entity_id"] == entity_id for n in listing.json()["items"])

        unseen = await client.get("/notifications?unseen=true&page_size=200", headers=headers)
        assert unseen.status_code == 200
        assert any(n["entity_id"] == entity_id for n in unseen.json()["items"])

    @pytest.mark.asyncio
    async def test_mark_seen_removes_from_unseen_filter(self, client, session):
        headers = _auth_headers()
        entity_id = str(uuid.uuid4())
        notification = Notification(entity_type="Trip", entity_id=entity_id, kind="NEW_ENQUIRY", message="Test notification")
        session.add(notification)
        await session.commit()

        resp = await client.post(f"/notifications/{notification.id}/seen", headers=headers)
        assert resp.status_code == 200, resp.text
        assert resp.json()["seen_at"] is not None

        unseen = await client.get("/notifications?unseen=true&page_size=200", headers=headers)
        assert not any(n["entity_id"] == entity_id for n in unseen.json()["items"])

    @pytest.mark.asyncio
    async def test_mark_all_seen(self, client, session):
        headers = _auth_headers()
        marker = str(uuid.uuid4())
        session.add_all(
            [
                Notification(entity_type="Trip", entity_id=marker, kind="NEW_ENQUIRY", message="A"),
                Notification(entity_type="Trip", entity_id=marker, kind="NEW_ENQUIRY", message="B"),
            ]
        )
        await session.commit()

        resp = await client.post("/notifications/mark-all-seen", headers=headers)
        assert resp.status_code == 200, resp.text
        assert resp.json()["marked"] >= 2

        unseen = await client.get("/notifications?unseen=true&page_size=200", headers=headers)
        assert not any(n["entity_id"] == marker for n in unseen.json()["items"])
