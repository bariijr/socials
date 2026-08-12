"""Admin-facing wrapper around app.importer.import_service — lets an admin
re-run the same reference-sheet loaders the CLI importer uses
(app.importer.cli), from an uploaded workbook instead of a file already
sitting on the server. Country/FIR polygon geometry is intentionally not
touched here (see app.importer.import_service's module docstring) — that's
a Natural Earth/VATSpy asset unrelated to what an admin re-uploads.
"""

import io
from datetime import datetime, timezone

import openpyxl
from openpyxl.utils.exceptions import InvalidFileException
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.errors import ValidationFailedError
from app.importer import geo_loader
from app.importer.import_service import run_reference_import
from app.importer.report import build_report
from app.schemas.readiness import ImportReport
from app.services import readiness_service

REQUIRED_SHEETS = (
    "countries",
    "airports",
    "Operators",
    "AIRCRAFT PERFORMANCE",
    "Aircraft",
    "Clients",
    "Vendors",
    "vendor_coverage_airports",
    "vendor_coverage_countries",
    "SERVICE CATALOGUE",
    "VISA MATRIX",
    "VISA RULES",
    "MESSAGE TEMPLATES",
    "COUNTRY REQUIREMENTS",
    "USERS & SETTINGS",
    "admin",
)


def _server_geo_dir() -> str:
    """Server-side asset directory (Natural Earth/VATSpy lookup tables),
    unrelated to the uploaded file — see module docstring.
    """
    from pathlib import Path

    settings = get_settings()
    return str(Path(settings.import_source_xlsx).resolve().parent / "geo")


async def run_upload_import(session: AsyncSession, filename: str, file_bytes: bytes) -> ImportReport:
    if not filename.lower().endswith(".xlsx"):
        raise ValidationFailedError("file", "Only .xlsx workbooks are accepted.")

    try:
        wb = openpyxl.load_workbook(io.BytesIO(file_bytes), data_only=True)
    except InvalidFileException as exc:
        raise ValidationFailedError("file", f"Not a valid .xlsx workbook: {exc}") from None

    missing = [name for name in REQUIRED_SHEETS if name not in wb.sheetnames]
    if missing:
        raise ValidationFailedError("file", f"Missing required sheet(s): {', '.join(missing)}")

    geo_dir = _server_geo_dir()
    nationality_lookup = geo_loader.build_world_name_to_iso3(geo_dir)
    iso3_to_iso2_fallback = geo_loader.build_iso3_to_iso2(geo_dir)

    started_at = datetime.now(timezone.utc)
    sheets = await run_reference_import(
        session, wb, nationality_lookup=nationality_lookup, iso3_to_iso2_fallback=iso3_to_iso2_fallback, geo_dir=None
    )
    # Caller (router) commits — mirrors every other write endpoint in this
    # codebase; readiness/pilot-exit are read back only after that commit
    # lands so the report reflects the state actually persisted.
    await session.commit()

    readiness = await readiness_service.compute_readiness_rows(session)
    pilot_exit = await readiness_service.compute_pilot_exit_gates(session)
    finished_at = datetime.now(timezone.utc)

    return build_report(
        started_at=started_at, finished_at=finished_at, source_file=filename,
        sheets=sheets, readiness=readiness, pilot_exit=pilot_exit,
    )
