"""One-shot idempotent importer. Run with:

    python -m app.importer.cli [path-to-xlsx]

Loads every reference-data sheet, quarantining what the migration-defects
section of the spec calls out, then prints the readiness report and the
nine pilot-exit gates (recomputed live, never cached) so every load ends
with an honest picture of what V3 can and cannot do yet.
"""

import asyncio
import sys
from datetime import datetime, timezone
from pathlib import Path

from app.config import get_settings
from app.database import AsyncSessionLocal
from app.importer import geo_loader
from app.importer.import_service import run_reference_import
from app.importer.report import build_report, print_report, write_report_json
from app.importer.xlsx_reader import load_workbook
from app.services import readiness_service

settings = get_settings()


async def run_import(xlsx_path: str, geo_dir: str) -> None:
    started_at = datetime.now(timezone.utc)
    wb = load_workbook(xlsx_path)
    nationality_lookup = geo_loader.build_world_name_to_iso3(geo_dir)
    iso3_to_iso2_fallback = geo_loader.build_iso3_to_iso2(geo_dir)

    async with AsyncSessionLocal() as session:  # type: AsyncSession
        try:
            sheets = await run_reference_import(
                session,
                wb,
                nationality_lookup=nationality_lookup,
                iso3_to_iso2_fallback=iso3_to_iso2_fallback,
                geo_dir=geo_dir,
            )
            await session.commit()
        except Exception:
            await session.rollback()
            raise

    async with AsyncSessionLocal() as session:
        readiness = await readiness_service.compute_readiness_rows(session)
        pilot_exit = await readiness_service.compute_pilot_exit_gates(session)

    finished_at = datetime.now(timezone.utc)
    report = build_report(
        started_at=started_at, finished_at=finished_at, source_file=xlsx_path,
        sheets=sheets, readiness=readiness, pilot_exit=pilot_exit,
    )
    print_report(report)
    write_report_json(report, str(Path(xlsx_path).with_name("import_report.json")))


def main() -> None:
    xlsx_path = sys.argv[1] if len(sys.argv) > 1 else settings.import_source_xlsx
    geo_dir = str(Path(xlsx_path).resolve().parent / "geo")
    asyncio.run(run_import(xlsx_path, geo_dir))


if __name__ == "__main__":
    main()
