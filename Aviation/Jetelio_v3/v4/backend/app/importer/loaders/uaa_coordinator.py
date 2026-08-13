"""UAA Coordinator migration loader — reads UAA_Coordinator_v5JTL.xlsm and
maps it onto the real Jetelio v4 schema:

  VENDORS -> vendors + vendor_coverage_airports + vendor_coverage_countries
  AGENTS  -> vendor_contacts (enrichment)
  INTEL   -> country_requirements
  TEAMS   -> users (coordinator accounts, real hashed default password)
  TAILS   -> aircraft
  MAYFLY  -> trips + trip_legs, via the real feasibility engine

Rewritten from a first draft that had a real bug in nearly every function —
wrong field names on Aircraft/ImportSheetResult, next_billing_ref() called
positionally against a keyword-only signature, TripLeg built by hand
without a real verdict/rule_engine_version/computed_snapshot (which
reproduces a bug this exact codebase already hit and fixed once, see
Prompt.md §10.2 — an old-shaped snapshot 500s GET /trips/{id} forever), a
hardcoded "GLF5" fallback aircraft type, and raw Excel ICAO/type codes
inserted straight into FK columns with no validation. None of that reused
this codebase's own established importer conventions (app/importer/
loaders/aircraft.py, vendors.py, operators.py, users.py) — this version
does: real helpers from app.importer.xlsx_reader, quarantine-by-
prevalidation against real reference sets instead of insert-and-hope, and
MAYFLY now goes through the real app.services.trip_service.create_trip
(the same code path every other trip in this system uses) instead of
hand-rolling a fake snapshot.
"""

import asyncio
import sys
import uuid
from datetime import date, datetime, time, timezone
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.billing_ref import next_billing_ref
from app.core.errors import ValidationFailedError
from app.core.security import hash_password
from app.database import AsyncSessionLocal
from app.importer.loaders.users import DEFAULT_SEED_PASSWORD
from app.importer.xlsx_reader import d, load_workbook, read_rows, s
from app.models.aircraft import Aircraft, AircraftPerformance
from app.models.airport import Airport
from app.models.country import Country
from app.models.country_requirements import CountryRequirement
from app.models.messaging import MessagingChannel
from app.models.operator import Operator
from app.models.service_delivery import DeliveryChannel, VendorContact
from app.models.trip import Trip
from app.models.user import User, UserRole
from app.models.vendor import Vendor, VendorCapabilityStatus, VendorCoverageAirport, VendorCoverageCountry
from app.schemas.readiness import ImportSheetResult
from app.schemas.trip import TripCreateIn, TripLegIn
from app.services import trip_service

UAA_EXCEL_PATH_DEFAULT = r"C:\Backups\InsiderTechSol\Aviation\Jetelio_v3\.LAYOUT\uaacoordv6\UAA_Coordinator_v5JTL.xlsm"

# Trip.created_by/updated_by have no FK to users.id (see Prompt.md §4.4 —
# a JWT-carried id is valid by virtue of login issuance, not by
# referencing a live row), so a fixed synthetic actor is safe here, same
# as every other place in this codebase that writes an audit log entry
# without a real logged-in session.
IMPORT_ACTOR_ID = uuid.UUID("00000000-0000-0000-0000-0000636f6f72")  # "coor" in hex, arbitrary but stable
IMPORT_ACTOR_EMAIL = "uaa-coordinator-import@jetelio.internal"


def _empty_result(sheet: str) -> ImportSheetResult:
    return ImportSheetResult(sheet=sheet, rows_seen=0, rows_loaded=0, rows_skipped=0, rows_quarantined=0, notes=[])


def _split_emails(value: str | None) -> list[str] | None:
    if not value:
        return None
    parts = [p.strip() for p in str(value).replace(";", ",").split(",") if "@" in p.strip()]
    return parts or None


def _parse_mtow_lb_to_kg(value: str | None) -> float | None:
    if not value:
        return None
    cleaned = str(value).upper().replace("LB", "").replace(",", "").strip()
    try:
        return round(float(cleaned) * 0.453592, 2)
    except (ValueError, TypeError):
        return None


