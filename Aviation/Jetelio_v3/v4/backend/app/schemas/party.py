from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.party import PartyRoleType
from app.schemas.common import ORMModel


class PartyBase(BaseModel):
    name: str
    legal_name: str | None = None
    country_iso3: str | None = Field(default=None, min_length=3, max_length=3)
    address: str | None = None
    contact_name: str | None = None
    contact_email: str | None = None
    contact_phone: str | None = None
    notes: str | None = None


class PartyCreate(PartyBase):
    pass


class PartyUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    version: int
    name: str | None = None
    legal_name: str | None = None
    country_iso3: str | None = None
    address: str | None = None
    contact_name: str | None = None
    contact_email: str | None = None
    contact_phone: str | None = None
    notes: str | None = None


class PartyOut(ORMModel, PartyBase):
    id: UUID
    version: int
    created_at: datetime
    updated_at: datetime


class PartyRoleBase(BaseModel):
    role: PartyRoleType
    operator_id: UUID | None = None
    client_id: UUID | None = None
    vendor_id: UUID | None = None
    credit_limit_minor_units: int | None = None
    notes: str | None = None


class PartyRoleCreate(PartyRoleBase):
    party_id: UUID


class PartyRoleUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    version: int
    credit_limit_minor_units: int | None = None
    notes: str | None = None


class PartyRoleOut(ORMModel, PartyRoleBase):
    id: UUID
    party_id: UUID
    version: int
    created_at: datetime
    updated_at: datetime
    # Resolved display name of whichever operator/client/vendor row this
    # role points at — None for AGENT/WALK_IN, which have no linked row.
    linked_name: str | None = None


class PartyDetailOut(PartyOut):
    roles: list[PartyRoleOut]
