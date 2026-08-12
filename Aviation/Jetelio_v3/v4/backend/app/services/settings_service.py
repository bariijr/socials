from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFoundError, ValidationFailedError, VersionConflictError
from app.core.settings_registry import NAMED_SETTINGS, NAMED_SETTINGS_BY_KEY, SettingValueType
from app.models.settings import Setting
from app.repositories.audit import write_audit_log
from app.repositories.base import Repository


def _cast(value: str, value_type: str) -> bool | int | float | list[int] | str:
    if value_type == SettingValueType.BOOLEAN.value:
        return value.strip().upper() in {"YES", "TRUE", "1"}
    if value_type == SettingValueType.INTEGER.value:
        return int(value)
    if value_type == SettingValueType.FLOAT.value:
        return float(value)
    if value_type == SettingValueType.INT_LIST.value:
        return [int(v.strip()) for v in value.split(",") if v.strip()]
    return value


async def ensure_seeded(session: AsyncSession) -> None:
    """Idempotent seed: insert any named setting missing from the table.
    Called by the importer and safe to call on every startup.
    """
    existing = {row.key for row in (await session.execute(select(Setting.key))).all()}
    for definition in NAMED_SETTINGS:
        if definition.key not in existing:
            session.add(
                Setting(
                    key=definition.key,
                    value=definition.default_value,
                    value_type=definition.value_type.value,
                    description=definition.description,
                )
            )
    await session.flush()


async def get_all(session: AsyncSession) -> list[Setting]:
    result = await session.execute(select(Setting).order_by(Setting.key))
    return list(result.scalars().all())


async def get_typed_settings_map(session: AsyncSession) -> dict[str, object]:
    rows = await get_all(session)
    return {row.key: _cast(row.value, row.value_type) for row in rows}


async def update_setting(
    session: AsyncSession, key: str, *, value: str, expected_version: int, actor_email: str, actor_id: UUID
) -> Setting:
    if key not in NAMED_SETTINGS_BY_KEY:
        raise NotFoundError("Setting", key)
    repo = Repository(session, Setting, pk_column="key")
    existing = await repo.get(key)
    if existing.version != expected_version:
        raise VersionConflictError("Setting", key, expected_version, existing.version)

    definition = NAMED_SETTINGS_BY_KEY[key]
    try:
        _cast(value, definition.value_type.value)
    except ValueError as exc:
        raise ValidationFailedError("value", f"cannot be parsed as {definition.value_type.value}") from exc

    before = existing.value
    updated = await repo.update(key, expected_version, {"value": value})
    await write_audit_log(
        session,
        actor_user_id=actor_id,
        actor_email=actor_email,
        action="UPDATE",
        entity_type="Setting",
        entity_id=key,
        from_value={"value": before},
        to_value={"value": value},
    )
    return updated
