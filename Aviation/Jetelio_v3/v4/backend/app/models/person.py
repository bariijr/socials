import enum
from datetime import date

from sqlalchemy import Date, Enum, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import StandardMixin


class PersonRoleHint(str, enum.Enum):
    CREW = "CREW"
    PAX = "PAX"
    BOTH = "BOTH"


class Person(Base, StandardMixin):
    """A reusable crew/pax record — e.g. a pilot who flies for the same
    operator repeatedly, so their passport/nationality don't need
    re-entering every trip. Independent of Trip: TripLeg's own `persons`
    JSON column stays exactly as it is (a point-in-time snapshot per leg,
    per the snapshot-not-live-reference principle already established for
    Trip/TripLeg aircraft fields) — this table does not replace it, it's an
    optional CRM-style lookup an operator's crew can be pre-registered in.
    """

    __tablename__ = "persons"

    party_id: Mapped[UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("parties.id"), nullable=True, index=True)

    full_name: Mapped[str] = mapped_column(String(300), nullable=False)
    date_of_birth: Mapped[date | None] = mapped_column(Date, nullable=True)
    nationality_iso3: Mapped[str | None] = mapped_column(String(3), ForeignKey("countries.iso3"), nullable=True)
    role_hint: Mapped[PersonRoleHint] = mapped_column(Enum(PersonRoleHint, name="person_role_hint"), nullable=False, default=PersonRoleHint.BOTH)

    email: Mapped[str | None] = mapped_column(String(300), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    passport_number: Mapped[str | None] = mapped_column(String(50), nullable=True)
    passport_expiry: Mapped[date | None] = mapped_column(Date, nullable=True)
    notes: Mapped[str | None] = mapped_column(String(500), nullable=True)
