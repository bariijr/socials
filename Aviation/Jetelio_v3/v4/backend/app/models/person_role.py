from sqlalchemy import Boolean, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import StandardMixin


class PersonRoleDefinition(Base, StandardMixin):
    """Admin-editable reference table (task #120) replacing the fixed
    Pydantic regex PersonPublicIn.role used to carry
    ("^(PIC|FO|FA|MECHANIC|ENGINEER|CREW|PAX|VIP|PRINCIPAL|OTHER)$").
    Mirrors app.models.document.DocumentTypeTemplate's shape (UUID PK via
    StandardMixin, a separate unique `code` column). `is_crew` replaces
    the old fixed CREW_ROLES/PAX_ROLES frozensets in
    app.domain.credentials — souls-on-board bucketing reads this column
    instead of a hardcoded set, so an admin-added role (e.g. "Medical
    Staff") buckets correctly without a code change.
    """

    __tablename__ = "person_role_definitions"

    code: Mapped[str] = mapped_column(String(30), nullable=False, unique=True, index=True)
    label: Mapped[str] = mapped_column(String(100), nullable=False)
    is_crew: Mapped[bool] = mapped_column(Boolean, nullable=False)
    sort_order: Mapped[int | None] = mapped_column(Integer, nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
