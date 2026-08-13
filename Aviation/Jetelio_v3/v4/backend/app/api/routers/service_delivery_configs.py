from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_current_user, require_delete_access, require_write_access
from app.database import get_db
from app.schemas.common import Page
from app.schemas.service_delivery import (
    ServiceDeliveryConfigCreate,
    ServiceDeliveryConfigOut,
    ServiceDeliveryConfigUpdate,
    ServiceDeliveryResolvedOut,
)
from app.services import service_delivery_service

router = APIRouter(tags=["reference-data"])


@router.get("/service-delivery-configs", response_model=Page[ServiceDeliveryConfigOut])
async def list_service_delivery_configs(
    trip_id: UUID | None = None,
    operator_id: UUID | None = None,
    page: int = 1,
    page_size: int = Query(default=50, le=500),
    session: AsyncSession = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
) -> Page[ServiceDeliveryConfigOut]:
    items, total = await service_delivery_service.list_service_delivery_configs(
        session, page=page, page_size=page_size, trip_id=trip_id, operator_id=operator_id
    )
    return Page(items=items, total=total, page=page, page_size=page_size)


@router.get("/service-delivery-configs/resolve", response_model=ServiceDeliveryResolvedOut)
async def resolve_service_delivery_config(
    leg_id: UUID,
    service_code: str,
    operator_id: UUID | None = None,
    country_iso3: str | None = None,
    session: AsyncSession = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
) -> ServiceDeliveryResolvedOut:
    """Which vendor + channels should this service request be sent through,
    for this leg? Never guesses — returns `config: null` when nothing
    scoped to this leg/trip/operator matches (unless country_iso3 falls
    back to a VendorCoverageCountry match — task #115, permits)."""
    return await service_delivery_service.resolve_service_delivery(
        session, leg_id=leg_id, service_code=service_code, operator_id=operator_id, country_iso3=country_iso3
    )


@router.post("/service-delivery-configs", response_model=ServiceDeliveryConfigOut, status_code=201)
async def create_service_delivery_config(
    payload: ServiceDeliveryConfigCreate, session: AsyncSession = Depends(get_db), user: CurrentUser = Depends(require_write_access)
) -> ServiceDeliveryConfigOut:
    result = await service_delivery_service.create_service_delivery_config(session, payload, actor_id=user.id, actor_email=user.email)
    await session.commit()
    return result


@router.patch("/service-delivery-configs/{config_id}", response_model=ServiceDeliveryConfigOut)
async def update_service_delivery_config(
    config_id: UUID,
    payload: ServiceDeliveryConfigUpdate,
    session: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(require_write_access),
) -> ServiceDeliveryConfigOut:
    result = await service_delivery_service.update_service_delivery_config(session, config_id, payload, actor_id=user.id, actor_email=user.email)
    await session.commit()
    return result


@router.delete("/service-delivery-configs/{config_id}", status_code=204)
async def delete_service_delivery_config(
    config_id: UUID,
    version: int,
    session: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(require_delete_access),
) -> None:
    await service_delivery_service.delete_service_delivery_config(session, config_id, version, actor_id=user.id, actor_email=user.email)
    await session.commit()
