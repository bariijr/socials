import enum
from datetime import date

from sqlalchemy import Boolean, Date, Enum, Float, String, text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import SoftDeleteMixin, TimestampMixin, VersionMixin


class GroundHandlingPolicy(str, enum.Enum):
    MANDATORY = "MANDATORY"
    NOT_MANDATORY = "NOT_MANDATORY"
    SELF_HANDLING_PERMITTED = "SELF_HANDLING_PERMITTED"
    VERIFY = "VERIFY"


class PermitValidityUnit(str, enum.Enum):
    HOURS = "HOURS"
    DAYS = "DAYS"
    WEEKS = "WEEKS"
    MONTHS = "MONTHS"


class Country(Base, TimestampMixin, VersionMixin, SoftDeleteMixin):
    """One row per ISO3 state. iso3 is the natural PK — see the display
    convention: country NAMES are shown to humans everywhere, ISO3 is a
    technical key only (API + DB).

    Every operationally significant field carries provenance (source,
    verified_by, verified_on) per the verification contract. Presence of a
    value is not verification — reference_status is computed from these
    columns, never typed (see app.domain.reference_status).
    """

    __tablename__ = "countries"

    iso3: Mapped[str] = mapped_column(String(3), primary_key=True)
    # Nullable: a handful of workbook rows (broader visa-matrix
    # nationalities outside the core operating region) carry iso3 + name
    # only. iso3 is the key everywhere in this schema; iso2 is supplementary.
    iso2: Mapped[str | None] = mapped_column(String(2), nullable=True, unique=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    calling_code: Mapped[str | None] = mapped_column(String(10), nullable=True)
    caa_name: Mapped[str | None] = mapped_column(String(300), nullable=True)
    region: Mapped[str | None] = mapped_column(String(100), nullable=True)

    overflight_permit_required: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))
    landing_permit_required: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))
    permit_flags_source: Mapped[str | None] = mapped_column(String(500), nullable=True)
    permit_flags_verified_by: Mapped[str | None] = mapped_column(String(200), nullable=True)
    permit_flags_verified_on: Mapped[date | None] = mapped_column(Date, nullable=True)

    # standard_lead_time_hours is the VERIFIED value only. Leave null until
    # sourced — the fallback to settings.default_permit_lead_time_hours and
    # the "UNVERIFIED - USING FALLBACK" status are computed, never stored.
    standard_lead_time_hours: Mapped[float | None] = mapped_column(Float, nullable=True)
    lead_time_source: Mapped[str | None] = mapped_column(String(500), nullable=True)
    lead_time_verified_by: Mapped[str | None] = mapped_column(String(200), nullable=True)
    lead_time_verified_on: Mapped[date | None] = mapped_column(Date, nullable=True)

    # permit_validity_* is a DISTINCT concept from lead time above: lead time
    # is how far in advance a permit must be filed (backward from the leg's
    # reference_datetime); validity is how long a GRANTED permit stays good
    # for once issued (forward from granted_at). Same verified-only-until-
    # sourced discipline — leave null until an admin enters a real value,
    # never guess a number. See app.domain.permits.compute_valid_until.
    permit_validity_amount: Mapped[float | None] = mapped_column(Float, nullable=True)
    permit_validity_unit: Mapped[PermitValidityUnit | None] = mapped_column(
        Enum(PermitValidityUnit, name="permit_validity_unit"), nullable=True
    )
    permit_validity_source: Mapped[str | None] = mapped_column(String(500), nullable=True)
    permit_validity_verified_by: Mapped[str | None] = mapped_column(String(200), nullable=True)
    permit_validity_verified_on: Mapped[date | None] = mapped_column(Date, nullable=True)

    ground_handling_policy: Mapped[GroundHandlingPolicy] = mapped_column(
        Enum(GroundHandlingPolicy, name="ground_handling_policy"),
        nullable=False,
        server_default=GroundHandlingPolicy.VERIFY.value,
    )
    ground_handling_source: Mapped[str | None] = mapped_column(String(500), nullable=True)
    ground_handling_verified_by: Mapped[str | None] = mapped_column(String(200), nullable=True)
    ground_handling_verified_on: Mapped[date | None] = mapped_column(Date, nullable=True)

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Country {self.iso3} {self.name!r}>"
