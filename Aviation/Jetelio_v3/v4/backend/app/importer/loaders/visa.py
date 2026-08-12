from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.importer.lookups import CountryIndex
from app.importer.xlsx_reader import i, s
from app.models.visa import VisaMatrixCell, VisaRequirement, VisaRule
from app.schemas.readiness import ImportSheetResult

_REQUIREMENT_MAP = {
    "NOT REQUIRED": VisaRequirement.NOT_REQUIRED,
    "REQUIRED": VisaRequirement.REQUIRED,
    "VISA ON ARRIVAL": VisaRequirement.VISA_ON_ARRIVAL,
    "EVISA": VisaRequirement.EVISA,
    "TRANSIT ONLY": VisaRequirement.TRANSIT_ONLY,
    "TIWB": VisaRequirement.TIWB,
}


def _map_requirement(value) -> VisaRequirement | None:
    if value is None:
        return None
    key = str(value).strip().upper()
    return _REQUIREMENT_MAP.get(key)


async def load_visa_matrix(
    session: AsyncSession, ws, countries: CountryIndex, nationality_lookup: dict[str, str]
) -> ImportSheetResult:
    """Wide grid: header row 3 lists nationalities as columns from B
    onward; column A of each data row (from row 4) is the destination
    state. Ships deliberately near-empty — that IS the correct import
    result, not a bug.
    """
    header_row = 3
    max_col = ws.max_column
    nationality_cols: list[tuple[int, str]] = []
    for c in range(2, max_col + 1):
        name = ws.cell(row=header_row, column=c).value
        if not name:
            continue
        nat_iso3 = countries.resolve_name(str(name)) or nationality_lookup.get(str(name).strip().upper())
        if nat_iso3:
            nationality_cols.append((c, nat_iso3))

    existing = {
        (row.country_iso3, row.nationality_iso3): row
        for row in (await session.execute(select(VisaMatrixCell))).scalars().all()
    }

    loaded = skipped = 0
    rows_seen = 0
    notes: list[str] = []

    for r in range(4, ws.max_row + 1):
        dest_name = ws.cell(row=r, column=1).value
        if not dest_name:
            continue
        rows_seen += 1
        dest_iso3 = countries.resolve_name(str(dest_name))
        if not dest_iso3:
            skipped += 1
            notes.append(f"row {r}: destination {dest_name!r} not found in countries, row skipped")
            continue

        for col, nat_iso3 in nationality_cols:
            requirement = _map_requirement(ws.cell(row=r, column=col).value)
            if requirement is None:
                continue
            key = (dest_iso3, nat_iso3)
            if key in existing:
                existing[key].requirement = requirement
            else:
                session.add(
                    VisaMatrixCell(country_iso3=dest_iso3, nationality_iso3=nat_iso3, requirement=requirement)
                )
            loaded += 1

    await session.flush()
    return ImportSheetResult(
        sheet="VISA MATRIX", rows_seen=rows_seen, rows_loaded=loaded, rows_skipped=skipped,
        rows_quarantined=0, notes=notes,
    )


async def load_visa_rules(
    session: AsyncSession, ws, countries: CountryIndex, nationality_lookup: dict[str, str]
) -> ImportSheetResult:
    from sqlalchemy import delete

    from app.importer.xlsx_reader import read_rows

    # No natural unique key on this override layer; full reload keeps
    # re-running the importer idempotent.
    await session.execute(delete(VisaRule))

    loaded = skipped = 0
    rows_seen = 0
    notes: list[str] = []

    for row in read_rows(ws, header_row=1, data_start_row=2):
        rows_seen += 1
        requirement = None
        required_raw = s(row, "Required?")
        if required_raw:
            requirement = _map_requirement(required_raw)

        country_iso3 = countries.resolve_name(s(row, "Country"))
        nationality_name = s(row, "Nationality")
        nat_iso3 = (
            countries.resolve_name(nationality_name) or nationality_lookup.get((nationality_name or "").upper())
            if nationality_name
            else None
        )

        if not country_iso3 or not nat_iso3 or requirement is None:
            skipped += 1
            notes.append(f"row {rows_seen}: incomplete (country/nationality/requirement not all resolvable), skipped")
            continue

        session.add(
            VisaRule(
                country_iso3=country_iso3,
                nationality_iso3=nat_iso3,
                airport_icao=s(row, "Airport ICAO (optional)"),
                requirement=requirement,
                visa_type=s(row, "Visa Type"),
                lead_time_days=i(row, "Lead Time (days)"),
                max_stay_days=i(row, "Max Stay (days)"),
                conditions=s(row, "Notes / Conditions"),
            )
        )
        loaded += 1

    await session.flush()
    return ImportSheetResult(
        sheet="VISA RULES", rows_seen=rows_seen, rows_loaded=loaded, rows_skipped=skipped,
        rows_quarantined=0, notes=notes,
    )
