from uuid import UUID

from fastapi import APIRouter, Depends

from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_current_user, require_delete_access, require_write_access
from app.database import get_db
from app.schemas.service_message import ServiceMessageCreate, ServiceMessageOut
from app.services import service_message_service

router = APIRouter(prefix="/trips/{trip_id}/legs/{leg_id}/services/{service_code}/{icao}/messages", tags=["trips"])


@router.get("", response_model=list[ServiceMessageOut])
async def list_messages(
    trip_id: UUID,
    leg_id: UUID,
    service_code: str,
    icao: str,
    session: AsyncSession = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
) -> list[ServiceMessageOut]:
    return await service_message_service.list_messages(session, trip_id, leg_id, service_code, icao)


@router.post("", response_model=ServiceMessageOut, status_code=201)
async def create_message(
    trip_id: UUID,
    leg_id: UUID,
    service_code: str,
    icao: str,
    payload: ServiceMessageCreate,
    session: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(require_write_access),
) -> ServiceMessageOut:
    result = await service_message_service.create_message(
        session, trip_id, leg_id, service_code, icao, payload, actor_id=user.id, actor_email=user.email
    )
    await session.commit()
    return result


@router.delete("/{message_id}", status_code=204)
async def delete_message(
    trip_id: UUID,
    leg_id: UUID,
    service_code: str,
    icao: str,
    message_id: UUID,
    version: int,
    session: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(require_delete_access),
) -> None:
    await service_message_service.delete_message(session, trip_id, leg_id, service_code, icao, message_id, version)
    await session.commit()
