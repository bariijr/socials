import enum
from datetime import date

from sqlalchemy import Boolean, Date, Enum, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import StandardMixin


class AircraftDocumentCategory(str, enum.Enum):
    """Task #118 — the four categories the real N80TE reference document
    set organizes into (AC/INS/LTR/PERMIT prefixes on the source
    filenames)."""

    AC = "AC"
    INS = "INS"
    LTR = "LTR"
    PERMIT = "PERMIT"


class AircraftDocumentTypeDefinition(Base, StandardMixin):
    """Admin-editable reference table replacing the old fixed
    AircraftDocumentType enum (task #118) — mirrors
    app.models.document.DocumentTypeTemplate's shape exactly (UUID PK via
    StandardMixin, a separate unique `code` column that's the real FK
    target, not the PK itself). Seeded from
    app.core.aircraft_document_type_registry; an admin can add more later
    via the CRUD router without a code change.
    """

    __tablename__ = "aircraft_document_types"

    code: Mapped[str] = mapped_column(String(80), nullable=False, unique=True, index=True)
    label: Mapped[str] = mapped_column(String(200), nullable=False)
    category: Mapped[AircraftDocumentCategory] = mapped_column(
        Enum(AircraftDocumentCategory, name="aircraft_document_category"), nullable=False
    )
    sort_order: Mapped[int | None] = mapped_column(Integer, nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class AircraftDocument(Base, StandardMixin):
    """A file in the jetelio-documents MinIO/S3 bucket (see app.core.storage)
    — this row is the metadata; the object itself lives at s3_key, never
    inline in Postgres.
    """

    __tablename__ = "aircraft_documents"

    aircraft_id: Mapped[UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("aircraft.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # str, not the old AircraftDocumentType enum (task #118) — FK to
    # aircraft_document_types.code, validated at the service layer against
    # real active rows rather than a fixed Python type.
    doc_type: Mapped[str] = mapped_column(String(80), ForeignKey("aircraft_document_types.code"), nullable=False)
    filename: Mapped[str] = mapped_column(String(300), nullable=False)
    s3_key: Mapped[str] = mapped_column(String(500), nullable=False, unique=True)
    content_type: Mapped[str | None] = mapped_column(String(150), nullable=True)
    file_size_bytes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    expiry_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    uploaded_by: Mapped[UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
