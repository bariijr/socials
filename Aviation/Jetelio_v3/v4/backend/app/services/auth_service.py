from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AuthenticationError
from app.core.security import TokenError, create_access_token, create_refresh_token, decode_token, hash_password, verify_password
from app.models.user import User
from app.repositories.audit import write_audit_log
from app.repositories.base import Repository
from app.schemas.user import TokenResponse, UserCreate, UserOut, UserUpdate


def _to_out(user: User) -> UserOut:
    return UserOut(**{n: getattr(user, n) for n in UserOut.model_fields if hasattr(user, n)})


async def login(session: AsyncSession, email: str, password: str) -> TokenResponse:
    stmt = select(User).where(User.email == email.lower(), User.deleted_at.is_(None))
    user = (await session.execute(stmt)).scalar_one_or_none()
    if user is None or not user.is_active or not verify_password(password, user.hashed_password):
        raise AuthenticationError("Invalid email or password")
    user.last_login_at = datetime.now(timezone.utc)
    await session.flush()
    access = create_access_token(str(user.id), user.role.value, extra={"email": user.email})
    refresh = create_refresh_token(str(user.id))
    return TokenResponse(access_token=access, refresh_token=refresh)


async def refresh_access_token(session: AsyncSession, refresh_token: str) -> TokenResponse:
    try:
        payload = decode_token(refresh_token)
    except TokenError as exc:
        raise AuthenticationError("Invalid or expired refresh token") from exc
    if payload.get("type") != "refresh":
        raise AuthenticationError("Not a refresh token")

    repo = Repository(session, User)
    user = await repo.get(UUID(payload["sub"]))
    if not user.is_active:
        raise AuthenticationError("User is disabled")
    access = create_access_token(str(user.id), user.role.value, extra={"email": user.email})
    new_refresh = create_refresh_token(str(user.id))
    return TokenResponse(access_token=access, refresh_token=new_refresh)


async def create_user(session: AsyncSession, payload: UserCreate, *, actor_id: UUID, actor_email: str) -> UserOut:
    repo = Repository(session, User)
    user = User(
        email=payload.email.lower(),
        full_name=payload.full_name,
        hashed_password=hash_password(payload.password),
        role=payload.role,
        operator_id=payload.operator_id,
        client_id=payload.client_id,
    )
    created = await repo.create(user)
    await write_audit_log(
        session, actor_user_id=actor_id, actor_email=actor_email, action="CREATE",
        entity_type="User", entity_id=str(created.id), to_value={"email": created.email, "role": created.role.value},
    )
    return _to_out(created)


async def update_user(
    session: AsyncSession, user_id: UUID, payload: UserUpdate, *, actor_id: UUID, actor_email: str
) -> UserOut:
    repo = Repository(session, User)
    values = payload.model_dump(exclude={"version"}, exclude_unset=True)
    updated = await repo.update(user_id, payload.version, values)
    await write_audit_log(
        session, actor_user_id=actor_id, actor_email=actor_email, action="UPDATE",
        entity_type="User", entity_id=str(updated.id), to_value=values,
    )
    return _to_out(updated)


async def list_users(session: AsyncSession, *, page: int, page_size: int) -> tuple[list[UserOut], int]:
    repo = Repository(session, User)
    items, total = await repo.list(page=page, page_size=page_size)
    return [_to_out(u) for u in items], total
