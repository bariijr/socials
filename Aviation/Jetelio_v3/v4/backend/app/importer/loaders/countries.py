from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.importer.lookups import CountryIndex
from app.importer.xlsx_reader import d, f, read_rows, s
from app.models.country import Country, GroundHandlingPolicy
from app.schemas.readiness import ImportSheetResult


def _ground_handling_policy(mandatory: str | None, self_handling: str | None) -> GroundHandlingPolicy:
    if mandatory and mandatory.strip().upper() == "YES":
        return GroundHandlingPolicy.MANDATORY
    if self_handling and self_handling.strip().upper() == "YES":
        return GroundHandlingPolicy.SELF_HANDLING_PERMITTED
    if mandatory and mandatory.strip().upper() == "NO" and (self_handling or "").strip().upper() == "NO":
        return GroundHandlingPolicy.NOT_MANDATORY
    return GroundHandlingPolicy.VERIFY


async def load_countries(
    session: AsyncSession, ws, iso3_to_iso2_fallback: dict[str, str] | None = None
) -> tuple[ImportSheetResult, CountryIndex]:
    index = CountryIndex()
    loaded = skipped = 0
    notes: list[str] = []
    fallback = iso3_to_iso2_fallback or {}

    existing = {row.iso3: row for row in (await session.execute(select(Country))).scalars().all()}

    rows_seen = 0
    for row in read_rows(ws, header_row=1, data_start_row=2):
        rows_seen += 1
        iso3 = s(row, "iso_alpha3")
        name = s(row, "country_name")
        if not iso3 or not name:
            skipped += 1
            notes.append(f"row {rows_seen}: missing iso3/name, skipped")
            continue

        iso2 = s(row, "iso_alpha2")
        if not iso2:
            fallback_iso2 = fallback.get(iso3.upper())
            if fallback_iso2:
                notes.append(f"{iso3}: iso2 not in sheet, used Natural Earth fallback {fallback_iso2!r}")
            iso2 = fallback_iso2

        overflight = (s(row, "overflight_permit_required") or "REQUIRED").upper() == "REQUIRED"
        landing = (s(row, "landing_permit_required") or "REQUIRED").upper() == "REQUIRED"
        policy = _ground_handling_policy(s(row, "ground_handling_mandatory"), s(row, "self_handling_permitted"))

        values = dict(
            iso2=iso2.upper() if iso2 else None,
            name=name,
            calling_code=s(row, "calling_code"),
            caa_name=s(row, "civil_aviation_authority"),
            region=s(row, "region"),
            overflight_permit_required=overflight,
            landing_permit_required=landing,
            permit_flags_source=s(row, "permit_flags_source"),
            permit_flags_verified_by=s(row, "permit_flags_verified_by"),
            permit_flags_verified_on=d(row, "permit_flags_verified_on"),
            standard_lead_time_hours=f(row, "standard_lead_time_hours"),
            lead_time_source=s(row, "lead_time_source"),
            lead_time_verified_by=s(row, "lead_time_verified_by"),
            lead_time_verified_on=d(row, "lead_time_verified_on"),
            ground_handling_policy=policy,
        )

        existing_row = existing.get(iso3.upper())
        if existing_row is not None:
            for k, v in values.items():
                setattr(existing_row, k, v)
        else:
            session.add(Country(iso3=iso3.upper(), **values))
        index.add(iso3, iso2, name)
        loaded += 1

    await session.flush()
    return (
        ImportSheetResult(sheet="countries", rows_seen=rows_seen, rows_loaded=loaded, rows_skipped=skipped, rows_quarantined=0, notes=notes),
        index,
    )
