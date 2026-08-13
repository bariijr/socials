"""CRUD + scope-precedence resolution for ServiceDeliveryConfig and
ConfirmationRoutingConfig (task #86). Resolution assembly only — the
actual leg > trip > operator decision is app.domain.service_delivery's
job; this layer's only responsibility is fetching every candidate row
that could plausibly apply (same leg, same trip, or the given operator)
and handing them to the pure resolver.
"""

from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFoundError
from app.domain.service_delivery import (
    ConfirmationRoutingCandidate,
    ServiceDeliveryCandidate,
    resolve_confirmation_routing_config,
    resolve_service_delivery_config,
)
from app.models.service_delivery import ConfirmationRoutingConfig, ConfirmationTargetRole, ServiceDeliveryConfig
from app.models.trip import TripLeg
from app.models.vendor import VendorCoverageCountry
from app.repositories.audit import write_audit_log
from app.repositories.base import Repository
from app.schemas.service_delivery import (
    ConfirmationRoutingConfigCreate,
    ConfirmationRoutingConfigOut,
    ConfirmationRoutingConfigUpdate,
    ConfirmationRoutingResolvedOut,
    ServiceDeliveryConfigCreate,
    ServiceDeliveryConfigOut,
    ServiceDeliveryConfigUpdate,
    ServiceDeliveryResolvedOut,
)


def _matched_scope(row) -> str:
    if row.leg_id is not None:
        return "LEG"
    if row.trip_id is not None:
        return "TRIP"
    return "OPERATOR"


async def _leg_and_trip_id(session: AsyncSession, leg_id: UUID) -> tuple[TripLeg, UUID]:
    leg = await session.get(TripLeg, leg_id)
    if leg is None or leg.deleted_at is not None:
        raise NotFoundError("TripLeg", leg_id)
    return leg, leg.trip_id


# --- ServiceDeliveryConfig -----------------------------------------------


async def list_service_delivery_configs(
    session: AsyncSession, *, page: int, page_size: int, trip_id: UUID | None = None, operator_id: UUID | None = None
) -> tuple[list[ServiceDeliveryConfigOut], int]:
    repo = Repository(session, ServiceDeliveryConfig)
    filters = {}
    if trip_id is not None:
        filters["trip_id"] = trip_id
    if operator_id is not None:
        filters["operator_id"] = operator_id
    items, total = await repo.list(page=page, page_size=page_size, filters=filters)
    return [ServiceDeliveryConfigOut.model_validate(c) for c in items], total


async def create_service_delivery_config(
    session: AsyncSession, payload: ServiceDeliveryConfigCreate, *, actor_id: UUID, actor_email: str
) -> ServiceDeliveryConfigOut:
    repo = Repository(session, ServiceDeliveryConfig)
    created = await repo.create(ServiceDeliveryConfig(**payload.model_dump()))
    await write_audit_log(
        session, actor_user_id=actor_id, actor_email=actor_email, action="CREATE",
        entity_type="ServiceDeliveryConfig", entity_id=str(created.id), to_value=payload.model_dump(mode="json"),
    )
    return ServiceDeliveryConfigOut.model_validate(created)


async def update_service_delivery_config(
    session: AsyncSession, config_id: UUID, payload: ServiceDeliveryConfigUpdate, *, actor_id: UUID, actor_email: str
) -> ServiceDeliveryConfigOut:
    repo = Repository(session, ServiceDeliveryConfig)
    values = payload.model_dump(exclude={"version"}, exclude_unset=True)
    updated = await repo.update(config_id, payload.version, values)
    await write_audit_log(
        session, actor_user_id=actor_id, actor_email=actor_email, action="UPDATE",
        entity_type="ServiceDeliveryConfig", entity_id=str(updated.id), to_value=values,
    )
    return ServiceDeliveryConfigOut.model_validate(updated)


async def delete_service_delivery_config(session: AsyncSession, config_id: UUID, version: int, *, actor_id: UUID, actor_email: str) -> None:
    repo = Repository(session, ServiceDeliveryConfig)
    deleted = await repo.soft_delete(config_id, version)
    await write_audit_log(
        session, actor_user_id=actor_id, actor_email=actor_email, action="DELETE",
        entity_type="ServiceDeliveryConfig", entity_id=str(deleted.id),
    )


