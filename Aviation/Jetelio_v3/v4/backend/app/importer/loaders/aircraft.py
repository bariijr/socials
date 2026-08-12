from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.importer.lookups import RefIndex
from app.importer.xlsx_reader import code, d, f, i, read_rows, s
from app.models.aircraft import Aircraft, AircraftPerformance, AircraftStatus
from app.schemas.readiness import ImportSheetResult


async def load_aircraft_performance(session: AsyncSession, ws) -> ImportSheetResult:
    loaded = skipped = 0
    notes: list[str] = []
    rows_seen = 0

    existing = {
        row.icao_type: row for row in (await session.execute(select(AircraftPerformance))).scalars().all()
    }

    for row in read_rows(ws, header_row=6, data_start_row=7):
        rows_seen += 1
        icao_type = s(row, "icao_type")
        if not icao_type:
            skipped += 1
            continue

        values = dict(
            manufacturer=s(row, "manufacturer"),
            model_series=s(row, "model_series"),
            max_range_nm=f(row, "max_range_nm"),
            cruise_tas_kts=f(row, "cruise_tas_kts"),
            fuel_burn_kg_per_hr=f(row, "fuel_burn_kg_hr"),
            max_pax=i(row, "max_pax"),
            mtow_kg=f(row, "mtow_kg"),
            source=s(row, "source"),
            verified=(s(row, "verified") or "NO").upper() == "YES",
            verified_by=s(row, "verified_by"),
            verified_on=d(row, "verified_on"),
        )

        existing_row = existing.get(icao_type.upper())
        if existing_row is not None:
            for k, v in values.items():
                setattr(existing_row, k, v)
        else:
            session.add(AircraftPerformance(icao_type=icao_type.upper(), **values))
        loaded += 1

    await session.flush()
    return ImportSheetResult(
        sheet="AIRCRAFT PERFORMANCE", rows_seen=rows_seen, rows_loaded=loaded, rows_skipped=skipped,
        rows_quarantined=0, notes=notes,
    )


async def load_aircraft(session: AsyncSession, ws, operators: RefIndex, known_icao_types: set[str]) -> ImportSheetResult:
    loaded = quarantined = skipped = 0
    notes: list[str] = []
    rows_seen = 0

    existing = {row.registration: row for row in (await session.execute(select(Aircraft))).scalars().all()}
    seen_this_run: set[str] = set()

    for row in read_rows(ws, header_row=1, data_start_row=2):
        rows_seen += 1
        registration = s(row, "registration")
        if not registration:
            skipped += 1
            continue

        reg_key = registration.upper()
        if reg_key not in existing and reg_key in seen_this_run:
            quarantined += 1
            notes.append(f"{registration}: quarantined, duplicate registration within the sheet")
            continue

        icao_type = s(row, "icao_type")
        if not icao_type or icao_type.upper() not in known_icao_types:
            quarantined += 1
            notes.append(f"{registration}: quarantined, icao_type {icao_type!r} not in aircraft_performance")
            continue

        operator_pk = operators.resolve(s(row, "operator_ref"))
        if operator_pk is None:
            quarantined += 1
            notes.append(f"{registration}: quarantined, operator_ref {s(row, 'operator_ref')!r} not found")
            continue

        try:
            status = AircraftStatus((s(row, "aircraft_status") or "ACTIVE").upper())
        except ValueError:
            status = AircraftStatus.ACTIVE

        values = dict(
            icao_type=icao_type.upper(),
            manufacturer=s(row, "manufacturer"),
            model_series=s(row, "model_series"),
            serial_number=s(row, "serial_number"),
            home_base_icao=code(row, "home_base_icao", max_len=4),
            mtow_kg=f(row, "mtow_kg"),
            max_pax=i(row, "max_pax"),
            operator_id=operator_pk,
            cofa_expiry=d(row, "cof_expiry_date"),
            insurance_expiry=d(row, "insurance_expiry_date"),
            total_hours=f(row, "total_airframe_hours"),
            total_landings=i(row, "total_landings"),
            status=status,
            quarantined=False,
            quarantine_reason=None,
        )

        existing_row = existing.get(reg_key)
        if existing_row is not None:
            for k, v in values.items():
                setattr(existing_row, k, v)
        else:
            session.add(Aircraft(registration=reg_key, **values))
        await session.flush()
        seen_this_run.add(reg_key)
        loaded += 1

    return ImportSheetResult(
        sheet="Aircraft", rows_seen=rows_seen, rows_loaded=loaded, rows_skipped=skipped,
        rows_quarantined=quarantined, notes=notes,
    )
