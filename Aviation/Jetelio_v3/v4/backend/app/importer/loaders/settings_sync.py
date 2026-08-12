"""Syncs the `settings` table's values from the workbook's `admin` sheet
(rows 15-21, 'OPERATIONAL DEFAULTS — single source of truth for every
fallback'), so the deployed values match whatever the spreadsheet's
source-of-truth owner last set, not just the code's registry defaults.
Branding/app settings (admin sheet section 3 in USERS & SETTINGS) are
explicitly Phase 7 scope and are not synced here.
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.settings_registry import NAMED_SETTINGS_BY_KEY
from app.models.settings import Setting
from app.schemas.readiness import ImportSheetResult

_ROW_TO_KEY = {
    15: "default_permit_lead_time_hours",
    16: "default_ground_notice_hours",
    17: "range_reserve_margin",
    18: "passport_validity_buffer_days",
    19: "document_expiry_alert_days",
    20: "visa_rule_staleness_days",
    21: "allow_unverified_for_planning",
}


def _normalize(key: str, raw_value) -> str:
    if raw_value is None:
        return NAMED_SETTINGS_BY_KEY[key].default_value
    if key == "document_expiry_alert_days":
        return ",".join(part.strip() for part in str(raw_value).split(",") if part.strip())
    if key == "allow_unverified_for_planning":
        return "YES" if str(raw_value).strip().upper() in ("YES", "TRUE", "1") else "NO"
    return str(raw_value).strip()


async def sync_settings_from_admin_sheet(session: AsyncSession, ws) -> ImportSheetResult:
    existing = {row.key: row for row in (await session.execute(select(Setting))).scalars().all()}
    loaded = 0
    notes: list[str] = []

    for row_num, key in _ROW_TO_KEY.items():
        raw_value = ws.cell(row=row_num, column=2).value
        value = _normalize(key, raw_value)
        row = existing.get(key)
        if row is None:
            notes.append(f"{key}: not yet seeded, skipped (run migrations before import)")
            continue
        if row.value != value:
            notes.append(f"{key}: {row.value!r} -> {value!r} (from admin sheet)")
        row.value = value
        loaded += 1

    await session.flush()
    return ImportSheetResult(
        sheet="admin (operational defaults)", rows_seen=len(_ROW_TO_KEY), rows_loaded=loaded,
        rows_skipped=0, rows_quarantined=0, notes=notes,
    )