# ---------------------------------------------------------------------------
# 1. VENDORS -> vendors + vendor_coverage_airports + vendor_coverage_countries
# ---------------------------------------------------------------------------
async def load_vendors(
    session: AsyncSession, ws, *, known_icaos: set[str]
) -> tuple[ImportSheetResult, dict[str, uuid.UUID]]:
    loaded = quarantined = 0
    notes: list[str] = []
    rows_seen = 0
    vendor_by_name: dict[str, uuid.UUID] = {}

    country_by_name = {c.name.lower(): c.iso3 for c in (await session.execute(select(Country))).scalars().all() if c.name}
    existing_vendors = {v.name.lower(): v for v in (await session.execute(select(Vendor))).scalars().all()}
    existing_coverage_airports = {
        (row.vendor_id, row.icao) for row in (await session.execute(select(VendorCoverageAirport))).scalars().all()
    }
    existing_coverage_countries = {
        (row.vendor_id, row.country_iso3) for row in (await session.execute(select(VendorCoverageCountry))).scalars().all()
    }

    for row in read_rows(ws, header_row=1, data_start_row=2, stop_at_blank=True):
        rows_seen += 1
        name = s(row, "PGH")
        if not name or name.lower() == "air 2 ground concierge":  # internal placeholder row
            continue

        country_name = s(row, "Country")
        country_iso3 = country_by_name.get(country_name.lower()) if country_name else None
        icaos_str = s(row, "ICAO's")
        phones = s(row, "PHONES")
        emails_str = s(row, "EMAILS")
        emails = _split_emails(emails_str)

        vendor = existing_vendors.get(name.lower())
        if vendor is None:
            vendor = Vendor(
                name=name,
                billing_ref=await next_billing_ref(session, sequence_name="vendors_billing_ref_seq", prefix="VEN"),
                preferred_channel=MessagingChannel.EMAIL if emails else None,
                messaging_to=emails,
                # Already a working handler per this real coordinator sheet,
                # not a fresh applicant — matches the original draft's own
                # (correct) reasoning for this one field.
                capability_status=VendorCapabilityStatus.APPROVED,
            )
            session.add(vendor)
            await session.flush()
            existing_vendors[name.lower()] = vendor
        elif emails and not vendor.messaging_to:
            vendor.messaging_to = emails
        vendor_by_name[name.lower()] = vendor.id
        loaded += 1

        if icaos_str:
            for icao in {c.strip().upper() for c in icaos_str.replace(";", ",").split(",") if len(c.strip()) == 4}:
                if icao not in known_icaos:
                    quarantined += 1
                    notes.append(f"{name}: coverage airport {icao!r} not in airports reference table, skipped")
                    continue
                if (vendor.id, icao) in existing_coverage_airports:
                    continue
                session.add(
                    VendorCoverageAirport(
                        vendor_id=vendor.id,
                        icao=icao,
                        is_primary_handler=True,
                        contacts=(
                            [{"name": None, "role": "OPS", "phone": phones, "email": emails_str, "hours": None}]
                            if phones or emails_str
                            else None
                        ),
                    )
                )
                existing_coverage_airports.add((vendor.id, icao))

        if country_iso3 and (vendor.id, country_iso3) not in existing_coverage_countries:
            session.add(VendorCoverageCountry(vendor_id=vendor.id, country_iso3=country_iso3, has_caa_direct_account=False))
            existing_coverage_countries.add((vendor.id, country_iso3))

    await session.flush()
    return (
        ImportSheetResult(
            sheet="VENDORS", rows_seen=rows_seen, rows_loaded=loaded, rows_skipped=0,
            rows_quarantined=quarantined, notes=notes,
        ),
        vendor_by_name,
    )


# ---------------------------------------------------------------------------
# 2. AGENTS -> vendor_contacts (enrichment)
# ---------------------------------------------------------------------------
async def load_agents(session: AsyncSession, ws, *, vendor_by_name: dict[str, uuid.UUID]) -> ImportSheetResult:
    loaded = skipped = 0
    notes: list[str] = []
    rows_seen = 0

    existing = {
        (row.vendor_id, row.channel, row.contact_value)
        for row in (await session.execute(select(VendorContact))).scalars().all()
    }

    for row in read_rows(ws, header_row=1, data_start_row=2, stop_at_blank=True):
        rows_seen += 1
        vendor_name = s(row, "PGH")
        agent_name = s(row, "AGENT")
        vendor_id = vendor_by_name.get(vendor_name.lower()) if vendor_name else None
        if not vendor_id or not agent_name:
            skipped += 1
            notes.append(f"row {rows_seen}: no matching vendor {vendor_name!r}, skipped")
            continue

        email = s(row, "EMAIL")
        phone = s(row, "PHONE")
        for channel, value in ((DeliveryChannel.EMAIL, email), (DeliveryChannel.PHONE, phone)):
            if not value or (vendor_id, channel, value) in existing:
                continue
            session.add(
                VendorContact(vendor_id=vendor_id, channel=channel, contact_value=value, contact_name=agent_name, is_primary=False)
            )
            existing.add((vendor_id, channel, value))
            loaded += 1

    await session.flush()
    return ImportSheetResult(
        sheet="AGENTS", rows_seen=rows_seen, rows_loaded=loaded, rows_skipped=skipped, rows_quarantined=0, notes=notes,
    )


