from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.schemas.common import ORMModel


class CountryRequirementBase(BaseModel):
    country_iso3: str
    request_type: str
    required_forms: list[str] | None = None
    required_documents: list[str] | None = None
    lead_time_hours: float | None = None
    authority_working_hours: str | None = None
    accepted_channels: list[str] | None = None
    fee_structure: dict | None = None
    local_agent_required: bool | None = None
    direct_caa_account_possible: bool | None = None
    known_quirks: str | None = None
    source: str | None = None
    verified_by: str | None = None
    verified_on: date | None = None
    review_due: date | None = None


class CountryRequirementCreate(CountryRequirementBase):
    pass


class CountryRequirementUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    version: int
    required_forms: list[str] | None = None
    required_documents: list[str] | None = None
    lead_time_hours: float | None = None
    authority_working_hours: str | None = None
    accepted_channels: list[str] | None = None
    fee_structure: dict | None = None
    local_agent_required: bool | None = None
    direct_caa_account_possible: bool | None = None
    known_quirks: str | None = None
    source: str | None = None
    verified_by: str | None = None
    verified_on: date | None = None
    review_due: date | None = None


class CountryRequirementOut(ORMModel, CountryRequirementBase):
    id: UUID
    version: int
    created_at: datetime
    updated_at: datetime
    source_ref: str | None = None
