import enum
from datetime import date

from sqlalchemy import Boolean, Date, Enum, Float, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import StandardMixin, TimestampMixin, VersionMixin


class AircraftStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    GROUNDED = "GROUNDED"
    ARCHIVED = "ARCHIVED"


class Aircraft(Base, StandardMixin):
    """operator_id is NOT NULL — aircraft with no operator are quarantined
    during import rather than admitted with a dangling reference.
    registration is UNIQUE — duplicates are quarantined, not merged.
    """

    __tablename__ = "aircraft"
    __table_args__ = ()

    registration: Mapped[str] = mapped_column(String(20), nullable=False, unique=True)
    icao_type: Mapped[str] = mapped_column(String(10), ForeignKey("aircraft_performance.icao_type"), nullable=False)
    manufacturer: Mapped[str | None] = mapped_column(String(200), nullable=True)
    model_series: Mapped[str | None] = mapped_column(String(200), nullable=True)
    serial_number: Mapped[str | None] = mapped_column(String(100), nullable=True)
    colors: Mapped[str | None] = mapped_column(String(200), nullable=True)
    # Registration country — distinct from the operator's own country.
    nationality_iso3: Mapped[str | None] = mapped_column(String(3), ForeignKey("countries.iso3"), nullable=True)
    # Trip.aircraft_registration/TripLeg.call_sign snapshot from this at
    # trip-creation time; a leg can still override it (see TripLeg.call_sign).
    default_callsign: Mapped[str | None] = mapped_column(String(20), nullable=True)
    home_base_icao: Mapped[str | None] = mapped_column(String(4), nullable=True)
    mtow_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    max_pax: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Task #119 — free-text, admin-entered (e.g. "Private - Non Revenue").
    # Not an enum: real-world phrasing varies more than a fixed set would
    # cleanly capture, matching this project's existing convention for
    # similar display-string fields (e.g. NavFeeProvider.provider_name).
    classification: Mapped[str | None] = mapped_column(String(100), nullable=True)

    operator_id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("operators.id"), nullable=False)

    cofa_expiry: Mapped[date | None] = mapped_column(Date, nullable=True)
    insurance_expiry: Mapped[date | None] = mapped_column(Date, nullable=True)
    total_hours: Mapped[float | None] = mapped_column(Float, nullable=True)
    total_landings: Mapped[int | None] = mapped_column(Integer, nullable=True)

    status: Mapped[AircraftStatus] = mapped_column(
        Enum(AircraftStatus, name="aircraft_status"), nullable=False, default=AircraftStatus.ACTIVE
    )

    quarantined: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    quarantine_reason: Mapped[str | None] = mapped_column(String(300), nullable=True)


class AircraftPerformance(Base, TimestampMixin, VersionMixin):
    """icao_type PK — one performance record per type designator.

    planning_status is COMPUTED: APPROVED FOR PLANNING only when
    verified = YES and both verified_by and verified_on are present,
    otherwise ADVISORY ONLY - NOT FOR PLANNING (see
    app.domain.reference_status). Published figures ignore payload,
    temperature, altitude, wind and operator procedure — this table is
    advisory input to Engine 3, never a substitute for AFM figures.
    """

    __tablename__ = "aircraft_performance"

    icao_type: Mapped[str] = mapped_column(String(10), primary_key=True)
    manufacturer: Mapped[str | None] = mapped_column(String(200), nullable=True)
    model_series: Mapped[str | None] = mapped_column(String(200), nullable=True)

    max_range_nm: Mapped[float | None] = mapped_column(Float, nullable=True)
    cruise_tas_kts: Mapped[float | None] = mapped_column(Float, nullable=True)
    fuel_burn_kg_per_hr: Mapped[float | None] = mapped_column(Float, nullable=True)
    max_pax: Mapped[int | None] = mapped_column(Integer, nullable=True)
    mtow_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    service_ceiling_ft: Mapped[float | None] = mapped_column(Float, nullable=True)

    reserve_safety_margin: Mapped[float | None] = mapped_column(Float, nullable=True)

    source: Mapped[str | None] = mapped_column(String(500), nullable=True)
    verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    verified_by: Mapped[str | None] = mapped_column(String(200), nullable=True)
    verified_on: Mapped[date | None] = mapped_column(Date, nullable=True)

    def __repr__(self) -> str:  # pragma: no cover
        return f"<AircraftPerformance {self.icao_type}>"
