from datetime import date

from sqlalchemy import Boolean, Date, Float, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import StandardMixin


class NavFeeProvider(Base, StandardMixin):
    """One ANS (air navigation service) fee schedule per FIR. Every rate
    ships as reference data with the same source/verified_by/verified_on
    provenance triple as country_requirements — presence of a row is never
    treated as verification; app.domain.reference_status.
    resolve_nav_fee_provider_status computes the displayed status from
    those three fields, not from a stored flag.
    """

    __tablename__ = "nav_fee_providers"

    fir_code: Mapped[str] = mapped_column(String(10), nullable=False, unique=True, index=True)
    provider_name: Mapped[str] = mapped_column(String(200), nullable=False)
    country: Mapped[str | None] = mapped_column(String(200), nullable=True)

    formula: Mapped[str] = mapped_column(String(30), nullable=False)
    base_rate: Mapped[float] = mapped_column(Float, nullable=False)
    minimum_fee: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    maximum_fee: Mapped[float | None] = mapped_column(Float, nullable=True)
    vat_rate: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    applies_50km_deduction: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="USD")

    source: Mapped[str | None] = mapped_column(String(500), nullable=True)
    verified_by: Mapped[str | None] = mapped_column(String(200), nullable=True)
    verified_on: Mapped[date | None] = mapped_column(Date, nullable=True)
