from dataclasses import dataclass
from uuid import UUID

from fastapi import Depends, Header, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import TokenError, decode_token
from app.models.user import UserRole

_oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)


@dataclass(frozen=True)
class CurrentUser:
    id: UUID
    email: str
    role: UserRole


async def get_current_user(token: str | None = Depends(_oauth2_scheme)) -> CurrentUser:
    if token is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    try:
        payload = decode_token(token)
    except TokenError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token") from exc
    if payload.get("type") != "access":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not an access token")
    return CurrentUser(id=UUID(payload["sub"]), email=payload.get("email", ""), role=UserRole(payload["role"]))


def require_roles(*allowed: UserRole):
    async def _dependency(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if user.role not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role {user.role.value} is not permitted to perform this action",
            )
        return user

    return _dependency


# Convenience: any authenticated non-client-view role may read reference data.
require_write_access = require_roles(UserRole.SUPER_ADMIN, UserRole.OPERATIONS_SPECIALIST)
require_delete_access = require_roles(UserRole.SUPER_ADMIN)
require_admin = require_roles(UserRole.SUPER_ADMIN)


async def get_idempotency_key(idempotency_key: str | None = Header(default=None, alias="Idempotency-Key")) -> str | None:
    return idempotency_key


DbSession = AsyncSession
