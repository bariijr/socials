from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


async def next_billing_ref(session: AsyncSession, *, sequence_name: str, prefix: str) -> str:
    """Sequence-backed, e.g. CLI-000123 — avoids the max()+1 race condition
    a Python-computed number would have under concurrent creates. Zero-
    padded to 6 digits; never reused even if a row is later deleted, since
    Postgres sequences never step backward.
    """
    result = await session.execute(text(f"SELECT nextval('{sequence_name}')"))
    next_value = result.scalar_one()
    return f"{prefix}-{next_value:06d}"
