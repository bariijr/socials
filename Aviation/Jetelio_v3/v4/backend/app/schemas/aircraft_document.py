from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel

from app.models.aircraft_document import AircraftDocumentType


class AircraftDocumentOut(BaseModel):
    id: UUID
    aircraft_id: UUID
    doc_type: AircraftDocumentType
    filename: str
    content_type: str | None
    file_size_bytes: int | None
    expiry_date: date | None
    uploaded_by: str | None
    created_at: datetime
