from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import ORMModel

_FORMULA_PATTERN = "^(FLAT_RATE|MTOW_ONLY|DISTANCE_ONLY|MTOW_DISTANCE|DISTANCE_WEIGHT)$"
_PERMIT_TYPE_PATTERN = "^(OVERFLIGHT|LANDING|GROUND_HANDLING)$"
_FEE_CATEGORY_PATTERN = "^(CAA_FEE|NAFISAT)$"


class PermitFeeProviderBase(BaseModel):
    country_iso3: str = Field(min_length=3, max_length=3)
    permit_type: str = Field(pattern=_PERMIT_TYPE_PATTERN)
    fee_category: str = Field(pattern=_FEE_CATEGORY_PATTERN)
    provider_name: str
    formula: str = Field(pattern=_FORMULA_PATTERN)
    base_rate: float
    minimum_fee: float = 0.0
    maximum_fee: float | None = None
    vat_rate: float = 0.0
    currency: str = Field(default="USD", min_length=3, max_length=3)
    source: str | None = None
    verified_by: str | None = None
    verified_on: date | None = None


class PermitFeeProviderCreate(PermitFeeProviderBase):
    pass


class PermitFeeProviderUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    version: int
    provider_name: str | None = None
    formula: str | None = Field(default=None, pattern=_FORMULA_PATTERN)
    base_rate: float | None = None
    minimum_fee: float | None = None
    maximum_fee: float | None = None
    vat_rate: float | None = None
    currency: str | None = None
    source: str | None = None
    verified_by: str | None = None
    verified_on: date | None = None


class PermitFeeProviderOut(ORMModel, PermitFeeProviderBase):
    id: UUID
    version: int
    created_at: datetime
    updated_at: datetime
    # Computed, never typed — see app.domain.reference_status
    provider_status: str
