from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.importer.lookups import RefIndex
from app.importer.xlsx_reader import b, read_rows, s
from app.models.user import User, UserRole
from app.schemas.readiness import ImportSheetResult

DEFAULT_SEED_PASSWORD = "Jetelio-Phase1-ChangeMe!"


def _map_role(value: str | None) -> UserRole | None:
    if not value:
        return None
    key = value.strip().upper().replace(" - ", "_").replace(" ", "_")
    try:
        return UserRole(key)
    except ValueError:
        return None


async def load_users(session: AsyncSession, ws, operators: RefIndex, clients: RefIndex) -> ImportSheetResult:
    loaded = skipped = 0
    notes: list[str] = [f"all seeded users get the shared dev password {DEFAULT_SEED_PASSWORD!r} — reset before any real use"]
    rows_seen = 0

    existing = {row.email: row for row in (await session.execute(select(User))).scalars().all()}

    for row in read_rows(ws, header_row=14, data_start_row=15, stop_at_blank=True):
        rows_seen += 1
        email = s(row, "email")
        full_name = s(row, "full_name")
        role = _map_role(s(row, "role"))
        if not email or not full_name or role is None:
            skipped += 1
            notes.append(f"row {rows_seen}: incomplete user row, skipped")
            continue

        operator_scope = s(row, "operator_scope")
        client_scope = s(row, "client_scope")
        operator_pk = None if not operator_scope or operator_scope.upper() == "ALL" else operators.resolve(operator_scope)
        client_pk = None if not client_scope or client_scope.upper() == "ALL" else clients.resolve(client_scope)

        values = dict(
            full_name=full_name,
            role=role,
            operator_id=operator_pk,
            client_id=client_pk,
            is_active=(s(row, "status") or "ACTIVE").upper() == "ACTIVE",
            mfa_enabled=bool(b(row, "mfa_enabled")),
        )

        existing_row = existing.get(email.lower())
        if existing_row is not None:
            for k, v in values.items():
                setattr(existing_row, k, v)
        else:
            session.add(User(email=email.lower(), hashed_password=hash_password(DEFAULT_SEED_PASSWORD), **values))
        loaded += 1

    await session.flush()
    return ImportSheetResult(
        sheet="USERS & SETTINGS (users)", rows_seen=rows_seen, rows_loaded=loaded, rows_skipped=skipped,
        rows_quarantined=0, notes=notes,
    )
