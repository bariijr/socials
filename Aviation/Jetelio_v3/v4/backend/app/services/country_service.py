from uuid import UUID

from sqlalchemy import asc
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.reference_status import (
    resolve_country_reference_status,
    resolve_effective_lead_time_hours,
    resolve_effective_permit_validity,
)
from app.models.country import Country
from app.repositories.audit import write_audit_log
from app.repositories.base import Repository
from app.schemas.country import CountryCreate, CountryOut, CountryUpdate
from app.services import settings_service


def _to_out(country: Country, settings_map: dict) -> CountryOut:
    reference_status = resolve_country_reference_status(
        standard_lead_time_hours=country.standard_lead_time_hours,
        lead_time_source=country.lead_time_source,
        lead_time_verified_by=country.lead_time_verified_by,
        lead_time_verified_on=country.lead_time_verified_on,
        permit_flags_source=country.permit_flags_source,
        permit_flags_verified_by=country.permit_flags_verified_by,
        permit_flags_verified_on=country.permit_flags_verified_on,
    )
    effective_lead_time = resolve_effective_lead_time_hours(
        country.standard_lead_time_hours, settings_map["default_permit_lead_time_hours"]
    )
    effective_validity = resolve_effective_permit_validity(
        country.permit_validity_amount,
        country.permit_validity_unit.value if country.permit_validity_unit else None,
        settings_map["default_permit_validity_amount"],
        settings_map["default_permit_validity_unit"],
    )
    base_fields = {name: getattr(country, name) for name in CountryOut.model_fields if hasattr(country, name)}
    return CountryOut(
        **{
            **base_fields,
            "reference_status": reference_status,
            "effective_lead_time_hours": effective_lead_time.hours,
            "effective_lead_time_is_fallback": effective_lead_time.is_fallback,
            "effective_permit_validity_amount": effective_validity.amount,
            "effective_permit_validity_unit": effective_validity.unit,
            "effective_permit_validity_is_fallback": effective_validity.is_fallback,
        }
    )


async def list_countries(
    session: AsyncSession, *, page: int, page_size: int, region: str | None = None
) -> tuple[list[CountryOut], int]:
    repo = Repository(session, Country, pk_column="iso3")
    items, total = await repo.list(page=page, page_size=page_size, filters={"region": region}, order_by=asc(Country.name))
    settings_map = await settings_service.get_typed_settings_map(session)
    return [_to_out(c, settings_map) for c in items], total


async def get_country(session: AsyncSession, iso3: str) -> CountryOut:
    repo = Repository(session, Country, pk_column="iso3")
    country = await repo.get(iso3.upper())
    settings_map = await settings_service.get_typed_settings_map(session)
    return _to_out(country, settings_map)


async def create_country(
    session: AsyncSession, payload: CountryCreate, *, actor_id: UUID, actor_email: str
) -> CountryOut:
    repo = Repository(session, Country, pk_column="iso3")
    country = Country(iso3=payload.iso3.upper(), **payload.model_dump(exclude={"iso3"}))
    created = await repo.create(country)
    await write_audit_log(
        session,
        actor_user_id=actor_id,
        actor_email=actor_email,
        action="CREATE",
        entity_type="Country",
        entity_id=created.iso3,
        to_value=payload.model_dump(mode="json"),
    )
    settings_map = await settings_service.get_typed_settings_map(session)
    return _to_out(created, settings_map)


async def update_country(
    session: AsyncSession, iso3: str, payload: CountryUpdate, *, actor_id: UUID, actor_email: str
) -> CountryOut:
    repo = Repository(session, Country, pk_column="iso3")
    before = await repo.get(iso3.upper())
    before_snapshot = {
        "standard_lead_time_hours": before.standard_lead_time_hours,
        "permit_validity_amount": before.permit_validity_amount,
        "permit_validity_unit": before.permit_validity_unit,
    }
    values = payload.model_dump(exclude={"version"}, exclude_unset=True)
    updated = await repo.update(iso3.upper(), payload.version, values)
    await write_audit_log(
        session,
        actor_user_id=actor_id,
        actor_email=actor_email,
        action="UPDATE",
        entity_type="Country",
        entity_id=updated.iso3,
        from_value=before_snapshot,
        to_value=values,
    )
    settings_map = await settings_service.get_typed_settings_map(session)
    return _to_out(updated, settings_map)
