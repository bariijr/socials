import enum

from sqlalchemy import ARRAY, Enum, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import StandardMixin
from app.models.messaging import MessageFormat, MessagingChannel


class OperatorStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    SUSPENDED = "SUSPENDED"
    ARCHIVED = "ARCHIVED"


class Operator(Base, StandardMixin):
    """assignable is COMPUTED (BLOCKED - OPERATOR NAME REQUIRED whenever
    name is blank), never stored — see app.domain.reference_status.
    A blank/placeholder name (migrated from the 44 unnamed workbook rows)
    is represented as NULL, not an empty string, so the computation is
    unambiguous.
    """

    __tablename__ = "operators"

    # The workbook's operator_id (e.g. 'OPR-001'), kept only so the
    # importer can upsert idempotently on re-run. Never used as a key
    # anywhere else — the UUID id is authoritative.
    source_ref: Mapped[str | None] = mapped_column(String(50), nullable=True, unique=True)

    name: Mapped[str | None] = mapped_column(String(300), nullable=True)
    aoc_number: Mapped[str | None] = mapped_column(String(100), nullable=True)
    icao_designator: Mapped[str | None] = mapped_column(String(10), nullable=True)
    iata_designator: Mapped[str | None] = mapped_column(String(10), nullable=True)
    home_base_icao: Mapped[str | None] = mapped_column(String(4), nullable=True)

    contact_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    contact_phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    occ_email: Mapped[str | None] = mapped_column(String(300), nullable=True)
    billing_email: Mapped[str | None] = mapped_column(String(300), nullable=True)

    currency: Mapped[str | None] = mapped_column(String(3), nullable=True)
    tax_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    credit_limit_minor_units: Mapped[int | None] = mapped_column(nullable=True)

    status: Mapped[OperatorStatus] = mapped_column(
        Enum(OperatorStatus, name="operator_status"), nullable=False, default=OperatorStatus.ACTIVE
    )

    # Messaging preference (shared shape — see models/messaging.py)
    preferred_channel: Mapped[MessagingChannel | None] = mapped_column(
        Enum(MessagingChannel, name="operator_preferred_channel"), nullable=True
    )
    messaging_to: Mapped[list[str] | None] = mapped_column(ARRAY(String), nullable=True)
    messaging_cc: Mapped[list[str] | None] = mapped_column(ARRAY(String), nullable=True)
    sita_address: Mapped[str | None] = mapped_column(String(20), nullable=True)
    aftn_address: Mapped[str | None] = mapped_column(String(20), nullable=True)
    message_format: Mapped[MessageFormat | None] = mapped_column(
        Enum(MessageFormat, name="operator_message_format"), nullable=True
    )
    sending_team_signature: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # Migration provenance — quarantined rows (44 unnamed operators) are
    # flagged rather than silently dropped, per the migration-defects fix.
    quarantined: Mapped[bool] = mapped_column(nullable=False, default=False)
    quarantine_reason: Mapped[str | None] = mapped_column(String(300), nullable=True)
