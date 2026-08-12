"""The reference-sheet loading sequence, shared by the CLI importer
(app.importer.cli, full workbook + geometry, run at deploy time) and the
admin upload endpoint (app.api.routers.data_import, reference sheets only —
country/FIR polygons are a Natural Earth/VATSpy asset that doesn't come
from the workbook and isn't re-loaded on every admin upload).

Order matters: countries must load before anything that references
countries_index (airports, operators before aircraft/clients, vendors
before vendor coverage), matching the dependency chain the original
cli.py encoded inline.
"""

from openpyxl.workbook.workbook import Workbook
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.importer import geo_loader
from app.importer.loaders.aircraft import load_aircraft, load_aircraft_performance
from app.importer.loaders.airports import load_airports
from app.importer.loaders.clients import load_clients
from app.importer.loaders.countries import load_countries
from app.importer.loaders.country_requirements import load_country_requirements
from app.importer.loaders.messaging import load_message_templates
from app.importer.loaders.operators import load_operators
from app.importer.loaders.service_catalogue import load_service_catalogue
from app.importer.loaders.settings_sync import sync_settings_from_admin_sheet
from app.importer.loaders.users import load_users
from app.importer.loaders.vendors import load_vendor_coverage_airports, load_vendor_coverage_countries, load_vendors
from app.importer.loaders.visa import load_visa_matrix, load_visa_rules
from app.importer.lookups import RefIndex
from app.models.aircraft import AircraftPerformance
from app.models.airport import Airport
from app.models.client import Client
from app.schemas.readiness import ImportSheetResult
from app.services import settings_service


async def run_reference_import(
    session: AsyncSession,
    wb: Workbook,
    *,
    nationality_lookup: dict[str, str],
    iso3_to_iso2_fallback: dict[str, str],
    geo_dir: str | None,
) -> list[ImportSheetResult]:
    """geo_dir=None skips country/FIR polygon (re)loading — see module
    docstring. Caller owns the transaction (commit/rollback).
    """
    sheets: list[ImportSheetResult] = []
    await settings_service.ensure_seeded(session)

    countries_result, countries_index = await load_countries(session, wb["countries"], iso3_to_iso2_fallback)
    sheets.append(countries_result)

    if geo_dir is not None:
        sheets.append(await geo_loader.load_country_geometry(session, geo_dir, countries_index))
        sheets.append(await geo_loader.load_fir_boundaries(session, geo_dir))

    sheets.append(await load_airports(session, wb["airports"], countries_index))
    known_icaos = {row.icao for row in (await session.execute(select(Airport))).scalars().all()}

    operators_result, operators_index = await load_operators(session, wb["Operators"])
    sheets.append(operators_result)

    sheets.append(await load_aircraft_performance(session, wb["AIRCRAFT PERFORMANCE"]))
    known_icao_types = {row.icao_type for row in (await session.execute(select(AircraftPerformance))).scalars().all()}

    sheets.append(await load_aircraft(session, wb["Aircraft"], operators_index, known_icao_types))
    sheets.append(await load_clients(session, wb["Clients"], operators_index))
    clients_index = RefIndex()
    for row in (await session.execute(select(Client))).scalars().all():
        if row.source_ref:
            clients_index.add(row.source_ref, row.id)

    vendors_result, vendors_index = await load_vendors(session, wb["Vendors"])
    sheets.append(vendors_result)
    sheets.append(await load_vendor_coverage_airports(session, wb["vendor_coverage_airports"], vendors_index, known_icaos))
    sheets.append(
        await load_vendor_coverage_countries(session, wb["vendor_coverage_countries"], vendors_index, countries_index)
    )

    sheets.append(await load_service_catalogue(session, wb["SERVICE CATALOGUE"]))
    sheets.append(await load_visa_matrix(session, wb["VISA MATRIX"], countries_index, nationality_lookup))
    sheets.append(await load_visa_rules(session, wb["VISA RULES"], countries_index, nationality_lookup))
    sheets.append(await load_message_templates(session, wb["MESSAGE TEMPLATES"]))
    sheets.append(await load_country_requirements(session, wb["COUNTRY REQUIREMENTS"], countries_index))
    sheets.append(await load_users(session, wb["USERS & SETTINGS"], operators_index, clients_index))
    sheets.append(await sync_settings_from_admin_sheet(session, wb["admin"]))

    return sheets
