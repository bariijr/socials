from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.country import GroundHandlingPolicy, PermitValidityUnit
from app.schemas.common import ORMModel


class CountryBase(BaseModel):
    iso2: str | None = Field(default=None, min_length=2, max_length=2)
    name: str
    calling_code: str | None = None
    caa_name: str | None = None
    region: str | None = None

    overflight_permit_required: bool = True
    landing_permit_required: bool = True
    permit_flags_source: str | None = None
    permit_flags_verified_by: str | None = None
    permit_flags_verified_on: date | None = None

    standard_lead_time_hours: float | None = None
    lead_time_source: str | None = None
    lead_time_verified_by: str | None = None
    lead_time_verified_on: date | None = None

    permit_validity_amount: float | None = None
    permit_validity_unit: PermitValidityUnit | None = None
    permit_validity_source: str | None = None
    permit_validity_verified_by: str | None = None
    permit_validity_verified_on: date | None = None

    ground_handling_policy: GroundHandlingPolicy = GroundHandlingPolicy.VERIFY
    ground_handling_source: str | None = None
    ground_handling_verified_by: str | None = None
    ground_handling_verified_on: date | None = None


class CountryCreate(CountryBase):
    iso3: str = Field(min_length=3, max_length=3)


class CountryUpdate(BaseModel):
    """Partial update. version is required for optimistic locking."""

    model_config = ConfigDict(extra="forbid")

    version: int
    iso2: str | None = None
    name: str | None = None
    calling_code: str | None = None
    caa_name: str | None = None
    region: str | None = None
    overflight_permit_required: bool | None = None
    landing_permit_required: bool | None = None
    permit_flags_source: str | None = None
    permit_flags_verified_by: str | None = None
    permit_flags_verified_on: date | None = None
    standard_lead_time_hours: float | None = None
    lead_time_source: str | None = None
    lead_time_verified_by: str | None = None
    lead_time_verified_on: date | None = None
    permit_validity_amount: float | None = None
    permit_validity_unit: PermitValidityUnit | None = None
    permit_validity_source: str | None = None
    permit_validity_verified_by: str | None = None
    permit_validity_verified_on: date | None = None
    ground_handling_policy: GroundHandlingPolicy | None = None
    ground_handling_source: str | None = None
    ground_handling_verified_by: str | None = None
    ground_handling_verified_on: date | None = None


class CountryOut(ORMModel, CountryBase):
    iso3: str
    version: int
    created_at: datetime
    updated_at: datetime

    # Computed, never typed — see app.domain.reference_status
    reference_status: str
    effective_lead_time_hours: float
    effective_lead_time_is_fallback: bool
    effective_permit_validity_amount: float
    effective_permit_validity_unit: PermitValidityUnit
    effective_permit_validity_is_fallback: bool