async def resolve_service_delivery(
    session: AsyncSession, *, leg_id: UUID, service_code: str, operator_id: UUID | None, country_iso3: str | None = None
) -> ServiceDeliveryResolvedOut:
    _leg, trip_id = await _leg_and_trip_id(session, leg_id)

    conditions = [ServiceDeliveryConfig.leg_id == leg_id, ServiceDeliveryConfig.trip_id == trip_id]
    if operator_id is not None:
        conditions.append(ServiceDeliveryConfig.operator_id == operator_id)
    rows = (
        await session.execute(
            select(ServiceDeliveryConfig).where(ServiceDeliveryConfig.deleted_at.is_(None), or_(*conditions))
        )
    ).scalars().all()

    candidates = [
        ServiceDeliveryCandidate(
            id=str(r.id),
            leg_id=str(r.leg_id) if r.leg_id else None,
            trip_id=str(r.trip_id) if r.trip_id else None,
            operator_id=str(r.operator_id) if r.operator_id else None,
            service_code=r.service_code,
        )
        for r in rows
    ]
    best = resolve_service_delivery_config(candidates, requested_service_code=service_code)
    if best is not None:
        matched_row = next(r for r in rows if str(r.id) == best.id)
        return ServiceDeliveryResolvedOut(config=ServiceDeliveryConfigOut.model_validate(matched_row), matched_scope=_matched_scope(matched_row))

    # No explicit ServiceDeliveryConfig matched — fall back to
    # VendorCoverageCountry for country-keyed requests (task #115,
    # overflight/landing permits with no natural leg/trip/operator-scoped
    # config). An admin can still override this by creating a real
    # ServiceDeliveryConfig, which is always tried first, above. No
    # VendorCoverageCountry row either → honestly nothing resolved, same
    # as the existing "nothing configured" path.
    if country_iso3 is not None:
        coverage_rows = (
            await session.execute(
                select(VendorCoverageCountry)
                .where(VendorCoverageCountry.country_iso3 == country_iso3, VendorCoverageCountry.deleted_at.is_(None))
                .order_by(VendorCoverageCountry.has_caa_direct_account.desc())
            )
        ).scalars().all()
        if coverage_rows:
            return ServiceDeliveryResolvedOut(config=None, matched_scope="COUNTRY_COVERAGE", fallback_vendor_id=coverage_rows[0].vendor_id)

    return ServiceDeliveryResolvedOut(config=None, matched_scope=None)


# --- ConfirmationRoutingConfig --------------------------------------------


async def list_confirmation_routing_configs(
    session: AsyncSession, *, page: int, page_size: int, trip_id: UUID | None = None, operator_id: UUID | None = None
) -> tuple[list[ConfirmationRoutingConfigOut], int]:
    repo = Repository(session, ConfirmationRoutingConfig)
    filters = {}
    if trip_id is not None:
        filters["trip_id"] = trip_id
    if operator_id is not None:
        filters["operator_id"] = operator_id
    items, total = await repo.list(page=page, page_size=page_size, filters=filters)
    return [ConfirmationRoutingConfigOut.model_validate(c) for c in items], total


async def create_confirmation_routing_config(
    session: AsyncSession, payload: ConfirmationRoutingConfigCreate, *, actor_id: UUID, actor_email: str
) -> ConfirmationRoutingConfigOut:
    repo = Repository(session, ConfirmationRoutingConfig)
    created = await repo.create(ConfirmationRoutingConfig(**payload.model_dump()))
    await write_audit_log(
        session, actor_user_id=actor_id, actor_email=actor_email, action="CREATE",
        entity_type="ConfirmationRoutingConfig", entity_id=str(created.id), to_value=payload.model_dump(mode="json"),
    )
    return ConfirmationRoutingConfigOut.model_validate(created)


async def update_confirmation_routing_config(
    session: AsyncSession, config_id: UUID, payload: ConfirmationRoutingConfigUpdate, *, actor_id: UUID, actor_email: str
) -> ConfirmationRoutingConfigOut:
    repo = Repository(session, ConfirmationRoutingConfig)
    values = payload.model_dump(exclude={"version"}, exclude_unset=True)
    updated = await repo.update(config_id, payload.version, values)
    await write_audit_log(
        session, actor_user_id=actor_id, actor_email=actor_email, action="UPDATE",
        entity_type="ConfirmationRoutingConfig", entity_id=str(updated.id), to_value=values,
    )
    return ConfirmationRoutingConfigOut.model_validate(updated)


async def delete_confirmation_routing_config(session: AsyncSession, config_id: UUID, version: int, *, actor_id: UUID, actor_email: str) -> None:
    repo = Repository(session, ConfirmationRoutingConfig)
    deleted = await repo.soft_delete(config_id, version)
    await write_audit_log(
        session, actor_user_id=actor_id, actor_email=actor_email, action="DELETE",
        entity_type="ConfirmationRoutingConfig", entity_id=str(deleted.id),
    )


async def resolve_confirmation_routing(
    session: AsyncSession, *, leg_id: UUID, target_role: ConfirmationTargetRole, operator_id: UUID | None
) -> ConfirmationRoutingResolvedOut:
    _leg, trip_id = await _leg_and_trip_id(session, leg_id)

    conditions = [ConfirmationRoutingConfig.leg_id == leg_id, ConfirmationRoutingConfig.trip_id == trip_id]
    if operator_id is not None:
        conditions.append(ConfirmationRoutingConfig.operator_id == operator_id)
    rows = (
        await session.execute(
            select(ConfirmationRoutingConfig).where(
                ConfirmationRoutingConfig.deleted_at.is_(None),
                ConfirmationRoutingConfig.target_role == target_role,
                or_(*conditions),
            )
        )
    ).scalars().all()

    candidates = [
        ConfirmationRoutingCandidate(
            id=str(r.id),
            leg_id=str(r.leg_id) if r.leg_id else None,
            trip_id=str(r.trip_id) if r.trip_id else None,
            operator_id=str(r.operator_id) if r.operator_id else None,
        )
        for r in rows
    ]
    best = resolve_confirmation_routing_config(candidates)
    if best is None:
        return ConfirmationRoutingResolvedOut(config=None, matched_scope=None)
    matched_row = next(r for r in rows if str(r.id) == best.id)
    return ConfirmationRoutingResolvedOut(config=ConfirmationRoutingConfigOut.model_validate(matched_row), matched_scope=_matched_scope(matched_row))
