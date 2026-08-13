from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel


class AircraftDocumentOut(BaseModel):
    id: UUID
    aircraft_id: UUID
    # str, not the old AircraftDocumentType enum (task #118) — validated
    # against real aircraft_document_types rows at the service layer.
    doc_type: str
    filename: str
    content_type: str | None
    file_size_bytes: int | None
    expiry_date: date | None
    uploaded_by: str | None
    created_at: datetime
