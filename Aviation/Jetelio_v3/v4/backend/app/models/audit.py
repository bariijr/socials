from sqlalchemy import String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import TimestampMixin, UUIDPKMixin


class AuditLog(Base, UUIDPKMixin, TimestampMixin):
    """Every change is audited: actor, timestamp, entity, from, to, reason.
    Every permission denial is logged too, never silently swallowed.
    Append-only; nothing ever updates or deletes a row here.
    """

    __tablename__ = "audit_log"

    actor_user_id: Mapped[UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    actor_email: Mapped[str | None] = mapped_column(String(300), nullable=True)
    action: Mapped[str] = mapped_column(String(100), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(100), nullable=False)
    entity_id: Mapped[str] = mapped_column(String(100), nullable=False)
    from_value: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    to_value: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    reason: Mapped[str | None] = mapped_column(String(1000), nullable=True)
