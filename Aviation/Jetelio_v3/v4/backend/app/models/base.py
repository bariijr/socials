import uuid
from datetime import datetime

from sqlalchemy import DateTime, Integer, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column


class UUIDPKMixin:
    """Surrogate UUID primary key for entities with no natural key."""

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class VersionMixin:
    """Optimistic-locking version column. Bumped by the repository layer on
    every update; a stale version on write raises VersionConflictError.
    """

    version: Mapped[int] = mapped_column(Integer, nullable=False, server_default="1")


class SoftDeleteMixin:
    """Deletion is soft everywhere. `deleted_at IS NULL` means active; only
    SUPER ADMIN sees restore/purge (Phase 7). Every write through this
    column must also write an audit_log row.
    """

    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class StandardMixin(UUIDPKMixin, TimestampMixin, VersionMixin, SoftDeleteMixin):
    """The default shape for a first-class entity table."""