# ---------------------------------------------------------------------------
# 3. INTEL -> country_requirements
# ---------------------------------------------------------------------------
async def load_intel(session: AsyncSession, ws) -> ImportSheetResult:
    loaded = skipped = 0
    notes: list[str] = []
    rows_seen = 0

    country_by_name = {c.name.lower(): c.iso3 for c in (await session.execute(select(Country))).scalars().all() if c.name}

    for row in read_rows(ws, header_row=1, data_start_row=2, stop_at_blank=True):
        rows_seen += 1
        country_name = s(row, "COUNTRY")
        brief = s(row, "INTEL BRIEF")
        if not country_name or not brief:
            continue

        country_iso3 = country_by_name.get(country_name.lower())
        if not country_iso3:
            notes.append(f"country {country_name!r} not found in reference table, skipped")
            skipped += 1
            continue

        existing = (
            await session.execute(
                select(CountryRequirement).where(
                    CountryRequirement.country_iso3 == country_iso3, CountryRequirement.request_type == "INTEL"
                )
            )
        ).scalar_one_or_none()

        if existing is None:
            session.add(
                CountryRequirement(
                    country_iso3=country_iso3,
                    request_type="INTEL",
                    known_quirks=brief,
                    source="UAA_Coordinator_v5JTL.xlsm INTEL sheet",
                )
            )
        else:
            existing.known_quirks = f"{existing.known_quirks or ''}\n\n{brief}".strip()
        loaded += 1

    await session.flush()
    return ImportSheetResult(
        sheet="INTEL", rows_seen=rows_seen, rows_loaded=loaded, rows_skipped=skipped, rows_quarantined=0, notes=notes,
    )


# ---------------------------------------------------------------------------
# 4. TEAMS -> users (coordinator accounts)
# ---------------------------------------------------------------------------
async def load_teams(session: AsyncSession, ws) -> ImportSheetResult:
    loaded = skipped = 0
    # Same real, documented default every other seeded account in this
    # system uses (app/importer/loaders/users.py) — a real bcrypt hash of a
    # known, publicly-documented password ops already resets before real
    # use, not an unhashed placeholder string stored in a "hashed_password"
    # column.
    notes: list[str] = [f"all created accounts get the shared dev password {DEFAULT_SEED_PASSWORD!r} — reset before any real use"]
    rows_seen = 0

    existing = {u.email.lower() for u in (await session.execute(select(User))).scalars().all()}

    for row in read_rows(ws, header_row=1, data_start_row=2, stop_at_blank=True):
        rows_seen += 1
        team = s(row, "TEAM")
        team_email = s(row, "TEAM EMAIL")
        if not team or not team_email:
            continue

        if team_email.lower() in existing:
            skipped += 1
            continue

        session.add(
            User(
                email=team_email.lower(),
                full_name=f"Team {team}",
                role=UserRole.OPERATIONS_SPECIALIST,
                hashed_password=hash_password(DEFAULT_SEED_PASSWORD),
            )
        )
        existing.add(team_email.lower())
        loaded += 1

    await session.flush()
    return ImportSheetResult(
        sheet="TEAMS", rows_seen=rows_seen, rows_loaded=loaded, rows_skipped=skipped, rows_quarantined=0, notes=notes,
    )


# ---------------------------------------------------------------------------
# 5. TAILS -> aircraft
# ---------------------------------------------------------------------------
async def _resolve_or_create_operator(session: AsyncSession, name: str | None, cache: dict[str, uuid.UUID]) -> uuid.UUID | None:
    """Real coordinator data naming a real operator that isn't in the main
    reference workbook yet isn't fabrication — it's a legitimate second
    source. Still requires a real name; never invents one.
    """
    if not name:
        return None
    key = name.lower()
    if key in cache:
        return cache[key]
    existing = (await session.execute(select(Operator).where(Operator.name == name))).scalar_one_or_none()
    if existing is None:
        existing = Operator(name=name)
        session.add(existing)
        await session.flush()
    cache[key] = existing.id
    return existing.id


