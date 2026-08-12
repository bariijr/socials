import enum
from datetime import date

from sqlalchemy import Date, Float, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import StandardMixin


class PermitFeeType(str, enum.Enum):
    OVERFLIGHT = "OVERFLIGHT"
    LANDING = "LANDING"
    GROUND_HANDLING = "GROUND_HANDLING"


class PermitFeeCategory(str, enum.Enum):
    # "CAA Fees" and "nafisat" from the original FIQ spec (fiq.png's
    # OUTPUT-1 cost table) — two distinct government/regional fee systems,
    # separate from the ANS overflight nav fee already covered by
    # NavFeeProvider. nafisat is a specific AFI-region fee system that only
    # applies to some countries; CAA_FEE is the country's own permit-filing
    # fee. Same table/formula machinery for both — only the category tag
    # (and which countries have a row) differs.
    CAA_FEE = "CAA_FEE"
    NAFISAT = "NAFISAT"


class PermitFeeProvider(Base, StandardMixin):
    """One fee schedule per (country, permit type, fee category). Reuses
    the exact formula/min/max/VAT machinery already built for NavFeeProvider
    (app.domain.nav_fees) — only the lookup key differs: nav fees are keyed
    by FIR (a per-FIR-crossing distance charge), these are keyed by country
    + permit type (a per-permit-line-item charge), matching how CAA/nafisat
    fees are actually billed. Same provenance triple as every other
    reference table here — a row with no source/verified_by/verified_on is
    UNVERIFIED, and no row at all means NO_PROVIDER_CONFIGURED (never a
    guessed number); see app.domain.reference_status.resolve_nav_fee_provider_status,
    reused here since the status logic is identical.
    """

    __tablename__ = "permit_fee_providers"
    __table_args__ = (
        UniqueConstraint("country_iso3", "permit_type", "fee_category", name="uq_permit_fee_provider_country_type_category"),
    )

    country_iso3: Mapped[str] = mapped_column(String(3), ForeignKey("countries.iso3"), nullable=False, index=True)
    permit_type: Mapped[str] = mapped_column(String(20), nullable=False)
    fee_category: Mapped[str] = mapped_column(String(20), nullable=False)
    provider_name: Mapped[str] = mapped_column(String(200), nullable=False)

    formula: Mapped[str] = mapped_column(String(30), nullable=False)
    base_rate: Mapped[float] = mapped_column(Float, nullable=False)
    minimum_fee: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    maximum_fee: Mapped[float | None] = mapped_column(Float, nullable=True)
    vat_rate: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="USD")

    source: Mapped[str | None] = mapped_column(String(500), nullable=True)
    verified_by: Mapped[str | None] = mapped_column(String(200), nullable=True)
    verified_on: Mapped[date | None] = mapped_column(Date, nullable=True)
