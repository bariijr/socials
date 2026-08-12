from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_current_user, require_admin
from app.database import get_db
from app.schemas.user import LoginRequest, RefreshRequest, TokenResponse, UserCreate, UserOut
from app.services import auth_service

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
async def login(payload: LoginRequest, session: AsyncSession = Depends(get_db)) -> TokenResponse:
    result = await auth_service.login(session, payload.email, payload.password)
    await session.commit()
    return result


@router.post("/refresh", response_model=TokenResponse)
async def refresh(payload: RefreshRequest, session: AsyncSession = Depends(get_db)) -> TokenResponse:
    return await auth_service.refresh_access_token(session, payload.refresh_token)


@router.post("/users", response_model=UserOut, status_code=201)
async def create_user(
    payload: UserCreate, session: AsyncSession = Depends(get_db), user: CurrentUser = Depends(require_admin)
) -> UserOut:
    result = await auth_service.create_user(session, payload, actor_id=user.id, actor_email=user.email)
    await session.commit()
    return result


@router.get("/users/me", response_model=UserOut)
async def me(session: AsyncSession = Depends(get_db), user: CurrentUser = Depends(get_current_user)) -> UserOut:
    from app.repositories.base import Repository
    from app.models.user import User

    repo = Repository(session, User)
    db_user = await repo.get(user.id)
    return UserOut(**{n: getattr(db_user, n) for n in UserOut.model_fields if hasattr(db_user, n)})
