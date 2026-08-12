from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.reference_status import resolve_nav_fee_provider_status
from app.models.nav_fee_provider import NavFeeProvider
from app.repositories.audit import write_audit_log
from app.repositories.base import Repository
from app.schemas.nav_fee_provider import NavFeeProviderCreate, NavFeeProviderOut, NavFeeProviderUpdate


def _to_out(provider: NavFeeProvider) -> NavFeeProviderOut:
    status = resolve_nav_fee_provider_status(
        source=provider.source, verified_by=provider.verified_by, verified_on=provider.verified_on
    )
    base_fields = {name: getattr(provider, name) for name in NavFeeProviderOut.model_fields if hasattr(provider, name)}
    return NavFeeProviderOut(**{**base_fields, "provider_status": status})


async def list_providers(session: AsyncSession, *, page: int, page_size: int) -> tuple[list[NavFeeProviderOut], int]:
    repo = Repository(session, NavFeeProvider)
    items, total = await repo.list(page=page, page_size=page_size)
    return [_to_out(p) for p in items], total


async def create_provider(
    session: AsyncSession, payload: NavFeeProviderCreate, *, actor_id: UUID, actor_email: str
) -> NavFeeProviderOut:
    repo = Repository(session, NavFeeProvider)
    data = payload.model_dump()
    data["fir_code"] = data["fir_code"].upper()
    created = await repo.create(NavFeeProvider(**data))
    await write_audit_log(
        session, actor_user_id=actor_id, actor_email=actor_email, action="CREATE",
        entity_type="NavFeeProvider", entity_id=str(created.id), to_value=payload.model_dump(mode="json"),
    )
    return _to_out(created)


async def update_provider(
    session: AsyncSession, provider_id: UUID, payload: NavFeeProviderUpdate, *, actor_id: UUID, actor_email: str
) -> NavFeeProviderOut:
    repo = Repository(session, NavFeeProvider)
    values = payload.model_dump(exclude={"version"}, exclude_unset=True)
    updated = await repo.update(provider_id, payload.version, values)
    await write_audit_log(
        session, actor_user_id=actor_id, actor_email=actor_email, action="UPDATE",
        entity_type="NavFeeProvider", entity_id=str(updated.id), to_value=values,
    )
    return _to_out(updated)
