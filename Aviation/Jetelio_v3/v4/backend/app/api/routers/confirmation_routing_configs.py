from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_current_user, require_delete_access, require_write_access
from app.database import get_db
from app.models.service_delivery import ConfirmationTargetRole
from app.schemas.common import Page
from app.schemas.service_delivery import (
    ConfirmationRoutingConfigCreate,
    ConfirmationRoutingConfigOut,
    ConfirmationRoutingConfigUpdate,
    ConfirmationRoutingResolvedOut,
)
from app.services import service_delivery_service

router = APIRouter(tags=["reference-data"])


@router.get("/confirmation-routing-configs", response_model=Page[ConfirmationRoutingConfigOut])
async def list_confirmation_routing_configs(
    trip_id: UUID | None = None,
    operator_id: UUID | None = None,
    page: int = 1,
    page_size: int = Query(default=50, le=500),
    session: AsyncSession = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
) -> Page[ConfirmationRoutingConfigOut]:
    items, total = await service_delivery_service.list_confirmation_routing_configs(
        session, page=page, page_size=page_size, trip_id=trip_id, operator_id=operator_id
    )
    return Page(items=items, total=total, page=page, page_size=page_size)


@router.get("/confirmation-routing-configs/resolve", response_model=ConfirmationRoutingResolvedOut)
async def resolve_confirmation_routing_config(
    leg_id: UUID,
    target_role: ConfirmationTargetRole,
    operator_id: UUID | None = None,
    session: AsyncSession = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
) -> ConfirmationRoutingResolvedOut:
    """Where should this service confirmation be routed, for this leg and
    target role? Never guesses — returns `config: null` when nothing scoped
    to this leg/trip/operator matches."""
    return await service_delivery_service.resolve_confirmation_routing(
        session, leg_id=leg_id, target_role=target_role, operator_id=operator_id
    )


@router.post("/confirmation-routing-configs", response_model=ConfirmationRoutingConfigOut, status_code=201)
async def create_confirmation_routing_config(
    payload: ConfirmationRoutingConfigCreate, session: AsyncSession = Depends(get_db), user: CurrentUser = Depends(require_write_access)
) -> ConfirmationRoutingConfigOut:
    result = await service_delivery_service.create_confirmation_routing_config(session, payload, actor_id=user.id, actor_email=user.email)
    await session.commit()
    return result


@router.patch("/confirmation-routing-configs/{config_id}", response_model=ConfirmationRoutingConfigOut)
async def update_confirmation_routing_config(
    config_id: UUID,
    payload: ConfirmationRoutingConfigUpdate,
    session: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(require_write_access),
) -> ConfirmationRoutingConfigOut:
    result = await service_delivery_service.update_confirmation_routing_config(session, config_id, payload, actor_id=user.id, actor_email=user.email)
    await session.commit()
    return result


@router.delete("/confirmation-routing-configs/{config_id}", status_code=204)
async def delete_confirmation_routing_config(
    config_id: UUID,
    version: int,
    session: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(require_delete_access),
) -> None:
    await service_delivery_service.delete_confirmation_routing_config(session, config_id, version, actor_id=user.id, actor_email=user.email)
    await session.commit()