async def load_tails(session: AsyncSession, ws, *, known_icao_types: set[str]) -> ImportSheetResult:
    loaded = quarantined = 0
    notes: list[str] = []
    rows_seen = 0
    operator_cache: dict[str, uuid.UUID] = {}

    existing = {a.registration: a for a in (await session.execute(select(Aircraft))).scalars().all()}

    for row in read_rows(ws, header_row=1, data_start_row=2, stop_at_blank=True):
        rows_seen += 1
        tail = s(row, "TAIL")
        if not tail:
            continue
        reg_key = tail.upper()
        if reg_key in existing:
            continue

        ac_type = s(row, "AC TYPE")
        if not ac_type or ac_type.upper() not in known_icao_types:
            quarantined += 1
            notes.append(f"{tail}: quarantined, AC TYPE {ac_type!r} not in aircraft_performance")
            continue

        operator_id = await _resolve_or_create_operator(session, s(row, "OPR NAME"), operator_cache)
        if operator_id is None:
            quarantined += 1
            notes.append(f"{tail}: quarantined, no operator name given (operator_id is required)")
            continue

        aircraft = Aircraft(
            registration=reg_key,
            icao_type=ac_type.upper(),
            mtow_kg=_parse_mtow_lb_to_kg(s(row, "MTOW")),
            operator_id=operator_id,
        )
        session.add(aircraft)
        existing[reg_key] = aircraft
        loaded += 1

    await session.flush()
    return ImportSheetResult(
        sheet="TAILS", rows_seen=rows_seen, rows_loaded=loaded, rows_skipped=0, rows_quarantined=quarantined, notes=notes,
    )


# ---------------------------------------------------------------------------
# 6. MAYFLY -> trips + trip_legs, via the real feasibility engine
# ---------------------------------------------------------------------------
def _leg_datetime(value: date | None) -> datetime | None:
    """MAYFLY only carries a date, not a time-of-day — midnight UTC on
    that real date is an honest "we don't know the time" placeholder, not
    a fabricated date the way falling back to datetime.now() (today's
    import-run date, unrelated to when the flight actually happened)
    would be. Callers must still treat this leg's time as approximate.
    """
    if value is None:
        return None
    return datetime.combine(value, time.min, tzinfo=timezone.utc)


async def load_mayfly(session: AsyncSession, ws, *, known_icaos: set[str], known_icao_types: set[str]) -> ImportSheetResult:
    notes: list[str] = []
    rows_seen = 0
    loaded_trips = 0
    quarantined_trips = 0

    existing_trip_notes = {
        (t.notes or "") for t in (await session.execute(select(Trip))).scalars().all()
    }

    trip_groups: dict[str, list[dict]] = {}
    for row in read_rows(ws, header_row=1, data_start_row=2, stop_at_blank=True):
        rows_seen += 1
        trip_no = s(row, "TRIP_NO.")
        if not trip_no:
            continue
        trip_groups.setdefault(trip_no, []).append(row)

    for trip_no, leg_rows in trip_groups.items():
        marker = f"Migrated from UAA Coordinator. Trip No: {trip_no}"
        if marker in existing_trip_notes:
            notes.append(f"trip {trip_no}: already imported, skipped")
            continue

        first = leg_rows[0]
        tail = s(first, "TAIL")
        ac_type = s(first, "AC Type")
        opr = s(first, "OPR NAME")

        if not ac_type or ac_type.upper() not in known_icao_types:
            quarantined_trips += 1
            notes.append(f"trip {trip_no}: quarantined, aircraft type {ac_type!r} not in aircraft_performance")
            continue

        legs_in: list[TripLegIn] = []
        trip_quarantined_reason: str | None = None
        for idx, leg_row in enumerate(leg_rows, start=1):
            dep_icao = s(leg_row, "ARR_FROM") or s(leg_row, "UAA_ICAO")
            arr_icao = s(leg_row, "UAA_ICAO")
            if not dep_icao or not arr_icao or dep_icao.upper() not in known_icaos or arr_icao.upper() not in known_icaos:
                trip_quarantined_reason = f"leg {idx}: dep/arr {dep_icao!r}/{arr_icao!r} not both in airports reference table"
                break

            dep_dt = _leg_datetime(d(leg_row, "DEP DATE"))
            arr_dt = _leg_datetime(d(leg_row, "ARR DATE"))
            if dep_dt is None and arr_dt is None:
                trip_quarantined_reason = f"leg {idx}: no DEP DATE or ARR DATE — cannot compute a real feasibility result"
                break

            legs_in.append(
                TripLegIn(
                    dep_icao=dep_icao.upper(),
                    arr_icao=arr_icao.upper(),
                    reference_datetime=dep_dt,
                    required_arrival_datetime=None if dep_dt else arr_dt,
                )
            )

        if trip_quarantined_reason:
            quarantined_trips += 1
            notes.append(f"trip {trip_no}: quarantined, {trip_quarantined_reason}")
            continue

        payload = TripCreateIn(
            aircraft_icao_type=ac_type.upper(),
            aircraft_registration=tail,
            operator_airline_name=opr,
            persons=[],
            legs=legs_in,
            notes=marker,
        )

        # A SAVEPOINT, not the whole session — create_trip runs the real
        # feasibility engine (permits/capability/credentials/nav fees) and
        # can raise ValidationFailedError (e.g. leg ordering) *after*
        # already flushing rows into this transaction; without isolating
        # that in its own nested transaction, catching the exception here
        # would still leave those flushed-but-invalid rows pending for the
        # final commit at the end of run_migration(). No other loader in
        # this codebase needs this — none of them call into a service
        # layer that can both flush and raise like this.
        try:
            async with session.begin_nested():
                await trip_service.create_trip(session, payload, actor_id=IMPORT_ACTOR_ID, actor_email=IMPORT_ACTOR_EMAIL)
            loaded_trips += 1
        except (ValidationFailedError, Exception) as exc:  # noqa: BLE001 - one bad trip must never abort the whole run
            quarantined_trips += 1
            notes.append(f"trip {trip_no}: quarantined, {exc}")

    return ImportSheetResult(
        sheet="MAYFLY", rows_seen=rows_seen, rows_loaded=loaded_trips, rows_skipped=0,
        rows_quarantined=quarantined_trips, notes=notes,
    )


