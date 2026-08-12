from uuid import UUID

from sqlalchemy import asc
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.reference_status import resolve_airport_tech_stop_readiness
from app.models.airport import Airport
from app.repositories.audit import write_audit_log
from app.repositories.base import Repository
from app.schemas.airport import AirportCreate, AirportOut, AirportUpdate


def _to_out(airport: Airport) -> AirportOut:
    readiness = resolve_airport_tech_stop_readiness(
        operating_hours=airport.operating_hours,
        is_airport_of_entry=airport.is_airport_of_entry,
        fuel_grades=airport.fuel_grades,
        ops_data_source=airport.ops_data_source,
        ops_data_verified_on=airport.ops_data_verified_on,
    )
    base_fields = {name: getattr(airport, name) for name in AirportOut.model_fields if hasattr(airport, name)}
    return AirportOut(**{**base_fields, "tech_stop_readiness": readiness})


async def list_airports(
    session: AsyncSession, *, page: int, page_size: int, country_iso3: str | None = None
) -> tuple[list[AirportOut], int]:
    repo = Repository(session, Airport, pk_column="icao")
    items, total = await repo.list(
        page=page, page_size=page_size, filters={"country_iso3": country_iso3}, order_by=asc(Airport.name)
    )
    return [_to_out(a) for a in items], total


async def get_airport(session: AsyncSession, icao: str) -> AirportOut:
    repo = Repository(session, Airport, pk_column="icao")
    airport = await repo.get(icao.upper())
    return _to_out(airport)


async def create_airport(session: AsyncSession, payload: AirportCreate, *, actor_id: UUID, actor_email: str) -> AirportOut:
    repo = Repository(session, Airport, pk_column="icao")
    airport = Airport(icao=payload.icao.upper(), **payload.model_dump(exclude={"icao"}))
    created = await repo.create(airport)
    await write_audit_log(
        session,
        actor_user_id=actor_id,
        actor_email=actor_email,
        action="CREATE",
        entity_type="Airport",
        entity_id=created.icao,
        to_value=payload.model_dump(mode="json"),
    )
    return _to_out(created)


async def update_airport(
    session: AsyncSession, icao: str, payload: AirportUpdate, *, actor_id: UUID, actor_email: str
) -> AirportOut:
    repo = Repository(session, Airport, pk_column="icao")
    values = payload.model_dump(exclude={"version"}, exclude_unset=True)
    updated = await repo.update(icao.upper(), payload.version, values)
    await write_audit_log(
        session,
        actor_user_id=actor_id,
        actor_email=actor_email,
        action="UPDATE",
        entity_type="Airport",
        entity_id=updated.icao,
        to_value=values,
    )
    return _to_out(updated)


async def delete_airport(session: AsyncSession, icao: str, version: int, *, actor_id: UUID, actor_email: str) -> None:
    repo = Repository(session, Airport, pk_column="icao")
    await repo.soft_delete(icao.upper(), version)
    await write_audit_log(
        session,
        actor_user_id=actor_id,
        actor_email=actor_email,
        action="DELETE",
        entity_type="Airport",
        entity_id=icao.upper(),
    )
