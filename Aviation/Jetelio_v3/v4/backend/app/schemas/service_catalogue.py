from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.models.service_catalogue import ServiceCategory, ServiceLevel
from app.schemas.common import ORMModel


class ServiceCatalogueBase(BaseModel):
    code: str
    name: str
    description: str | None = None
    category: ServiceCategory
    ground_grid_order: int | None = None
    level: ServiceLevel
    parent_service_id: UUID | None = None


class ServiceCatalogueCreate(ServiceCatalogueBase):
    pass


class ServiceCatalogueUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    version: int
    name: str | None = None
    description: str | None = None
    category: ServiceCategory | None = None
    ground_grid_order: int | None = None
    level: ServiceLevel | None = None
    parent_service_id: UUID | None = None


class ServiceCatalogueOut(ORMModel, ServiceCatalogueBase):
    id: UUID
    version: int
    created_at: datetime
    updated_at: datetime
    mapping_audit: str | None = None
