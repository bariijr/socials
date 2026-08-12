from uuid import UUID

from sqlalchemy import asc
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError
from app.domain.reference_status import resolve_aircraft_planning_status
from app.models.aircraft import Aircraft, AircraftPerformance
from app.repositories.audit import write_audit_log
from app.repositories.base import Repository
from app.schemas.aircraft import (
    AircraftCreate,
    AircraftOut,
    AircraftPerformanceCreate,
    AircraftPerformanceOut,
    AircraftPerformanceUpdate,
    AircraftUpdate,
)


def _aircraft_to_out(aircraft: Aircraft) -> AircraftOut:
    base_fields = {name: getattr(aircraft, name) for name in AircraftOut.model_fields if hasattr(aircraft, name)}
    return AircraftOut(**base_fields)


async def list_aircraft(
    session: AsyncSession, *, page: int, page_size: int, operator_id: UUID | None = None
) -> tuple[list[AircraftOut], int]:
    repo = Repository(session, Aircraft)
    items, total = await repo.list(
        page=page, page_size=page_size, filters={"operator_id": operator_id}, order_by=asc(Aircraft.registration)
    )
    return [_aircraft_to_out(a) for a in items], total


async def get_aircraft(session: AsyncSession, aircraft_id: UUID) -> AircraftOut:
    repo = Repository(session, Aircraft)
    return _aircraft_to_out(await repo.get(aircraft_id))


async def create_aircraft(
    session: AsyncSession, payload: AircraftCreate, *, actor_id: UUID, actor_email: str
) -> AircraftOut:
    repo = Repository(session, Aircraft)
    aircraft = Aircraft(**payload.model_dump())
    try:
        created = await repo.create(aircraft)
    except IntegrityError as exc:
        await session.rollback()
        raise ConflictError(f"registration {payload.registration!r} already exists") from exc
    await write_audit_log(
        session,
        actor_user_id=actor_id,
        actor_email=actor_email,
        action="CREATE",
        entity_type="Aircraft",
        entity_id=str(created.id),
        to_value=payload.model_dump(mode="json"),
    )
    return _aircraft_to_out(created)


async def update_aircraft(
    session: AsyncSession, aircraft_id: UUID, payload: AircraftUpdate, *, actor_id: UUID, actor_email: str
) -> AircraftOut:
    repo = Repository(session, Aircraft)
    values = payload.model_dump(exclude={"version"}, exclude_unset=True)
    updated = await repo.update(aircraft_id, payload.version, values)
    await write_audit_log(
        session,
        actor_user_id=actor_id,
        actor_email=actor_email,
        action="UPDATE",
        entity_type="Aircraft",
        entity_id=str(updated.id),
        to_value=values,
    )
    return _aircraft_to_out(updated)


async def delete_aircraft(
    session: AsyncSession, aircraft_id: UUID, version: int, *, actor_id: UUID, actor_email: str
) -> None:
    repo = Repository(session, Aircraft)
    await repo.soft_delete(aircraft_id, version)
    await write_audit_log(
        session,
        actor_user_id=actor_id,
        actor_email=actor_email,
        action="DELETE",
        entity_type="Aircraft",
        entity_id=str(aircraft_id),
    )


def _performance_to_out(perf: AircraftPerformance, reserve_margin_setting: float) -> AircraftPerformanceOut:
    status = resolve_aircraft_planning_status(
        verified=perf.verified, verified_by=perf.verified_by, verified_on=perf.verified_on
    )
    margin = perf.reserve_safety_margin if perf.reserve_safety_margin is not None else reserve_margin_setting
    practical_range = perf.max_range_nm * (1 - margin) if perf.max_range_nm is not None else None
    base_fields = {name: getattr(perf, name) for name in AircraftPerformanceOut.model_fields if hasattr(perf, name)}
    return AircraftPerformanceOut(
        **{**base_fields, "planning_status": status, "practical_range_nm": practical_range}
    )


async def list_aircraft_performance(
    session: AsyncSession, *, page: int, page_size: int, reserve_margin_setting: float
) -> tuple[list[AircraftPerformanceOut], int]:
    repo = Repository(session, AircraftPerformance, pk_column="icao_type")
    items, total = await repo.list(page=page, page_size=page_size, order_by=asc(AircraftPerformance.icao_type))
    return [_performance_to_out(p, reserve_margin_setting) for p in items], total


async def get_aircraft_performance(
    session: AsyncSession, icao_type: str, *, reserve_margin_setting: float
) -> AircraftPerformanceOut:
    repo = Repository(session, AircraftPerformance, pk_column="icao_type")
    perf = await repo.get(icao_type.upper())
    return _performance_to_out(perf, reserve_margin_setting)


async def create_aircraft_performance(
    session: AsyncSession,
    payload: AircraftPerformanceCreate,
    *,
    reserve_margin_setting: float,
    actor_id: UUID,
    actor_email: str,
) -> AircraftPerformanceOut:
    repo = Repository(session, AircraftPerformance, pk_column="icao_type")
    perf = AircraftPerformance(icao_type=payload.icao_type.upper(), **payload.model_dump(exclude={"icao_type"}))
    created = await repo.create(perf)
    await write_audit_log(
        session,
        actor_user_id=actor_id,
        actor_email=actor_email,
        action="CREATE",
        entity_type="AircraftPerformance",
        entity_id=created.icao_type,
        to_value=payload.model_dump(mode="json"),
    )
    return _performance_to_out(created, reserve_margin_setting)


async def update_aircraft_performance(
    session: AsyncSession,
    icao_type: str,
    payload: AircraftPerformanceUpdate,
    *,
    reserve_margin_setting: float,
    actor_id: UUID,
    actor_email: str,
) -> AircraftPerformanceOut:
    repo = Repository(session, AircraftPerformance, pk_column="icao_type")
    values = payload.model_dump(exclude={"version"}, exclude_unset=True)
    updated = await repo.update(icao_type.upper(), payload.version, values)
    await write_audit_log(
        session,
        actor_user_id=actor_id,
        actor_email=actor_email,
        action="UPDATE",
        entity_type="AircraftPerformance",
        entity_id=updated.icao_type,
        to_value=values,
    )
    return _performance_to_out(updated, reserve_margin_setting)