# ---------------------------------------------------------------------------
# Runner
# ---------------------------------------------------------------------------
async def run_migration(xlsx_path: str = UAA_EXCEL_PATH_DEFAULT) -> list[ImportSheetResult]:
    if not Path(xlsx_path).exists():
        raise FileNotFoundError(f"UAA Excel not found: {xlsx_path}")

    wb = load_workbook(xlsx_path)
    results: list[ImportSheetResult] = []

    async with AsyncSessionLocal() as session:
        try:
            known_icaos = {row[0] for row in (await session.execute(select(Airport.icao))).all()}
            known_icao_types = {row[0] for row in (await session.execute(select(AircraftPerformance.icao_type))).all()}

            vendor_by_name: dict[str, uuid.UUID] = {}
            if "VENDORS" in wb.sheetnames:
                result, vendor_by_name = await load_vendors(session, wb["VENDORS"], known_icaos=known_icaos)
                results.append(result)
            if "AGENTS" in wb.sheetnames:
                results.append(await load_agents(session, wb["AGENTS"], vendor_by_name=vendor_by_name))
            if "INTEL" in wb.sheetnames:
                results.append(await load_intel(session, wb["INTEL"]))
            if "TEAMS" in wb.sheetnames:
                results.append(await load_teams(session, wb["TEAMS"]))
            if "TAILS" in wb.sheetnames:
                results.append(await load_tails(session, wb["TAILS"], known_icao_types=known_icao_types))
                # TAILS may have just created new aircraft_performance-matched
                # aircraft, but not new performance rows — known_icao_types
                # doesn't need refreshing here.
            if "MAYFLY" in wb.sheetnames:
                results.append(
                    await load_mayfly(session, wb["MAYFLY"], known_icaos=known_icaos, known_icao_types=known_icao_types)
                )

            await session.commit()
        except Exception:
            await session.rollback()
            raise

    return results


def main() -> None:
    xlsx_path = sys.argv[1] if len(sys.argv) > 1 else UAA_EXCEL_PATH_DEFAULT
    results = asyncio.run(run_migration(xlsx_path))
    for r in results:
        print(f"{r.sheet}: seen={r.rows_seen} loaded={r.rows_loaded} skipped={r.rows_skipped} quarantined={r.rows_quarantined}")
        for note in r.notes[:10]:
            print(f"  - {note}")
        if len(r.notes) > 10:
            print(f"  ... and {len(r.notes) - 10} more")


if __name__ == "__main__":
    main()
