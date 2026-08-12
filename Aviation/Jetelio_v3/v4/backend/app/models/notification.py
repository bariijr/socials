from datetime import datetime

from sqlalchemy import DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import StandardMixin


class Notification(Base, StandardMixin):
    """Lightweight admin-panel notification (task #106) — e.g. "new public
    enquiry submitted". Polled by the admin nav badge (react-query
    refetchInterval), not pushed — this stack has no websocket/realtime
    infra and none was judged worth adding for a low-frequency admin
    signal. entity_type/entity_id let the frontend link straight to the
    thing the notification is about (e.g. "Trip", trip.id).
    """

    __tablename__ = "notifications"

    entity_type: Mapped[str] = mapped_column(String(100), nullable=False)
    entity_id: Mapped[str] = mapped_column(String(100), nullable=False)
    kind: Mapped[str] = mapped_column(String(100), nullable=False)
    message: Mapped[str] = mapped_column(String(1000), nullable=False)
    seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
