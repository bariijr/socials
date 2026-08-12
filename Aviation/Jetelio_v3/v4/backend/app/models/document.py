import enum
from datetime import date

from sqlalchemy import Date, Enum, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import StandardMixin


class DocumentEntityType(str, enum.Enum):
    PERSON = "PERSON"
    PARTY = "PARTY"


class DocumentStatus(str, enum.Enum):
    PENDING_VERIFICATION = "PENDING_VERIFICATION"
    VERIFIED = "VERIFIED"
    REJECTED = "REJECTED"
    SUPERSEDED = "SUPERSEDED"


class DocumentTypeTemplate(Base, StandardMixin):
    """Defines the fields a given doc_type is expected to carry (license:
    number, issuing authority/country, ratings[], issue/expiry; medical:
    class, limitations, expiry; etc.) — drives a side-by-side
    OCR-vs-entered verification screen. `expected_fields` is a structural
    form-schema definition, not operational fact, so seeding it directly
    (see app.core.document_template_registry) doesn't violate the
    never-fabricate-data rule the same way a guessed fee/lead-time would.
    """

    __tablename__ = "document_type_templates"

    doc_type: Mapped[str] = mapped_column(String(50), nullable=False, unique=True, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    applies_to_entity_type: Mapped[DocumentEntityType] = mapped_column(
        Enum(DocumentEntityType, name="doc_template_entity_type"), nullable=False
    )
    # [{"key": "license_number", "label": "License number", "type": "string"}, ...]
    expected_fields: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)


class Document(Base, StandardMixin):
    """Polymorphic document for Person/Party entities — NOT a replacement
    for AircraftDocument (task #76), which stays as-is; this covers the
    entity types that had nowhere to store documents before. OCR fields are
    deliberately always None from this build: no OCR provider/API-key
    decision has been made, so nothing here fabricates extracted data — see
    NavFeeProvider's NO_PROVIDER_CONFIGURED pattern for the same discipline.
    A doc_type without a real OCR pipeline just stays PENDING_VERIFICATION
    until a human confirms it, same as if OCR had run and found nothing.
    """

    __tablename__ = "documents"

    entity_type: Mapped[DocumentEntityType] = mapped_column(Enum(DocumentEntityType, name="document_entity_type"), nullable=False)
    entity_id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    doc_type: Mapped[str] = mapped_column(String(50), ForeignKey("document_type_templates.doc_type"), nullable=False)

    filename: Mapped[str] = mapped_column(String(300), nullable=False)
    s3_key: Mapped[str] = mapped_column(String(500), nullable=False, unique=True)
    content_type: Mapped[str | None] = mapped_column(String(150), nullable=True)
    file_size_bytes: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Never populated by this build — see class docstring.
    ocr_raw_output: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    extracted_fields: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    status: Mapped[DocumentStatus] = mapped_column(
        Enum(DocumentStatus, name="document_status"), nullable=False, default=DocumentStatus.PENDING_VERIFICATION
    )
    verified_by: Mapped[str | None] = mapped_column(String(200), nullable=True)
    verified_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    supersedes_document_id: Mapped[UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("documents.id"), nullable=True)
    uploaded_by: Mapped[UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)


class Credential(Base, StandardMixin):
    """Child rows off a license Document — one license can carry multiple
    type ratings.
    """

    __tablename__ = "credentials"

    document_id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, index=True)
    rating_code: Mapped[str] = mapped_column(String(50), nullable=False)
    rating_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    issued_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    expires_on: Mapped[date | None] = mapped_column(Date, nullable=True)
