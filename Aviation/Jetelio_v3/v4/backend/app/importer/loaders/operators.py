from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.importer.lookups import RefIndex, map_message_format, map_messaging_channel
from app.importer.xlsx_reader import code, list_, read_rows, s
from app.models.operator import Operator, OperatorStatus
from app.schemas.readiness import ImportSheetResult


async def load_operators(session: AsyncSession, ws) -> tuple[ImportSheetResult, RefIndex]:
    index = RefIndex()
    loaded = quarantined = 0
    notes: list[str] = []
    rows_seen = 0

    existing = {row.source_ref: row for row in (await session.execute(select(Operator))).scalars().all() if row.source_ref}

    for row in read_rows(ws, header_row=1, data_start_row=2):
        rows_seen += 1
        source_ref = s(row, "operator_id")
        if not source_ref:
            continue

        name = s(row, "operator_name")
        is_quarantined = name is None
        if is_quarantined:
            quarantined += 1
            notes.append(f"{source_ref}: BLOCKED - OPERATOR NAME REQUIRED")

        try:
            status = OperatorStatus((s(row, "status") or "ACTIVE").upper())
        except ValueError:
            status = OperatorStatus.ACTIVE

        values = dict(
            name=name,
            aoc_number=s(row, "aoc_number"),
            icao_designator=code(row, "icao_designator", max_len=10),
            iata_designator=code(row, "iata_designator", max_len=10),
            home_base_icao=code(row, "home_base_icao", max_len=4),
            contact_name=s(row, "primary_contact_name"),
            contact_phone=s(row, "primary_contact_phone"),
            occ_email=s(row, "occ_email"),
            billing_email=s(row, "billing_email"),
            currency=code(row, "default_currency", max_len=3),
            tax_id=s(row, "tax_id"),
            status=status,
            preferred_channel=map_messaging_channel(s(row, "preferred_channel")),
            messaging_to=list_(row, "messaging_to_emails"),
            messaging_cc=list_(row, "messaging_cc_emails"),
            sita_address=code(row, "sita_address", max_len=20),
            aftn_address=code(row, "aftn_address", max_len=20),
            message_format=map_message_format(s(row, "message_format")),
            sending_team_signature=s(row, "sending_team_signature"),
            quarantined=is_quarantined,
            quarantine_reason="BLOCKED - OPERATOR NAME REQUIRED" if is_quarantined else None,
        )

        existing_row = existing.get(source_ref.upper())
        if existing_row is not None:
            for k, v in values.items():
                setattr(existing_row, k, v)
            pk_source = existing_row
        else:
            op = Operator(source_ref=source_ref.upper(), **values)
            session.add(op)
            pk_source = op

        await session.flush()
        index.add(source_ref, pk_source.id)
        loaded += 1

    return (
        ImportSheetResult(
            sheet="Operators", rows_seen=rows_seen, rows_loaded=loaded, rows_skipped=0,
            rows_quarantined=quarantined, notes=notes,
        ),
        index,
    )
