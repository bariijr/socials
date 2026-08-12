import enum

from sqlalchemy import Enum, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import StandardMixin


class PartyRoleType(str, enum.Enum):
    OPERATOR = "OPERATOR"
    CLIENT = "CLIENT"
    VENDOR = "VENDOR"
    AGENT = "AGENT"
    WALK_IN = "WALK_IN"


class Party(Base, StandardMixin):
    """Core company/individual record — one row per real-world entity
    (Fireblade is one Party, not three). Deliberately additive/grouping,
    not a replacement of Operator/Client/Vendor: those tables keep every
    FK and service that already reads them untouched. A Party's own
    columns are just identity (name/country/contact) — the operational
    detail (credit limits, messaging preferences, fleet, questionnaires)
    stays on whichever role-specific table(s) a PartyRole row points at.
    """

    __tablename__ = "parties"

    name: Mapped[str] = mapped_column(String(300), nullable=False)
    legal_name: Mapped[str | None] = mapped_column(String(300), nullable=True)
    country_iso3: Mapped[str | None] = mapped_column(String(3), ForeignKey("countries.iso3"), nullable=True)
    address: Mapped[str | None] = mapped_column(String(500), nullable=True)
    contact_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    contact_email: Mapped[str | None] = mapped_column(String(300), nullable=True)
    contact_phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    notes: Mapped[str | None] = mapped_column(String(1000), nullable=True)


class PartyRole(Base, StandardMixin):
    """One row per role a Party holds. For OPERATOR/CLIENT/VENDOR, exactly
    one of operator_id/client_id/vendor_id points at the existing
    role-specific table (each is individually unique, so a given Operator/
    Client/Vendor row can belong to at most one Party — prevents the same
    legacy record being grouped under two different identities). AGENT and
    WALK_IN are genuinely new role types with no legacy table to point at;
    their (sparse) data lives directly on this row instead.
    """

    __tablename__ = "party_roles"
    __table_args__ = (
        UniqueConstraint("operator_id", name="uq_party_role_operator"),
        UniqueConstraint("client_id", name="uq_party_role_client"),
        UniqueConstraint("vendor_id", name="uq_party_role_vendor"),
    )

    party_id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("parties.id", ondelete="CASCADE"), nullable=False, index=True)
    role: Mapped[PartyRoleType] = mapped_column(Enum(PartyRoleType, name="party_role_type"), nullable=False)

    operator_id: Mapped[UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("operators.id"), nullable=True)
    client_id: Mapped[UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("clients.id"), nullable=True)
    vendor_id: Mapped[UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("vendors.id"), nullable=True)

    # AGENT/WALK_IN only — no backing table for those roles to hold this.
    credit_limit_minor_units: Mapped[int | None] = mapped_column(Integer, nullable=True)
    notes: Mapped[str | None] = mapped_column(String(500), nullable=True)
