from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.models.messaging import MessageFormat, MessagingChannel
from app.schemas.common import ORMModel


class ClientBase(BaseModel):
    operator_id: UUID
    bill_to_legal_name: str
    address: str | None = None
    tax_vat_number: str | None = None
    billing_contact_name: str | None = None
    billing_contact_email: str | None = None
    currency: str | None = None
    payment_terms: str | None = None
    credit_limit_minor_units: int | None = None
    preferred_channel: MessagingChannel | None = None
    messaging_to: list[str] | None = None
    messaging_cc: list[str] | None = None
    sita_address: str | None = None
    aftn_address: str | None = None
    message_format: MessageFormat | None = None
    sending_team_signature: str | None = None


class ClientCreate(ClientBase):
    pass


class ClientUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    version: int
    bill_to_legal_name: str | None = None
    address: str | None = None
    tax_vat_number: str | None = None
    billing_contact_name: str | None = None
    billing_contact_email: str | None = None
    currency: str | None = None
    payment_terms: str | None = None
    credit_limit_minor_units: int | None = None
    preferred_channel: MessagingChannel | None = None
    messaging_to: list[str] | None = None
    messaging_cc: list[str] | None = None
    sita_address: str | None = None
    aftn_address: str | None = None
    message_format: MessageFormat | None = None
    sending_team_signature: str | None = None


class ClientOut(ORMModel, ClientBase):
    id: UUID
    version: int
    created_at: datetime
    updated_at: datetime
    source_ref: str | None = None
    billing_ref: str
