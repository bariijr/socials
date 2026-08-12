from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.importer.lookups import CountryIndex
from app.importer.xlsx_reader import b, d, f, list_, read_rows, s
from app.models.country_requirements import CountryRequirement
from app.schemas.readiness import ImportSheetResult


async def load_country_requirements(session: AsyncSession, ws, countries: CountryIndex) -> ImportSheetResult:
    loaded = skipped = 0
    notes: list[str] = []
    rows_seen = 0

    existing = {
        row.source_ref: row for row in (await session.execute(select(CountryRequirement))).scalars().all() if row.source_ref
    }

    for row in read_rows(ws, header_row=4, data_start_row=5):
        rows_seen += 1
        source_ref = s(row, "req_id")
        request_type = s(row, "request_type")
        if not source_ref or not request_type:
            skipped += 1
            continue

        country_iso3 = countries.resolve_name(s(row, "country"))
        if not country_iso3:
            skipped += 1
            notes.append(f"{source_ref}: country {s(row, 'country')!r} not found, skipped")
            continue

        values = dict(
            country_iso3=country_iso3,
            request_type=request_type,
            required_forms=list_(row, "forms_required"),
            required_documents=list_(row, "documents_required"),
            lead_time_hours=f(row, "lead_time_hours"),
            authority_working_hours=s(row, "authority_working_hours"),
            accepted_channels=list_(row, "accepted_channels"),
            local_agent_required=b(row, "local_agent_required"),
            direct_caa_account_possible=b(row, "caa_direct_account_required"),
            known_quirks=s(row, "known_quirks_intel"),
            source=s(row, "source"),
            verified_by=s(row, "verified_by"),
            verified_on=d(row, "verified_on"),
            review_due=d(row, "review_due"),
        )

        existing_row = existing.get(source_ref.upper())
        if existing_row is not None:
            for k, v in values.items():
                setattr(existing_row, k, v)
        else:
            session.add(CountryRequirement(source_ref=source_ref.upper(), **values))
        loaded += 1

    await session.flush()
    return ImportSheetResult(
        sheet="COUNTRY REQUIREMENTS", rows_seen=rows_seen, rows_loaded=loaded, rows_skipped=skipped,
        rows_quarantined=0, notes=notes,
    )
