import enum
from datetime import date

from sqlalchemy import Date, Enum, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import StandardMixin


class AircraftDocumentType(str, enum.Enum):
    REGISTRATION = "REGISTRATION"
    COFA = "COFA"
    INSURANCE = "INSURANCE"
    AIRWORTHINESS = "AIRWORTHINESS"
    NOISE_CERTIFICATE = "NOISE_CERTIFICATE"
    OTHER = "OTHER"


class AircraftDocument(Base, StandardMixin):
    """A file in the jetelio-documents MinIO/S3 bucket (see app.core.storage)
    — this row is the metadata; the object itself lives at s3_key, never
    inline in Postgres.
    """

    __tablename__ = "aircraft_documents"

    aircraft_id: Mapped[UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("aircraft.id", ondelete="CASCADE"), nullable=False, index=True
    )
    doc_type: Mapped[AircraftDocumentType] = mapped_column(
        Enum(AircraftDocumentType, name="aircraft_document_type"), nullable=False
    )
    filename: Mapped[str] = mapped_column(String(300), nullable=False)
    s3_key: Mapped[str] = mapped_column(String(500), nullable=False, unique=True)
    content_type: Mapped[str | None] = mapped_column(String(150), nullable=True)
    file_size_bytes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    expiry_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    uploaded_by: Mapped[UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
