import re

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.importer.lookups import CountryIndex
from app.importer.xlsx_reader import code, f, read_rows, s
from app.models.airport import Airport
from app.schemas.readiness import ImportSheetResult

_FUEL_SPLIT_RE = re.compile(r"[,+/]")


def _fuel_grades(value: str | None) -> list[str] | None:
    if not value or value.strip().upper() == "NONE":
        return None
    parts = [p.strip() for p in _FUEL_SPLIT_RE.split(value) if p.strip()]
    return parts or None


def _tri_bool(value: str | None) -> bool | None:
    if not value:
        return None
    v = value.strip().upper()
    if v == "YES":
        return True
    if v == "NO":
        return False
    return None


async def load_airports(session: AsyncSession, ws, countries: CountryIndex) -> ImportSheetResult:
    loaded = skipped = 0
    notes: list[str] = []
    rows_seen = 0

    existing = {row.icao: row for row in (await session.execute(select(Airport))).scalars().all()}

    for row in read_rows(ws, header_row=2, data_start_row=3):
        rows_seen += 1
        icao = s(row, "Airport ICAO")
        lat = f(row, "Latitude (DD)")
        lon = f(row, "Longitude (DD)")
        if not icao or lat is None or lon is None:
            skipped += 1
            notes.append(f"row {rows_seen}: missing ICAO or coordinates, skipped")
            continue

        country_iso3 = countries.resolve_name(s(row, "Country"))
        if country_iso3 is None and s(row, "Country"):
            notes.append(
                f"{icao}: country {s(row, 'Country')!r} outside the 142-state core region, "
                "loaded with country_iso3 = NULL"
            )

        operating_hours = s(row, "Operating Hours") or s(row, "Airport Hours")

        values = dict(
            iata=code(row, "Airport IATA", max_len=3),
            name=s(row, "Airport Name") or icao,
            city=s(row, "City Name"),
            country_iso3=country_iso3,
            lat=lat,
            lon=lon,
            elevation_ft=f(row, "Elevation (ft)"),
            timezone=s(row, "Time Zone"),
            airport_type=s(row, "Airport Type"),
            is_airport_of_entry=_tri_bool(s(row, "Airport of Entry")),
            ppr_required=_tri_bool(s(row, "PPR Required")),
            fuel_grades=_fuel_grades(s(row, "Fuel Types Available")),
            operating_hours=operating_hours,
        )

        existing_row = existing.get(icao.upper())
        if existing_row is not None:
            for k, v in values.items():
                setattr(existing_row, k, v)
        else:
            session.add(Airport(icao=icao.upper(), **values))
        loaded += 1

    await session.flush()
    return ImportSheetResult(
        sheet="airports", rows_seen=rows_seen, rows_loaded=loaded, rows_skipped=skipped, rows_quarantined=0, notes=notes
    )
