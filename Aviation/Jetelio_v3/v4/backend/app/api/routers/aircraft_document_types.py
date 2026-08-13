from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_current_user, require_write_access
from app.database import get_db
from app.schemas.aircraft_document_type import (
    AircraftDocumentTypeCreate,
    AircraftDocumentTypeOut,
    AircraftDocumentTypeUpdate,
)
from app.services import aircraft_document_type_service

router = APIRouter(prefix="/aircraft-document-types", tags=["reference-data"])


@router.get("", response_model=list[AircraftDocumentTypeOut])
async def list_types(
    session: AsyncSession = Depends(get_db), _user: CurrentUser = Depends(get_current_user)
) -> list[AircraftDocumentTypeOut]:
    return await aircraft_document_type_service.list_types(session)


@router.post("", response_model=AircraftDocumentTypeOut, status_code=201)
async def create_type(
    payload: AircraftDocumentTypeCreate,
    session: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(require_write_access),
) -> AircraftDocumentTypeOut:
    result = await aircraft_document_type_service.create_type(session, payload, actor_id=user.id, actor_email=user.email)
    await session.commit()
    return result


@router.patch("/{type_id}", response_model=AircraftDocumentTypeOut)
async def update_type(
    type_id: UUID,
    payload: AircraftDocumentTypeUpdate,
    session: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(require_write_access),
) -> AircraftDocumentTypeOut:
    result = await aircraft_document_type_service.update_type(session, type_id, payload, actor_id=user.id, actor_email=user.email)
    await session.commit()
    return result
