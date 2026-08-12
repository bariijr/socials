from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.importer.lookups import map_messaging_channel
from app.importer.xlsx_reader import read_rows, s
from app.models.messaging import MessageTemplate
from app.schemas.readiness import ImportSheetResult


async def load_message_templates(session: AsyncSession, ws) -> ImportSheetResult:
    loaded = skipped = 0
    notes: list[str] = []
    rows_seen = 0

    existing = {
        row.template_key: row for row in (await session.execute(select(MessageTemplate))).scalars().all()
    }

    for row in read_rows(ws, header_row=37, data_start_row=38, stop_at_blank=True):
        rows_seen += 1
        template_key = s(row, "template_id")
        body = s(row, "body_template")
        if not template_key or not body:
            skipped += 1
            continue

        channel = map_messaging_channel(s(row, "channel")) or map_messaging_channel("EMAIL")

        values = dict(
            name=s(row, "template_name") or template_key,
            message_type=s(row, "message_type") or "OTHER",
            recipient_role=s(row, "recipient_role") or "UNSPECIFIED",
            channel=channel,
            subject_line=s(row, "subject_line"),
            body=body,
            footer_block=s(row, "footer_block"),
            active=(s(row, "active") or "YES").upper() == "YES",
        )

        existing_row = existing.get(template_key)
        if existing_row is not None:
            for k, v in values.items():
                setattr(existing_row, k, v)
        else:
            session.add(MessageTemplate(template_key=template_key, **values))
        loaded += 1

    await session.flush()
    return ImportSheetResult(
        sheet="MESSAGE TEMPLATES", rows_seen=rows_seen, rows_loaded=loaded, rows_skipped=skipped,
        rows_quarantined=0, notes=notes,
    )
