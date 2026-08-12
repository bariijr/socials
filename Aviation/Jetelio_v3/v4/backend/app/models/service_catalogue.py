import enum

from sqlalchemy import Enum, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import StandardMixin


class ServiceCategory(str, enum.Enum):
    PERMIT = "PERMIT"
    GROUND = "GROUND"


class ServiceLevel(str, enum.Enum):
    SERVICE = "SERVICE"
    SUB_SERVICE = "SUB-SERVICE"


class ServiceCatalogueEntry(Base, StandardMixin):
    """ONE table, not two. parent_service_id is always RE-DERIVED from the
    code prefix on import, never trusted from the source workbook — the
    workbook's sub_services.service_id was historically shifted by one from
    SS-017 onward. mapping_audit records every remap so the fix is
    traceable; import fails loudly on anything unresolved.
    """

    __tablename__ = "service_catalogue"

    code: Mapped[str] = mapped_column(String(20), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(300), nullable=False)
    description: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    category: Mapped[ServiceCategory] = mapped_column(Enum(ServiceCategory, name="service_category"), nullable=False)
    ground_grid_order: Mapped[int | None] = mapped_column(Integer, nullable=True)
    level: Mapped[ServiceLevel] = mapped_column(Enum(ServiceLevel, name="service_level"), nullable=False)
    parent_service_id: Mapped[UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("service_catalogue.id"), nullable=True
    )
    mapping_audit: Mapped[str | None] = mapped_column(
        String(500), nullable=True, doc="How parentage was (re)derived from the code prefix during import."
    )
