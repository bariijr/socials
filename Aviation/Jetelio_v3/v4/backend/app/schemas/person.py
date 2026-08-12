from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import ORMModel


class PersonBase(BaseModel):
    party_id: UUID | None = None
    full_name: str
    date_of_birth: date | None = None
    nationality_iso3: str | None = Field(default=None, min_length=3, max_length=3)
    role_hint: str = Field(default="BOTH", pattern="^(CREW|PAX|BOTH)$")
    email: str | None = None
    phone: str | None = None
    passport_number: str | None = None
    passport_expiry: date | None = None
    notes: str | None = None


class PersonCreate(PersonBase):
    pass


class PersonUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    version: int
    party_id: UUID | None = None
    full_name: str | None = None
    date_of_birth: date | None = None
    nationality_iso3: str | None = None
    role_hint: str | None = Field(default=None, pattern="^(CREW|PAX|BOTH)$")
    email: str | None = None
    phone: str | None = None
    passport_number: str | None = None
    passport_expiry: date | None = None
    notes: str | None = None


class PersonOut(ORMModel, PersonBase):
    id: UUID
    version: int
    created_at: datetime
    updated_at: datetime
