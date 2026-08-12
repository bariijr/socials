import enum
from datetime import date

from sqlalchemy import Date, Enum, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import StandardMixin


class VisaRequirement(str, enum.Enum):
    NOT_REQUIRED = "NOT_REQUIRED"
    REQUIRED = "REQUIRED"
    VISA_ON_ARRIVAL = "VISA_ON_ARRIVAL"
    EVISA = "EVISA"
    TRANSIT_ONLY = "TRANSIT_ONLY"
    TIWB = "TIWB"


class VisaMatrixCell(Base, StandardMixin):
    """The base grid: 142 in-region states x 174 nationalities. Ships
    DELIBERATELY EMPTY rather than pre-filled from a public tourist-visa
    dataset — a wrong NOT_REQUIRED here is an operational failure. Blank
    (no row) resolves to NOT ON FILE at read time, never a default.
    """

    __tablename__ = "visa_matrix"
    __table_args__ = (UniqueConstraint("country_iso3", "nationality_iso3", name="uq_visa_matrix_cell"),)

    country_iso3: Mapped[str] = mapped_column(String(3), ForeignKey("countries.iso3"), nullable=False, index=True)
    nationality_iso3: Mapped[str] = mapped_column(String(3), nullable=False, index=True)
    requirement: Mapped[VisaRequirement] = mapped_column(
        Enum(VisaRequirement, name="visa_matrix_requirement"), nullable=False
    )
    visa_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    lead_time_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_stay_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    conditions: Mapped[str | None] = mapped_column(String(1000), nullable=True)

    source: Mapped[str | None] = mapped_column(String(500), nullable=True)
    verified_by: Mapped[str | None] = mapped_column(String(200), nullable=True)
    verified_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    expires_on: Mapped[date | None] = mapped_column(Date, nullable=True)


class VisaRule(Base, StandardMixin):
    """The override layer, resolved BEFORE the matrix cell. Precedence:
    airport-specific override (airport_icao set) -> exact
    (country, nationality) rule (airport_icao null) -> matrix cell ->
    NOT ON FILE. Never guessed, never defaulted to NOT REQUIRED.
    """

    __tablename__ = "visa_rules"

    country_iso3: Mapped[str] = mapped_column(String(3), ForeignKey("countries.iso3"), nullable=False, index=True)
    nationality_iso3: Mapped[str] = mapped_column(String(3), nullable=False, index=True)
    airport_icao: Mapped[str | None] = mapped_column(
        String(4), ForeignKey("airports.icao"), nullable=True, index=True
    )

    requirement: Mapped[VisaRequirement] = mapped_column(
        Enum(VisaRequirement, name="visa_rule_requirement"), nullable=False
    )
    visa_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    lead_time_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_stay_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    conditions: Mapped[str | None] = mapped_column(String(1000), nullable=True)

    source: Mapped[str | None] = mapped_column(String(500), nullable=True)
    verified_by: Mapped[str | None] = mapped_column(String(200), nullable=True)
    verified_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    expires_on: Mapped[date | None] = mapped_column(Date, nullable=True)
