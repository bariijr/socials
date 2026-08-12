from datetime import date

from sqlalchemy import ARRAY, Boolean, Date, ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import StandardMixin


class CountryRequirement(Base, StandardMixin):
    """What a state demands per request type: forms, supporting documents,
    lead time, authority hours, accepted channels, fee structure, whether a
    local agent or direct CAA account is required, and known quirks. This
    is the institutional knowledge currently in people's heads — versioned
    and sourced.
    """

    __tablename__ = "country_requirements"

    source_ref: Mapped[str | None] = mapped_column(String(50), nullable=True, unique=True)
    country_iso3: Mapped[str] = mapped_column(String(3), ForeignKey("countries.iso3"), nullable=False, index=True)
    request_type: Mapped[str] = mapped_column(String(100), nullable=False)

    required_forms: Mapped[list[str] | None] = mapped_column(ARRAY(String), nullable=True)
    required_documents: Mapped[list[str] | None] = mapped_column(ARRAY(String), nullable=True)
    lead_time_hours: Mapped[float | None] = mapped_column(nullable=True)
    authority_working_hours: Mapped[str | None] = mapped_column(String(200), nullable=True)
    accepted_channels: Mapped[list[str] | None] = mapped_column(ARRAY(String), nullable=True)
    fee_structure: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    local_agent_required: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    direct_caa_account_possible: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    known_quirks: Mapped[str | None] = mapped_column(String(2000), nullable=True)

    source: Mapped[str | None] = mapped_column(String(500), nullable=True)
    verified_by: Mapped[str | None] = mapped_column(String(200), nullable=True)
    verified_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    review_due: Mapped[date | None] = mapped_column(Date, nullable=True)
