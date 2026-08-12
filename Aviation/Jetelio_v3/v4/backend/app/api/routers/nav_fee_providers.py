from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_current_user, require_write_access
from app.database import get_db
from app.schemas.common import Page
from app.schemas.nav_fee_provider import NavFeeProviderCreate, NavFeeProviderOut, NavFeeProviderUpdate
from app.services import nav_fee_provider_service

router = APIRouter(prefix="/nav-fee-providers", tags=["reference-data"])


@router.get("", response_model=Page[NavFeeProviderOut])
async def list_providers(
    page: int = 1,
    page_size: int = Query(default=50, le=500),
    session: AsyncSession = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
) -> Page[NavFeeProviderOut]:
    items, total = await nav_fee_provider_service.list_providers(session, page=page, page_size=page_size)
    return Page(items=items, total=total, page=page, page_size=page_size)


@router.post("", response_model=NavFeeProviderOut, status_code=201)
async def create_provider(
    payload: NavFeeProviderCreate,
    session: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(require_write_access),
) -> NavFeeProviderOut:
    result = await nav_fee_provider_service.create_provider(session, payload, actor_id=user.id, actor_email=user.email)
    await session.commit()
    return result


@router.patch("/{provider_id}", response_model=NavFeeProviderOut)
async def update_provider(
    provider_id: UUID,
    payload: NavFeeProviderUpdate,
    session: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(require_write_access),
) -> NavFeeProviderOut:
    result = await nav_fee_provider_service.update_provider(
        session, provider_id, payload, actor_id=user.id, actor_email=user.email
    )
    await session.commit()
    return result
