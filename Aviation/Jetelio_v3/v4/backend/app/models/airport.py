from datetime import date

from sqlalchemy import ARRAY, Boolean, Date, Float, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import SoftDeleteMixin, TimestampMixin, VersionMixin


class Airport(Base, TimestampMixin, VersionMixin, SoftDeleteMixin):
    """ICAO is the primary identifier everywhere; IATA is a secondary
    bracketed label only, never a key. country_iso3 references
    countries.iso3 (ISO3 is a key only — see Conventions).
    """

    __tablename__ = "airports"

    icao: Mapped[str] = mapped_column(String(4), primary_key=True)
    iata: Mapped[str | None] = mapped_column(String(3), nullable=True)
    name: Mapped[str] = mapped_column(String(300), nullable=False)
    city: Mapped[str | None] = mapped_column(String(200), nullable=True)
    # Nullable: the shipped airport list includes reference/comparison
    # ICAOs outside the 142-state core operating region covered by
    # `countries` (see spec's ROLE section). FK stays enforced whenever a
    # country IS resolved.
    country_iso3: Mapped[str | None] = mapped_column(String(3), ForeignKey("countries.iso3"), nullable=True, index=True)

    lat: Mapped[float] = mapped_column(Float, nullable=False)
    lon: Mapped[float] = mapped_column(Float, nullable=False)
    elevation_ft: Mapped[float | None] = mapped_column(Float, nullable=True)
    timezone: Mapped[str | None] = mapped_column(String(64), nullable=True)
    airport_type: Mapped[str | None] = mapped_column(String(50), nullable=True)

    is_airport_of_entry: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    ppr_required: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    curfew: Mapped[str | None] = mapped_column(String(300), nullable=True)

    longest_runway_ft: Mapped[float | None] = mapped_column(Float, nullable=True)
    runway_surface: Mapped[str | None] = mapped_column(String(100), nullable=True)

    fuel_grades: Mapped[list[str] | None] = mapped_column(ARRAY(String), nullable=True)
    operating_hours: Mapped[str | None] = mapped_column(String(200), nullable=True)
    handler_notes: Mapped[str | None] = mapped_column(String(1000), nullable=True)

    # Gate evidence: readiness sheet columns X/Y/AG + AW/AX
    ops_data_source: Mapped[str | None] = mapped_column(String(500), nullable=True)
    ops_data_verified_by: Mapped[str | None] = mapped_column(String(200), nullable=True)
    ops_data_verified_on: Mapped[date | None] = mapped_column(Date, nullable=True)

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Airport {self.icao} {self.name!r}>"
