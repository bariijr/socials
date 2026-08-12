from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.models.messaging import MessageFormat, MessagingChannel
from app.models.vendor import VendorCapabilityStatus
from app.schemas.common import ORMModel


class VendorBase(BaseModel):
    name: str
    service_scope: list[str] | None = None
    preferred_channel: MessagingChannel | None = None
    messaging_to: list[str] | None = None
    messaging_cc: list[str] | None = None
    sita_address: str | None = None
    aftn_address: str | None = None
    message_format: MessageFormat | None = None
    sending_team_signature: str | None = None
    questionnaire_sent_on: date | None = None
    questionnaire_returned_on: date | None = None
    questionnaire_answers: dict | None = None
    capability_status: VendorCapabilityStatus = VendorCapabilityStatus.PENDING
    approved_by: str | None = None
    approved_on: date | None = None
    preference_rank: int | None = None


class VendorCreate(VendorBase):
    pass


class VendorUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    version: int
    name: str | None = None
    service_scope: list[str] | None = None
    preferred_channel: MessagingChannel | None = None
    messaging_to: list[str] | None = None
    messaging_cc: list[str] | None = None
    sita_address: str | None = None
    aftn_address: str | None = None
    message_format: MessageFormat | None = None
    sending_team_signature: str | None = None
    questionnaire_sent_on: date | None = None
    questionnaire_returned_on: date | None = None
    questionnaire_answers: dict | None = None
    capability_status: VendorCapabilityStatus | None = None
    approved_by: str | None = None
    approved_on: date | None = None
    preference_rank: int | None = None


class VendorOut(ORMModel, VendorBase):
    id: UUID
    version: int
    created_at: datetime
    updated_at: datetime
    source_ref: str | None = None
    billing_ref: str


class VendorCoverageAirportBase(BaseModel):
    vendor_id: UUID
    icao: str
    is_primary_handler: bool = False
    fbo_name: str | None = None
    sita: str | None = None
    aftn: str | None = None
    vhf: str | None = None
    contacts: list[dict] | None = None


class VendorCoverageAirportCreate(VendorCoverageAirportBase):
    pass


class VendorCoverageAirportOut(ORMModel, VendorCoverageAirportBase):
    id: UUID
    version: int
    created_at: datetime
    updated_at: datetime
    source_ref: str | None = None


class VendorCoverageCountryBase(BaseModel):
    vendor_id: UUID
    country_iso3: str
    has_caa_direct_account: bool = False
    service_scope: list[str] | None = None


class VendorCoverageCountryCreate(VendorCoverageCountryBase):
    pass


class VendorCoverageCountryOut(ORMModel, VendorCoverageCountryBase):
    id: UUID
    version: int
    created_at: datetime
    updated_at: datetime
    source_ref: str | None = None
