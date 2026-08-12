from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import TimestampMixin, VersionMixin


class Setting(Base, TimestampMixin, VersionMixin):
    """The named-settings registry as DB rows. Seeded from
    app.core.settings_registry.NAMED_SETTINGS on first migration; editable
    at runtime by SUPER ADMIN thereafter. No engine may contain a
    hard-coded fallback number — every one of them lives here.
    """

    __tablename__ = "settings"

    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    value: Mapped[str] = mapped_column(String(500), nullable=False)
    value_type: Mapped[str] = mapped_column(String(20), nullable=False)
    description: Mapped[str] = mapped_column(String(1000), nullable=False)
