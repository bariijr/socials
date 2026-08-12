from uuid import UUID

from sqlalchemy import asc
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.billing_ref import next_billing_ref
from app.models.client import Client
from app.repositories.audit import write_audit_log
from app.repositories.base import Repository
from app.schemas.client import ClientCreate, ClientOut, ClientUpdate


def _to_out(client: Client) -> ClientOut:
    return ClientOut(**{name: getattr(client, name) for name in ClientOut.model_fields if hasattr(client, name)})


async def list_clients(
    session: AsyncSession, *, page: int, page_size: int, operator_id: UUID | None = None
) -> tuple[list[ClientOut], int]:
    repo = Repository(session, Client)
    items, total = await repo.list(
        page=page, page_size=page_size, filters={"operator_id": operator_id}, order_by=asc(Client.bill_to_legal_name)
    )
    return [_to_out(c) for c in items], total


async def get_client(session: AsyncSession, client_id: UUID) -> ClientOut:
    repo = Repository(session, Client)
    return _to_out(await repo.get(client_id))


async def create_client(session: AsyncSession, payload: ClientCreate, *, actor_id: UUID, actor_email: str) -> ClientOut:
    repo = Repository(session, Client)
    billing_ref = await next_billing_ref(session, sequence_name="clients_billing_ref_seq", prefix="CLI")
    created = await repo.create(Client(**payload.model_dump(), billing_ref=billing_ref))
    await write_audit_log(
        session,
        actor_user_id=actor_id,
        actor_email=actor_email,
        action="CREATE",
        entity_type="Client",
        entity_id=str(created.id),
        to_value=payload.model_dump(mode="json"),
    )
    return _to_out(created)


async def update_client(
    session: AsyncSession, client_id: UUID, payload: ClientUpdate, *, actor_id: UUID, actor_email: str
) -> ClientOut:
    repo = Repository(session, Client)
    values = payload.model_dump(exclude={"version"}, exclude_unset=True)
    updated = await repo.update(client_id, payload.version, values)
    await write_audit_log(
        session,
        actor_user_id=actor_id,
        actor_email=actor_email,
        action="UPDATE",
        entity_type="Client",
        entity_id=str(updated.id),
        to_value=values,
    )
    return _to_out(updated)


async def delete_client(session: AsyncSession, client_id: UUID, version: int, *, actor_id: UUID, actor_email: str) -> None:
    repo = Repository(session, Client)
    await repo.soft_delete(client_id, version)
    await write_audit_log(
        session,
        actor_user_id=actor_id,
        actor_email=actor_email,
        action="DELETE",
        entity_type="Client",
        entity_id=str(client_id),
    )
