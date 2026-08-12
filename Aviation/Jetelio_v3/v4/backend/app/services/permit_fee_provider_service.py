from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.reference_status import resolve_nav_fee_provider_status
from app.models.permit_fee_provider import PermitFeeProvider
from app.repositories.audit import write_audit_log
from app.repositories.base import Repository
from app.schemas.permit_fee_provider import PermitFeeProviderCreate, PermitFeeProviderOut, PermitFeeProviderUpdate


def _to_out(provider: PermitFeeProvider) -> PermitFeeProviderOut:
    # Same VERIFIED/UNVERIFIED provenance logic as NavFeeProvider — a rate
    # is never treated as verified just because a row exists.
    status = resolve_nav_fee_provider_status(
        source=provider.source, verified_by=provider.verified_by, verified_on=provider.verified_on
    )
    base_fields = {name: getattr(provider, name) for name in PermitFeeProviderOut.model_fields if hasattr(provider, name)}
    return PermitFeeProviderOut(**{**base_fields, "provider_status": status})


async def list_providers(session: AsyncSession, *, page: int, page_size: int) -> tuple[list[PermitFeeProviderOut], int]:
    repo = Repository(session, PermitFeeProvider)
    items, total = await repo.list(page=page, page_size=page_size)
    return [_to_out(p) for p in items], total


async def create_provider(
    session: AsyncSession, payload: PermitFeeProviderCreate, *, actor_id: UUID, actor_email: str
) -> PermitFeeProviderOut:
    repo = Repository(session, PermitFeeProvider)
    data = payload.model_dump()
    data["country_iso3"] = data["country_iso3"].upper()
    created = await repo.create(PermitFeeProvider(**data))
    await write_audit_log(
        session, actor_user_id=actor_id, actor_email=actor_email, action="CREATE",
        entity_type="PermitFeeProvider", entity_id=str(created.id), to_value=payload.model_dump(mode="json"),
    )
    return _to_out(created)


async def update_provider(
    session: AsyncSession, provider_id: UUID, payload: PermitFeeProviderUpdate, *, actor_id: UUID, actor_email: str
) -> PermitFeeProviderOut:
    repo = Repository(session, PermitFeeProvider)
    values = payload.model_dump(exclude={"version"}, exclude_unset=True)
    updated = await repo.update(provider_id, payload.version, values)
    await write_audit_log(
        session, actor_user_id=actor_id, actor_email=actor_email, action="UPDATE",
        entity_type="PermitFeeProvider", entity_id=str(updated.id), to_value=values,
    )
    return _to_out(updated)
