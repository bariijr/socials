from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.billing_ref import next_billing_ref
from app.importer.lookups import RefIndex, map_message_format, map_messaging_channel
from app.importer.xlsx_reader import code, f, list_, read_rows, s
from app.models.client import Client
from app.schemas.readiness import ImportSheetResult


async def load_clients(session: AsyncSession, ws, operators: RefIndex) -> ImportSheetResult:
    loaded = skipped = 0
    notes: list[str] = []
    rows_seen = 0

    existing = {row.source_ref: row for row in (await session.execute(select(Client))).scalars().all() if row.source_ref}

    for row in read_rows(ws, header_row=2, data_start_row=3):
        rows_seen += 1
        source_ref = s(row, "client_id")
        if not source_ref:
            continue

        operator_pk = operators.resolve(s(row, "operator_id"))
        if operator_pk is None:
            skipped += 1
            notes.append(f"{source_ref}: skipped, operator_id {s(row, 'operator_id')!r} not found")
            continue

        bill_to = s(row, "bill_to_legal_name") or s(row, "client_name")
        if not bill_to:
            skipped += 1
            notes.append(f"{source_ref}: skipped, no bill-to legal name")
            continue

        address_parts = [s(row, "billing_address_1"), s(row, "billing_address_2"), s(row, "city"), s(row, "country")]
        address = ", ".join(p for p in address_parts if p) or None
        credit_limit = f(row, "credit_limit")

        values = dict(
            operator_id=operator_pk,
            bill_to_legal_name=bill_to,
            address=address,
            tax_vat_number=s(row, "tax_vat_id"),
            billing_contact_name=s(row, "billing_contact_name"),
            billing_contact_email=s(row, "billing_email"),
            currency=code(row, "currency", max_len=3),
            payment_terms=s(row, "payment_terms"),
            credit_limit_minor_units=int(credit_limit * 100) if credit_limit is not None else None,
            preferred_channel=map_messaging_channel(s(row, "preferred_channel")),
            messaging_to=list_(row, "messaging_to_emails"),
            messaging_cc=list_(row, "messaging_cc_emails"),
            sita_address=code(row, "sita_address", max_len=20),
            aftn_address=code(row, "aftn_address", max_len=20),
            message_format=map_message_format(s(row, "message_format")),
            sending_team_signature=s(row, "sending_team_signature"),
        )

        existing_row = existing.get(source_ref.upper())
        if existing_row is not None:
            for k, v in values.items():
                setattr(existing_row, k, v)
        else:
            billing_ref = await next_billing_ref(session, sequence_name="clients_billing_ref_seq", prefix="CLI")
            session.add(Client(source_ref=source_ref.upper(), billing_ref=billing_ref, **values))
        loaded += 1

    await session.flush()
    return ImportSheetResult(
        sheet="Clients", rows_seen=rows_seen, rows_loaded=loaded, rows_skipped=skipped, rows_quarantined=0, notes=notes
    )
