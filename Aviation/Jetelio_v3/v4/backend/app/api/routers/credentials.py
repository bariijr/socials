from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_current_user, require_delete_access, require_write_access
from app.database import get_db
from app.schemas.document import CredentialCreate, CredentialOut, CredentialUpdate
from app.services import credential_service

router = APIRouter(prefix="/credentials", tags=["reference-data"])


@router.get("", response_model=list[CredentialOut])
async def list_credentials(
    document_id: UUID, session: AsyncSession = Depends(get_db), _user: CurrentUser = Depends(get_current_user)
) -> list[CredentialOut]:
    return await credential_service.list_credentials(session, document_id)


@router.post("", response_model=CredentialOut, status_code=201)
async def create_credential(
    payload: CredentialCreate, session: AsyncSession = Depends(get_db), user: CurrentUser = Depends(require_write_access)
) -> CredentialOut:
    result = await credential_service.create_credential(session, payload, actor_id=user.id, actor_email=user.email)
    await session.commit()
    return result


@router.patch("/{credential_id}", response_model=CredentialOut)
async def update_credential(
    credential_id: UUID,
    payload: CredentialUpdate,
    session: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(require_write_access),
) -> CredentialOut:
    result = await credential_service.update_credential(session, credential_id, payload, actor_id=user.id, actor_email=user.email)
    await session.commit()
    return result


@router.delete("/{credential_id}", status_code=204)
async def delete_credential(
    credential_id: UUID,
    version: int,
    session: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(require_delete_access),
) -> None:
    await credential_service.delete_credential(session, credential_id, version, actor_id=user.id, actor_email=user.email)
    await session.commit()
