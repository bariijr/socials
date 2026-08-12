from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr

from app.models.user import UserRole
from app.schemas.common import ORMModel


class UserCreate(BaseModel):
    email: EmailStr
    full_name: str
    password: str
    role: UserRole
    operator_id: UUID | None = None
    client_id: UUID | None = None


class UserUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    version: int
    full_name: str | None = None
    role: UserRole | None = None
    operator_id: UUID | None = None
    client_id: UUID | None = None
    is_active: bool | None = None
    mfa_enabled: bool | None = None


class UserOut(ORMModel):
    id: UUID
    email: str
    full_name: str
    role: UserRole
    operator_id: UUID | None = None
    client_id: UUID | None = None
    is_active: bool
    mfa_enabled: bool
    version: int
    created_at: datetime
    updated_at: datetime
    last_login_at: datetime | None = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str
