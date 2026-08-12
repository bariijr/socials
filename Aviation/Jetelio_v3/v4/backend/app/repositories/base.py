from datetime import datetime, timezone
from typing import Any, Generic, TypeVar

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFoundError, VersionConflictError
from app.database import Base

ModelType = TypeVar("ModelType", bound=Base)


class Repository(Generic[ModelType]):
    """Generic CRUD repository over a single SQLAlchemy model.

    Handles the two conventions every entity table in this schema follows
    when present: optimistic-locking `version` and soft-delete
    `deleted_at`. Both are detected dynamically via hasattr so this one
    class serves both UUID-PK entities and natural-key entities
    (countries.iso3, airports.icao, aircraft_performance.icao_type,
    settings.key) without a second class hierarchy.
    """

    def __init__(self, session: AsyncSession, model: type[ModelType], pk_column: str = "id"):
        self.session = session
        self.model = model
        self.pk_column = pk_column
        self.entity_name = model.__name__

    def _has_soft_delete(self) -> bool:
        return hasattr(self.model, "deleted_at")

    def _base_query(self, include_deleted: bool = False):
        stmt = select(self.model)
        if self._has_soft_delete() and not include_deleted:
            stmt = stmt.where(self.model.deleted_at.is_(None))
        return stmt

    async def get(self, pk_value: Any, include_deleted: bool = False) -> ModelType:
        stmt = self._base_query(include_deleted).where(getattr(self.model, self.pk_column) == pk_value)
        result = await self.session.execute(stmt)
        obj = result.scalar_one_or_none()
        if obj is None:
            raise NotFoundError(self.entity_name, pk_value)
        return obj

    async def get_optional(self, pk_value: Any) -> ModelType | None:
        stmt = self._base_query().where(getattr(self.model, self.pk_column) == pk_value)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def list(
        self,
        *,
        page: int = 1,
        page_size: int = 50,
        filters: dict[str, Any] | None = None,
        order_by: Any = None,
    ) -> tuple[list[ModelType], int]:
        stmt = self._base_query()
        for key, value in (filters or {}).items():
            if value is None:
                continue
            stmt = stmt.where(getattr(self.model, key) == value)
        if order_by is not None:
            stmt = stmt.order_by(order_by)

        count_stmt = select(func.count()).select_from(stmt.subquery())
        total = (await self.session.execute(count_stmt)).scalar_one()

        stmt = stmt.offset((page - 1) * page_size).limit(page_size)
        items = list((await self.session.execute(stmt)).scalars().all())
        return items, total

    async def create(self, obj: ModelType) -> ModelType:
        self.session.add(obj)
        await self.session.flush()
        await self.session.refresh(obj)
        return obj

    async def update(self, pk_value: Any, expected_version: int | None, values: dict[str, Any]) -> ModelType:
        obj = await self.get(pk_value)
        if expected_version is not None and hasattr(obj, "version") and obj.version != expected_version:
            raise VersionConflictError(self.entity_name, pk_value, expected_version, obj.version)
        for key, value in values.items():
            setattr(obj, key, value)
        if hasattr(obj, "version"):
            obj.version = obj.version + 1
        await self.session.flush()
        await self.session.refresh(obj)
        return obj

    async def soft_delete(self, pk_value: Any, expected_version: int | None) -> ModelType:
        if not self._has_soft_delete():
            raise NotImplementedError(f"{self.entity_name} does not support soft delete")
        obj = await self.get(pk_value)
        if expected_version is not None and hasattr(obj, "version") and obj.version != expected_version:
            raise VersionConflictError(self.entity_name, pk_value, expected_version, obj.version)
        obj.deleted_at = datetime.now(timezone.utc)
        if hasattr(obj, "version"):
            obj.version = obj.version + 1
        await self.session.flush()
        await self.session.refresh(obj)
        return obj
