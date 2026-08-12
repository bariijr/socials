import enum
from datetime import date

from sqlalchemy import ARRAY, Boolean, Date, Enum, ForeignKey, Integer, Sequence, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import StandardMixin
from app.models.messaging import MessageFormat, MessagingChannel

# See app.models.client.clients_billing_ref_seq for why this is registered
# as a standalone Sequence rather than a column server_default.
vendors_billing_ref_seq = Sequence("vendors_billing_ref_seq", metadata=Base.metadata)


class VendorCapabilityStatus(str, enum.Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    EXPIRED = "EXPIRED"


class Vendor(Base, StandardMixin):
    """Assignable only once questionnaire capability_status is APPROVED
    (see the pilot-exit gate: vendors with an approved questionnaire).
    """

    __tablename__ = "vendors"

    source_ref: Mapped[str | None] = mapped_column(String(50), nullable=True, unique=True)
    # Assigned once at creation from vendors_billing_ref_seq, formatted
    # VEN-000123 — see vendor_service.create_vendor/app.core.billing_ref.
    billing_ref: Mapped[str] = mapped_column(String(20), nullable=False, unique=True)

    name: Mapped[str] = mapped_column(String(300), nullable=False)
    service_scope: Mapped[list[str] | None] = mapped_column(ARRAY(String), nullable=True)

    preferred_channel: Mapped[MessagingChannel | None] = mapped_column(
        Enum(MessagingChannel, name="vendor_preferred_channel"), nullable=True
    )
    messaging_to: Mapped[list[str] | None] = mapped_column(ARRAY(String), nullable=True)
    messaging_cc: Mapped[list[str] | None] = mapped_column(ARRAY(String), nullable=True)
    sita_address: Mapped[str | None] = mapped_column(String(20), nullable=True)
    aftn_address: Mapped[str | None] = mapped_column(String(20), nullable=True)
    message_format: Mapped[MessageFormat | None] = mapped_column(
        Enum(MessageFormat, name="vendor_message_format"), nullable=True
    )
    sending_team_signature: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # Capability questionnaire
    questionnaire_sent_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    questionnaire_returned_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    questionnaire_answers: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    capability_status: Mapped[VendorCapabilityStatus] = mapped_column(
        Enum(VendorCapabilityStatus, name="vendor_capability_status"),
        nullable=False,
        default=VendorCapabilityStatus.PENDING,
    )
    approved_by: Mapped[str | None] = mapped_column(String(200), nullable=True)
    approved_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    preference_rank: Mapped[int | None] = mapped_column(Integer, nullable=True)


class VendorCoverageAirport(Base, StandardMixin):
    __tablename__ = "vendor_coverage_airports"

    source_ref: Mapped[str | None] = mapped_column(String(50), nullable=True, unique=True)
    vendor_id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("vendors.id"), nullable=False)
    icao: Mapped[str] = mapped_column(String(4), ForeignKey("airports.icao"), nullable=False, index=True)
    is_primary_handler: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    fbo_name: Mapped[str | None] = mapped_column(String(300), nullable=True)
    sita: Mapped[str | None] = mapped_column(String(20), nullable=True)
    aftn: Mapped[str | None] = mapped_column(String(20), nullable=True)
    vhf: Mapped[str | None] = mapped_column(String(50), nullable=True)
    contacts: Mapped[list[dict] | None] = mapped_column(JSONB, nullable=True)  # [{name, role, phone, email, hours}]


class VendorCoverageCountry(Base, StandardMixin):
    __tablename__ = "vendor_coverage_countries"

    source_ref: Mapped[str | None] = mapped_column(String(50), nullable=True, unique=True)
    vendor_id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("vendors.id"), nullable=False)
    country_iso3: Mapped[str] = mapped_column(String(3), ForeignKey("countries.iso3"), nullable=False, index=True)
    has_caa_direct_account: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    service_scope: Mapped[list[str] | None] = mapped_column(ARRAY(String), nullable=True)
