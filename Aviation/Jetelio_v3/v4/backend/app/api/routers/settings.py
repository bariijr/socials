from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_current_user, require_admin
from app.database import get_db
from app.schemas.settings import SettingOut, SettingUpdate
from app.services import settings_service

router = APIRouter(prefix="/settings", tags=["admin"])


@router.get("", response_model=list[SettingOut])
async def list_settings(
    session: AsyncSession = Depends(get_db), _user: CurrentUser = Depends(get_current_user)
) -> list[SettingOut]:
    rows = await settings_service.get_all(session)
    return [SettingOut(**{n: getattr(r, n) for n in SettingOut.model_fields}) for r in rows]


@router.patch("/{key}", response_model=SettingOut)
async def update_setting(
    key: str,
    payload: SettingUpdate,
    session: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(require_admin),
) -> SettingOut:
    updated = await settings_service.update_setting(
        session, key, value=payload.value, expected_version=payload.version, actor_email=user.email, actor_id=user.id
    )
    await session.commit()
    return SettingOut(**{n: getattr(updated, n) for n in SettingOut.model_fields})
