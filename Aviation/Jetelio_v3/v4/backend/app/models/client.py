from sqlalchemy import ARRAY, Enum, ForeignKey, Integer, Sequence, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import StandardMixin
from app.models.messaging import MessageFormat, MessagingChannel

# Registered on Base.metadata (not tied to a column's server_default) purely
# so both Alembic and tests/integration/conftest.py's create_all()/
# drop_all() create and clean it up — the actual nextval() call happens
# explicitly in app.core.billing_ref.next_billing_ref.
clients_billing_ref_seq = Sequence("clients_billing_ref_seq", metadata=Base.metadata)


class Client(Base, StandardMixin):
    """A billing entity. An operator has MANY billing entities; a trip and
    each individual leg may point at a different one (see T7).
    """

    __tablename__ = "clients"

    source_ref: Mapped[str | None] = mapped_column(String(50), nullable=True, unique=True)
    # Assigned once at creation from clients_billing_ref_seq, formatted
    # CLI-000123 — see client_service.create_client/app.core.billing_ref.
    # Never re-derived or user-editable; it's the number this client is
    # billed/referenced under.
    billing_ref: Mapped[str] = mapped_column(String(20), nullable=False, unique=True)

    operator_id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("operators.id"), nullable=False)

    bill_to_legal_name: Mapped[str] = mapped_column(String(300), nullable=False)
    address: Mapped[str | None] = mapped_column(String(500), nullable=True)
    tax_vat_number: Mapped[str | None] = mapped_column(String(100), nullable=True)
    billing_contact_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    billing_contact_email: Mapped[str | None] = mapped_column(String(300), nullable=True)

    currency: Mapped[str | None] = mapped_column(String(3), nullable=True)
    payment_terms: Mapped[str | None] = mapped_column(String(200), nullable=True)
    credit_limit_minor_units: Mapped[int | None] = mapped_column(Integer, nullable=True)

    preferred_channel: Mapped[MessagingChannel | None] = mapped_column(
        Enum(MessagingChannel, name="client_preferred_channel"), nullable=True
    )
    messaging_to: Mapped[list[str] | None] = mapped_column(ARRAY(String), nullable=True)
    messaging_cc: Mapped[list[str] | None] = mapped_column(ARRAY(String), nullable=True)
    sita_address: Mapped[str | None] = mapped_column(String(20), nullable=True)
    aftn_address: Mapped[str | None] = mapped_column(String(20), nullable=True)
    message_format: Mapped[MessageFormat | None] = mapped_column(
        Enum(MessageFormat, name="client_message_format"), nullable=True
    )
    sending_team_signature: Mapped[str | None] = mapped_column(String(500), nullable=True)
