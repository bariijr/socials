from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFoundError
from app.models.document import Credential, Document
from app.repositories.audit import write_audit_log
from app.repositories.base import Repository
from app.schemas.document import CredentialCreate, CredentialOut, CredentialUpdate


async def _document_or_404(session: AsyncSession, document_id: UUID) -> None:
    doc = await session.get(Document, document_id)
    if doc is None or doc.deleted_at is not None:
        raise NotFoundError("Document", document_id)


async def list_credentials(session: AsyncSession, document_id: UUID) -> list[CredentialOut]:
    await _document_or_404(session, document_id)
    rows = (
        await session.execute(
            select(Credential).where(Credential.document_id == document_id, Credential.deleted_at.is_(None))
        )
    ).scalars().all()
    return [CredentialOut.model_validate(c) for c in rows]


async def create_credential(session: AsyncSession, payload: CredentialCreate, *, actor_id: UUID, actor_email: str) -> CredentialOut:
    await _document_or_404(session, payload.document_id)
    repo = Repository(session, Credential)
    created = await repo.create(Credential(**payload.model_dump()))
    await write_audit_log(
        session, actor_user_id=actor_id, actor_email=actor_email, action="CREATE",
        entity_type="Credential", entity_id=str(created.id), to_value=payload.model_dump(mode="json"),
    )
    return CredentialOut.model_validate(created)


async def update_credential(session: AsyncSession, credential_id: UUID, payload: CredentialUpdate, *, actor_id: UUID, actor_email: str) -> CredentialOut:
    repo = Repository(session, Credential)
    values = payload.model_dump(exclude={"version"}, exclude_unset=True)
    updated = await repo.update(credential_id, payload.version, values)
    await write_audit_log(
        session, actor_user_id=actor_id, actor_email=actor_email, action="UPDATE",
        entity_type="Credential", entity_id=str(updated.id), to_value=values,
    )
    return CredentialOut.model_validate(updated)


async def delete_credential(session: AsyncSession, credential_id: UUID, version: int, *, actor_id: UUID, actor_email: str) -> None:
    repo = Repository(session, Credential)
    deleted = await repo.soft_delete(credential_id, version)
    await write_audit_log(
        session, actor_user_id=actor_id, actor_email=actor_email, action="DELETE",
        entity_type="Credential", entity_id=str(deleted.id),
    )
