from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.models.messaging import MessagingChannel
from app.schemas.common import ORMModel


class MessageTemplateBase(BaseModel):
    template_key: str
    name: str
    message_type: str
    recipient_role: str
    channel: MessagingChannel
    subject_line: str | None = None
    body: str
    footer_block: str | None = None
    required_attachments: list[str] | None = None
    active: bool = True


class MessageTemplateCreate(MessageTemplateBase):
    pass


class MessageTemplateUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    version: int
    name: str | None = None
    message_type: str | None = None
    recipient_role: str | None = None
    channel: MessagingChannel | None = None
    subject_line: str | None = None
    body: str | None = None
    footer_block: str | None = None
    required_attachments: list[str] | None = None
    active: bool | None = None
    bump_template_version: bool = False


class MessageTemplateOut(ORMModel, MessageTemplateBase):
    id: UUID
    version: int
    template_version: int
    created_at: datetime
    updated_at: datetime
