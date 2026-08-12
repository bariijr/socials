from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.document import DocumentEntityType
from app.schemas.common import ORMModel


class DocumentTypeTemplateOut(BaseModel):
    doc_type: str
    name: str
    applies_to_entity_type: DocumentEntityType
    expected_fields: list[dict]


class DocumentOut(BaseModel):
    id: UUID
    entity_type: DocumentEntityType
    entity_id: UUID
    doc_type: str
    filename: str
    content_type: str | None
    file_size_bytes: int | None
    # Always None until a real OCR provider is wired in — see
    # app.models.document.Document's docstring.
    ocr_raw_output: dict | None
    extracted_fields: dict | None
    status: str
    verified_by: str | None
    verified_on: date | None
    supersedes_document_id: UUID | None
    uploaded_by: str | None
    created_at: datetime
    version: int


class DocumentVerifyIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    version: int
    status: str = Field(pattern="^(VERIFIED|REJECTED)$")
    verified_by: str


class CredentialBase(BaseModel):
    rating_code: str
    rating_name: str | None = None
    issued_on: date | None = None
    expires_on: date | None = None


class CredentialCreate(CredentialBase):
    document_id: UUID


class CredentialUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    version: int
    rating_code: str | None = None
    rating_name: str | None = None
    issued_on: date | None = None
    expires_on: date | None = None


class CredentialOut(ORMModel, CredentialBase):
    id: UUID
    document_id: UUID
    version: int
    created_at: datetime
    updated_at: datetime
