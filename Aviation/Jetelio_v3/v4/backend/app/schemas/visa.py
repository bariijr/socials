from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.models.visa import VisaRequirement
from app.schemas.common import ORMModel


class VisaMatrixCellBase(BaseModel):
    country_iso3: str
    nationality_iso3: str
    requirement: VisaRequirement
    visa_type: str | None = None
    lead_time_days: int | None = None
    max_stay_days: int | None = None
    conditions: str | None = None
    source: str | None = None
    verified_by: str | None = None
    verified_on: date | None = None
    expires_on: date | None = None


class VisaMatrixCellCreate(VisaMatrixCellBase):
    pass


class VisaMatrixCellUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    version: int
    requirement: VisaRequirement | None = None
    visa_type: str | None = None
    lead_time_days: int | None = None
    max_stay_days: int | None = None
    conditions: str | None = None
    source: str | None = None
    verified_by: str | None = None
    verified_on: date | None = None
    expires_on: date | None = None


class VisaMatrixCellOut(ORMModel, VisaMatrixCellBase):
    id: UUID
    version: int
    created_at: datetime
    updated_at: datetime
    is_stale: bool


class VisaRuleBase(BaseModel):
    country_iso3: str
    nationality_iso3: str
    airport_icao: str | None = None
    requirement: VisaRequirement
    visa_type: str | None = None
    lead_time_days: int | None = None
    max_stay_days: int | None = None
    conditions: str | None = None
    source: str | None = None
    verified_by: str | None = None
    verified_on: date | None = None
    expires_on: date | None = None


class VisaRuleCreate(VisaRuleBase):
    pass


class VisaRuleUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    version: int
    requirement: VisaRequirement | None = None
    visa_type: str | None = None
    lead_time_days: int | None = None
    max_stay_days: int | None = None
    conditions: str | None = None
    source: str | None = None
    verified_by: str | None = None
    verified_on: date | None = None
    expires_on: date | None = None


class VisaRuleOut(ORMModel, VisaRuleBase):
    id: UUID
    version: int
    created_at: datetime
    updated_at: datetime
    is_stale: bool


class VisaLookupResult(BaseModel):
    country_iso3: str
    nationality_iso3: str
    airport_icao: str | None = None
    requirement: str
    visa_type: str | None = None
    lead_time_days: int | None = None
    max_stay_days: int | None = None
    conditions: str | None = None
    source: str | None = None
    verified_by: str | None = None
    verified_on: date | None = None
    expires_on: date | None = None
    answered_by_layer: str
    is_stale: bool
