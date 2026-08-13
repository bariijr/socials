from uuid import UUID

from pydantic import BaseModel

from app.models.aircraft_document import AircraftDocumentCategory


class AircraftDocumentTypeBase(BaseModel):
    code: str
    label: str
    category: AircraftDocumentCategory
    sort_order: int | None = None
    active: bool = True


class AircraftDocumentTypeCreate(AircraftDocumentTypeBase):
    pass


class AircraftDocumentTypeUpdate(BaseModel):
    version: int
    label: str | None = None
    category: AircraftDocumentCategory | None = None
    sort_order: int | None = None
    active: bool | None = None


class AircraftDocumentTypeOut(AircraftDocumentTypeBase):
    id: UUID
    version: int
