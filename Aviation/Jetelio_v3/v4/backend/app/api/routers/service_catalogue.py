from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_current_user, require_write_access
from app.database import get_db
from app.schemas.common import Page
from app.schemas.service_catalogue import ServiceCatalogueCreate, ServiceCatalogueOut, ServiceCatalogueUpdate
from app.services import service_catalogue_service

router = APIRouter(prefix="/service-catalogue", tags=["reference-data"])


@router.get("", response_model=Page[ServiceCatalogueOut])
async def list_entries(
    page: int = 1,
    page_size: int = Query(default=100, le=500),
    level: str | None = None,
    session: AsyncSession = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
) -> Page[ServiceCatalogueOut]:
    items, total = await service_catalogue_service.list_entries(session, page=page, page_size=page_size, level=level)
    return Page(items=items, total=total, page=page, page_size=page_size)


@router.get("/{entry_id}", response_model=ServiceCatalogueOut)
async def get_entry(
    entry_id: UUID, session: AsyncSession = Depends(get_db), _user: CurrentUser = Depends(get_current_user)
) -> ServiceCatalogueOut:
    return await service_catalogue_service.get_entry(session, entry_id)


@router.post("", response_model=ServiceCatalogueOut, status_code=201)
async def create_entry(
    payload: ServiceCatalogueCreate,
    session: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(require_write_access),
) -> ServiceCatalogueOut:
    result = await service_catalogue_service.create_entry(session, payload, actor_id=user.id, actor_email=user.email)
    await session.commit()
    return result


@router.patch("/{entry_id}", response_model=ServiceCatalogueOut)
async def update_entry(
    entry_id: UUID,
    payload: ServiceCatalogueUpdate,
    session: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(require_write_access),
) -> ServiceCatalogueOut:
    result = await service_catalogue_service.update_entry(session, entry_id, payload, actor_id=user.id, actor_email=user.email)
    await session.commit()
    return result
