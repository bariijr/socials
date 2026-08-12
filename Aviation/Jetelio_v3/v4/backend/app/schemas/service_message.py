from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.service_delivery import DeliveryChannel
from app.models.service_message import ServiceMessageDirection
from app.schemas.common import ORMModel


class ServiceMessageCreate(BaseModel):
    direction: ServiceMessageDirection
    channel: DeliveryChannel | None = None
    subject: str | None = None
    body: str
    sent_by_name: str | None = None


class ServiceMessageOut(ORMModel):
    id: UUID
    leg_id: UUID
    service_code: str
    icao: str
    direction: ServiceMessageDirection
    channel: DeliveryChannel | None
    subject: str | None
    body: str
    sent_by_user_id: UUID | None
    sent_by_name: str | None
    version: int
    created_at: datetime


class SendServiceRequestItem(BaseModel):
    service_code: str
    icao: str


class SendServiceRequestBatchIn(BaseModel):
    items: list[SendServiceRequestItem] = Field(min_length=1)


class SendServiceRequestOut(BaseModel):
    """One result per requested (service_code, icao) — a batch send can
    partially succeed (e.g. one service has a vendor contact configured,
    another doesn't), never all-or-nothing."""

    service_code: str
    icao: str
    sent: bool
    error: str | None
    message: ServiceMessageOut | None
    document_warnings: list[str] = Field(default_factory=list)


class DocumentRequirementCheckOut(BaseModel):
    requirement: str
    status: str
    doc_type: str | None
    document_id: str | None
    source: str | None
