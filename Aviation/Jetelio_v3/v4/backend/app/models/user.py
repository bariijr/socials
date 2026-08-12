import enum
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import StandardMixin


class UserRole(str, enum.Enum):
    SUPER_ADMIN = "SUPER_ADMIN"
    OPERATIONS_SPECIALIST = "OPERATIONS_SPECIALIST"
    AUDITOR = "AUDITOR"
    CLIENT_MODIFY = "CLIENT_MODIFY"
    CLIENT_VIEW = "CLIENT_VIEW"
    FINANCE = "FINANCE"


# Roles allowed to delete reference/operational data. OPERATIONS_SPECIALIST
# is explicitly excluded — create/modify/permit-management/suspend only.
DELETE_CAPABLE_ROLES = {UserRole.SUPER_ADMIN}

# Roles for which MFA is mandatory.
MFA_MANDATORY_ROLES = {UserRole.SUPER_ADMIN, UserRole.OPERATIONS_SPECIALIST, UserRole.FINANCE}


class User(Base, StandardMixin):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(300), nullable=False, unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(200), nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(300), nullable=False)
    role: Mapped[UserRole] = mapped_column(Enum(UserRole, name="user_role"), nullable=False)

    # Scope for CLIENT_MODIFY / CLIENT_VIEW users — a client token must
    # never read another operator's trip, enforced again at the DB layer
    # via row-level security (Phase 7 hardening).
    operator_id: Mapped[UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("operators.id"), nullable=True)
    client_id: Mapped[UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("clients.id"), nullable=True)

    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    mfa_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
