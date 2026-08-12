from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.billing_ref import next_billing_ref
from app.importer.lookups import CountryIndex, RefIndex
from app.importer.xlsx_reader import b, code, d, i, list_, read_rows, s
from app.models.messaging import MessagingChannel
from app.models.vendor import Vendor, VendorCapabilityStatus, VendorCoverageAirport, VendorCoverageCountry
from app.schemas.readiness import ImportSheetResult


def _capability_status(value: str | None) -> VendorCapabilityStatus:
    v = (value or "").strip().upper()
    if v == "APPROVED":
        return VendorCapabilityStatus.APPROVED
    if "REJECT" in v:
        return VendorCapabilityStatus.REJECTED
    if "EXPIRED" in v:
        return VendorCapabilityStatus.EXPIRED
    return VendorCapabilityStatus.PENDING


async def load_vendors(session: AsyncSession, ws) -> tuple[ImportSheetResult, RefIndex]:
    index = RefIndex()
    loaded = 0
    notes: list[str] = []
    rows_seen = 0

    existing = {row.source_ref: row for row in (await session.execute(select(Vendor))).scalars().all() if row.source_ref}

    for row in read_rows(ws, header_row=1, data_start_row=2):
        rows_seen += 1
        source_ref = s(row, "vendor_id")
        name = s(row, "company_name")
        if not source_ref or not name:
            continue

        email = s(row, "email")

        values = dict(
            name=name,
            service_scope=list_(row, "services_offered_codes"),
            preferred_channel=MessagingChannel.EMAIL if email else None,
            messaging_to=[email] if email else None,
            sita_address=code(row, "sita_address", max_len=20),
            aftn_address=code(row, "aftn_address", max_len=20),
            questionnaire_sent_on=d(row, "questionnaire_sent_on"),
            questionnaire_returned_on=d(row, "questionnaire_returned_on"),
            capability_status=_capability_status(s(row, "capability_status")),
            approved_by=s(row, "approved_by"),
            approved_on=d(row, "approved_on"),
            preference_rank=i(row, "preference_rank"),
        )

        existing_row = existing.get(source_ref.upper())
        if existing_row is not None:
            for k, v in values.items():
                setattr(existing_row, k, v)
            pk_source = existing_row
        else:
            billing_ref = await next_billing_ref(session, sequence_name="vendors_billing_ref_seq", prefix="VEN")
            vendor = Vendor(source_ref=source_ref.upper(), billing_ref=billing_ref, **values)
            session.add(vendor)
            pk_source = vendor

        await session.flush()
        index.add(source_ref, pk_source.id)
        loaded += 1

    return (
        ImportSheetResult(sheet="Vendors", rows_seen=rows_seen, rows_loaded=loaded, rows_skipped=0, rows_quarantined=0, notes=notes),
        index,
    )


async def load_vendor_coverage_airports(
    session: AsyncSession, ws, vendors: RefIndex, known_icaos: set[str]
) -> ImportSheetResult:
    loaded = skipped = 0
    notes: list[str] = []
    rows_seen = 0

    existing = {
        row.source_ref: row
        for row in (await session.execute(select(VendorCoverageAirport))).scalars().all()
        if row.source_ref
    }

    for row in read_rows(ws, header_row=1, data_start_row=2):
        rows_seen += 1
        source_ref = s(row, "id")
        vendor_pk = vendors.resolve(s(row, "vendor_id"))
        icao = s(row, "icao_code")
        if not source_ref or vendor_pk is None or not icao or icao.upper() not in known_icaos:
            skipped += 1
            notes.append(f"row {rows_seen}: skipped (vendor={s(row, 'vendor_id')}, icao={icao})")
            continue

        values = dict(
            vendor_id=vendor_pk,
            icao=icao.upper(),
            is_primary_handler=bool(b(row, "is_primary_handler")),
            fbo_name=s(row, "fbo_facility_name"),
            sita=code(row, "sita_address", max_len=20),
            aftn=code(row, "aftn_address", max_len=20),
            vhf=code(row, "vhf_frequency", max_len=50),
        )

        existing_row = existing.get(source_ref.upper())
        if existing_row is not None:
            for k, v in values.items():
                setattr(existing_row, k, v)
        else:
            session.add(VendorCoverageAirport(source_ref=source_ref.upper(), **values))
        loaded += 1

    await session.flush()
    return ImportSheetResult(
        sheet="vendor_coverage_airports", rows_seen=rows_seen, rows_loaded=loaded, rows_skipped=skipped,
        rows_quarantined=0, notes=notes,
    )


async def load_vendor_coverage_countries(
    session: AsyncSession, ws, vendors: RefIndex, countries: CountryIndex
) -> ImportSheetResult:
    loaded = skipped = 0
    notes: list[str] = []
    rows_seen = 0

    existing = {
        row.source_ref: row
        for row in (await session.execute(select(VendorCoverageCountry))).scalars().all()
        if row.source_ref
    }

    for row in read_rows(ws, header_row=1, data_start_row=2):
        rows_seen += 1
        source_ref = s(row, "id")
        vendor_pk = vendors.resolve(s(row, "vendor_id"))
        country_iso3 = countries.resolve_iso2(s(row, "country_iso_code"))
        if not source_ref or vendor_pk is None or not country_iso3:
            skipped += 1
            notes.append(f"row {rows_seen}: skipped (vendor={s(row, 'vendor_id')}, country={s(row, 'country_iso_code')})")
            continue

        values = dict(
            vendor_id=vendor_pk,
            country_iso3=country_iso3,
            has_caa_direct_account=bool(b(row, "has_caa_direct_account")),
            service_scope=list_(row, "service_scope"),
        )

        existing_row = existing.get(source_ref.upper())
        if existing_row is not None:
            for k, v in values.items():
                setattr(existing_row, k, v)
        else:
            session.add(VendorCoverageCountry(source_ref=source_ref.upper(), **values))
        loaded += 1

    await session.flush()
    return ImportSheetResult(
        sheet="vendor_coverage_countries", rows_seen=rows_seen, rows_loaded=loaded, rows_skipped=skipped,
        rows_quarantined=0, notes=notes,
    )
