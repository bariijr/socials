from datetime import date, datetime
from typing import Generic, TypeVar
from uuid import UUID

from pydantic import BaseModel, ConfigDict

T = TypeVar("T")


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True, protected_namespaces=())


class Provenance(BaseModel):
    """Reusable read-only shape for source/verified_by/verified_on triples."""

    source: str | None = None
    verified_by: str | None = None
    verified_on: date | None = None


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int


class PageParams(BaseModel):
    page: int = 1
    page_size: int = 50


class DeleteResult(BaseModel):
    id: UUID | str
    deleted: bool
    deleted_at: datetime
