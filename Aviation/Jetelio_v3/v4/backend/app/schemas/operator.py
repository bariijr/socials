from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.models.messaging import MessageFormat, MessagingChannel
from app.models.operator import OperatorStatus
from app.schemas.common import ORMModel


class OperatorBase(BaseModel):
    name: str | None = None
    aoc_number: str | None = None
    icao_designator: str | None = None
    iata_designator: str | None = None
    home_base_icao: str | None = None
    contact_name: str | None = None
    contact_phone: str | None = None
    address_line1: str | None = None
    address_line2: str | None = None
    city: str | None = None
    state_province: str | None = None
    postal_code: str | None = None
    country_iso3: str | None = None
    contact_fax: str | None = None
    airline_code_aftn: str | None = None
    airline_code_sita: str | None = None
    occ_email: str | None = None
    billing_email: str | None = None
    currency: str | None = None
    tax_id: str | None = None
    credit_limit_minor_units: int | None = None
    status: OperatorStatus = OperatorStatus.ACTIVE
    preferred_channel: MessagingChannel | None = None
    messaging_to: list[str] | None = None
    messaging_cc: list[str] | None = None
    sita_address: str | None = None
    aftn_address: str | None = None
    message_format: MessageFormat | None = None
    sending_team_signature: str | None = None


class OperatorCreate(OperatorBase):
    pass


class OperatorUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    version: int
    name: str | None = None
    aoc_number: str | None = None
    icao_designator: str | None = None
    iata_designator: str | None = None
    home_base_icao: str | None = None
    contact_name: str | None = None
    contact_phone: str | None = None
    address_line1: str | None = None
    address_line2: str | None = None
    city: str | None = None
    state_province: str | None = None
    postal_code: str | None = None
    country_iso3: str | None = None
    contact_fax: str | None = None
    airline_code_aftn: str | None = None
    airline_code_sita: str | None = None
    occ_email: str | None = None
    billing_email: str | None = None
    currency: str | None = None
    tax_id: str | None = None
    credit_limit_minor_units: int | None = None
    status: OperatorStatus | None = None
    preferred_channel: MessagingChannel | None = None
    messaging_to: list[str] | None = None
    messaging_cc: list[str] | None = None
    sita_address: str | None = None
    aftn_address: str | None = None
    message_format: MessageFormat | None = None
    sending_team_signature: str | None = None


class OperatorOut(ORMModel, OperatorBase):
    id: UUID
    version: int
    created_at: datetime
    updated_at: datetime
    quarantined: bool
    quarantine_reason: str | None = None
    source_ref: str | None = None

    assignable_status: str
