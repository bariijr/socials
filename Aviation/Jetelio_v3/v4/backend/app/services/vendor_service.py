from uuid import UUID

from sqlalchemy import asc
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.billing_ref import next_billing_ref
from app.models.vendor import Vendor, VendorCoverageAirport, VendorCoverageCountry
from app.repositories.audit import write_audit_log
from app.repositories.base import Repository
from app.schemas.vendor import (
    VendorCoverageAirportCreate,
    VendorCoverageAirportOut,
    VendorCoverageCountryCreate,
    VendorCoverageCountryOut,
    VendorCreate,
    VendorOut,
    VendorUpdate,
)


def _to_out(vendor: Vendor) -> VendorOut:
    return VendorOut(**{name: getattr(vendor, name) for name in VendorOut.model_fields if hasattr(vendor, name)})


async def list_vendors(session: AsyncSession, *, page: int, page_size: int) -> tuple[list[VendorOut], int]:
    repo = Repository(session, Vendor)
    items, total = await repo.list(page=page, page_size=page_size, order_by=asc(Vendor.name))
    return [_to_out(v) for v in items], total


async def get_vendor(session: AsyncSession, vendor_id: UUID) -> VendorOut:
    repo = Repository(session, Vendor)
    return _to_out(await repo.get(vendor_id))


async def create_vendor(session: AsyncSession, payload: VendorCreate, *, actor_id: UUID, actor_email: str) -> VendorOut:
    repo = Repository(session, Vendor)
    billing_ref = await next_billing_ref(session, sequence_name="vendors_billing_ref_seq", prefix="VEN")
    created = await repo.create(Vendor(**payload.model_dump(), billing_ref=billing_ref))
    await write_audit_log(
        session, actor_user_id=actor_id, actor_email=actor_email, action="CREATE",
        entity_type="Vendor", entity_id=str(created.id), to_value=payload.model_dump(mode="json"),
    )
    return _to_out(created)


async def update_vendor(
    session: AsyncSession, vendor_id: UUID, payload: VendorUpdate, *, actor_id: UUID, actor_email: str
) -> VendorOut:
    repo = Repository(session, Vendor)
    values = payload.model_dump(exclude={"version"}, exclude_unset=True)
    updated = await repo.update(vendor_id, payload.version, values)
    await write_audit_log(
        session, actor_user_id=actor_id, actor_email=actor_email, action="UPDATE",
        entity_type="Vendor", entity_id=str(updated.id), to_value=values,
    )
    return _to_out(updated)


async def delete_vendor(session: AsyncSession, vendor_id: UUID, version: int, *, actor_id: UUID, actor_email: str) -> None:
    repo = Repository(session, Vendor)
    await repo.soft_delete(vendor_id, version)
    await write_audit_log(
        session, actor_user_id=actor_id, actor_email=actor_email, action="DELETE",
        entity_type="Vendor", entity_id=str(vendor_id),
    )


# --- Coverage: airport level ---

async def list_coverage_airports(
    session: AsyncSession, *, page: int, page_size: int, icao: str | None = None, vendor_id: UUID | None = None
) -> tuple[list[VendorCoverageAirportOut], int]:
    repo = Repository(session, VendorCoverageAirport)
    filters = {"icao": icao.upper() if icao else None, "vendor_id": vendor_id}
    items, total = await repo.list(page=page, page_size=page_size, filters=filters)
    return [
        VendorCoverageAirportOut(**{n: getattr(i, n) for n in VendorCoverageAirportOut.model_fields}) for i in items
    ], total


async def create_coverage_airport(
    session: AsyncSession, payload: VendorCoverageAirportCreate, *, actor_id: UUID, actor_email: str
) -> VendorCoverageAirportOut:
    repo = Repository(session, VendorCoverageAirport)
    data = payload.model_dump()
    data["icao"] = data["icao"].upper()
    created = await repo.create(VendorCoverageAirport(**data))
    await write_audit_log(
        session, actor_user_id=actor_id, actor_email=actor_email, action="CREATE",
        entity_type="VendorCoverageAirport", entity_id=str(created.id), to_value=payload.model_dump(mode="json"),
    )
    return VendorCoverageAirportOut(**{n: getattr(created, n) for n in VendorCoverageAirportOut.model_fields})


# --- Coverage: country level ---

async def list_coverage_countries(
    session: AsyncSession, *, page: int, page_size: int, country_iso3: str | None = None, vendor_id: UUID | None = None
) -> tuple[list[VendorCoverageCountryOut], int]:
    repo = Repository(session, VendorCoverageCountry)
    filters = {"country_iso3": country_iso3.upper() if country_iso3 else None, "vendor_id": vendor_id}
    items, total = await repo.list(page=page, page_size=page_size, filters=filters)
    return [
        VendorCoverageCountryOut(**{n: getattr(i, n) for n in VendorCoverageCountryOut.model_fields}) for i in items
    ], total


async def create_coverage_country(
    session: AsyncSession, payload: VendorCoverageCountryCreate, *, actor_id: UUID, actor_email: str
) -> VendorCoverageCountryOut:
    repo = Repository(session, VendorCoverageCountry)
    data = payload.model_dump()
    data["country_iso3"] = data["country_iso3"].upper()
    created = await repo.create(VendorCoverageCountry(**data))
    await write_audit_log(
        session, actor_user_id=actor_id, actor_email=actor_email, action="CREATE",
        entity_type="VendorCoverageCountry", entity_id=str(created.id), to_value=payload.model_dump(mode="json"),
    )
    return VendorCoverageCountryOut(**{n: getattr(created, n) for n in VendorCoverageCountryOut.model_fields})
