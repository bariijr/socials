import enum

from sqlalchemy import Enum, ForeignKey, Index, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import StandardMixin
from app.models.service_delivery import DeliveryChannel


class ServiceMessageDirection(str, enum.Enum):
    OUTBOUND = "OUTBOUND"
    INBOUND = "INBOUND"
    MANUAL_NOTE = "MANUAL_NOTE"


class ServiceMessage(Base, StandardMixin):
    """The comms log/thread behind one service-assignment line item (task
    #102). Keyed loosely by (leg_id, service_code, icao) — the exact same
    composite key TripLeg.service_assignments already uses (see
    app.models.trip) — not a hard FK to a nonexistent assignment row, since
    an assignment is a JSONB dict entry, not its own table.

    OUTBOUND = a formatted request actually sent (task #104). INBOUND = a
    reply, either IMAP-matched (task #103) or hand-entered. MANUAL_NOTE = a
    free-text status update with no channel ("permit will be ready in
    72hrs") — the ops equivalent of a sticky note on the file, not a sent
    message.
    """

    __tablename__ = "service_messages"

    leg_id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("trip_legs.id", ondelete="CASCADE"), nullable=False)
    service_code: Mapped[str] = mapped_column(String(20), nullable=False)
    icao: Mapped[str] = mapped_column(String(4), nullable=False)

    direction: Mapped[ServiceMessageDirection] = mapped_column(
        Enum(ServiceMessageDirection, name="service_message_direction"), nullable=False
    )
    # None only for MANUAL_NOTE rows — every OUTBOUND/INBOUND message went
    # out/came in over a real channel.
    channel: Mapped[DeliveryChannel | None] = mapped_column(Enum(DeliveryChannel, name="delivery_channel"), nullable=True)
    subject: Mapped[str | None] = mapped_column(String(300), nullable=True)
    body: Mapped[str] = mapped_column(Text, nullable=False)

    # No FK to users.id — matches AuditLog.actor_user_id / Trip.created_by's
    # existing pattern (a JWT-carried user id is valid by virtue of login
    # issuance, not by referencing a live row).
    sent_by_user_id: Mapped[UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    sent_by_name: Mapped[str | None] = mapped_column(String(200), nullable=True)

    __table_args__ = (Index("ix_service_messages_leg_service_icao", "leg_id", "service_code", "icao"),)
