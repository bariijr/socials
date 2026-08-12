from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import ORMModel


class NavFeeProviderBase(BaseModel):
    fir_code: str = Field(min_length=1, max_length=10)
    provider_name: str
    country: str | None = None
    formula: str = Field(pattern="^(FLAT_RATE|MTOW_ONLY|DISTANCE_ONLY|MTOW_DISTANCE|DISTANCE_WEIGHT)$")
    base_rate: float
    minimum_fee: float = 0.0
    maximum_fee: float | None = None
    vat_rate: float = 0.0
    applies_50km_deduction: bool = False
    currency: str = Field(default="USD", min_length=3, max_length=3)
    source: str | None = None
    verified_by: str | None = None
    verified_on: date | None = None


class NavFeeProviderCreate(NavFeeProviderBase):
    pass


class NavFeeProviderUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    version: int
    provider_name: str | None = None
    country: str | None = None
    formula: str | None = Field(default=None, pattern="^(FLAT_RATE|MTOW_ONLY|DISTANCE_ONLY|MTOW_DISTANCE|DISTANCE_WEIGHT)$")
    base_rate: float | None = None
    minimum_fee: float | None = None
    maximum_fee: float | None = None
    vat_rate: float | None = None
    applies_50km_deduction: bool | None = None
    currency: str | None = None
    source: str | None = None
    verified_by: str | None = None
    verified_on: date | None = None


class NavFeeProviderOut(ORMModel, NavFeeProviderBase):
    id: UUID
    version: int
    created_at: datetime
    updated_at: datetime
    # Computed, never typed — see app.domain.reference_status
    provider_status: str
