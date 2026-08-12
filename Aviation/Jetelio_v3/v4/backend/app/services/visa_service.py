from datetime import date, datetime, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.visa_resolution import resolve_visa_requirement, is_visa_rule_stale
from app.models.visa import VisaMatrixCell, VisaRule
from app.repositories.audit import write_audit_log
from app.repositories.base import Repository
from app.schemas.visa import (
    VisaLookupResult,
    VisaMatrixCellCreate,
    VisaMatrixCellOut,
    VisaMatrixCellUpdate,
    VisaRuleCreate,
    VisaRuleOut,
    VisaRuleUpdate,
)


def _row_to_dict(row) -> dict:
    return {
        "requirement": row.requirement.value if hasattr(row.requirement, "value") else row.requirement,
        "visa_type": row.visa_type,
        "lead_time_days": row.lead_time_days,
        "max_stay_days": row.max_stay_days,
        "conditions": row.conditions,
        "source": row.source,
        "verified_by": row.verified_by,
        "verified_on": row.verified_on,
        "expires_on": row.expires_on,
    }


def _cell_to_out(cell: VisaMatrixCell, staleness_days: int, today: date) -> VisaMatrixCellOut:
    base = {n: getattr(cell, n) for n in VisaMatrixCellOut.model_fields if hasattr(cell, n)}
    return VisaMatrixCellOut(**{**base, "is_stale": is_visa_rule_stale(cell.verified_on, today, staleness_days)})


def _rule_to_out(rule: VisaRule, staleness_days: int, today: date) -> VisaRuleOut:
    base = {n: getattr(rule, n) for n in VisaRuleOut.model_fields if hasattr(rule, n)}
    return VisaRuleOut(**{**base, "is_stale": is_visa_rule_stale(rule.verified_on, today, staleness_days)})


# --- Matrix cells ---

async def list_matrix_cells(
    session: AsyncSession, *, page: int, page_size: int, country_iso3: str | None, staleness_days: int
) -> tuple[list[VisaMatrixCellOut], int]:
    repo = Repository(session, VisaMatrixCell)
    items, total = await repo.list(page=page, page_size=page_size, filters={"country_iso3": country_iso3})
    today = datetime.now(timezone.utc).date()
    return [_cell_to_out(c, staleness_days, today) for c in items], total


async def create_matrix_cell(
    session: AsyncSession, payload: VisaMatrixCellCreate, *, staleness_days: int, actor_id: UUID, actor_email: str
) -> VisaMatrixCellOut:
    repo = Repository(session, VisaMatrixCell)
    created = await repo.create(VisaMatrixCell(**payload.model_dump()))
    await write_audit_log(
        session, actor_user_id=actor_id, actor_email=actor_email, action="CREATE",
        entity_type="VisaMatrixCell", entity_id=str(created.id), to_value=payload.model_dump(mode="json"),
    )
    return _cell_to_out(created, staleness_days, datetime.now(timezone.utc).date())


async def update_matrix_cell(
    session: AsyncSession, cell_id: UUID, payload: VisaMatrixCellUpdate, *, staleness_days: int, actor_id: UUID, actor_email: str
) -> VisaMatrixCellOut:
    repo = Repository(session, VisaMatrixCell)
    values = payload.model_dump(exclude={"version"}, exclude_unset=True)
    updated = await repo.update(cell_id, payload.version, values)
    await write_audit_log(
        session, actor_user_id=actor_id, actor_email=actor_email, action="UPDATE",
        entity_type="VisaMatrixCell", entity_id=str(updated.id), to_value=values,
    )
    return _cell_to_out(updated, staleness_days, datetime.now(timezone.utc).date())


# --- Rules (override layer) ---

async def list_rules(
    session: AsyncSession, *, page: int, page_size: int, country_iso3: str | None, staleness_days: int
) -> tuple[list[VisaRuleOut], int]:
    repo = Repository(session, VisaRule)
    items, total = await repo.list(page=page, page_size=page_size, filters={"country_iso3": country_iso3})
    today = datetime.now(timezone.utc).date()
    return [_rule_to_out(r, staleness_days, today) for r in items], total


async def create_rule(
    session: AsyncSession, payload: VisaRuleCreate, *, staleness_days: int, actor_id: UUID, actor_email: str
) -> VisaRuleOut:
    repo = Repository(session, VisaRule)
    created = await repo.create(VisaRule(**payload.model_dump()))
    await write_audit_log(
        session, actor_user_id=actor_id, actor_email=actor_email, action="CREATE",
        entity_type="VisaRule", entity_id=str(created.id), to_value=payload.model_dump(mode="json"),
    )
    return _rule_to_out(created, staleness_days, datetime.now(timezone.utc).date())


async def update_rule(
    session: AsyncSession, rule_id: UUID, payload: VisaRuleUpdate, *, staleness_days: int, actor_id: UUID, actor_email: str
) -> VisaRuleOut:
    repo = Repository(session, VisaRule)
    values = payload.model_dump(exclude={"version"}, exclude_unset=True)
    updated = await repo.update(rule_id, payload.version, values)
    await write_audit_log(
        session, actor_user_id=actor_id, actor_email=actor_email, action="UPDATE",
        entity_type="VisaRule", entity_id=str(updated.id), to_value=values,
    )
    return _rule_to_out(updated, staleness_days, datetime.now(timezone.utc).date())


# --- Resolution lookup (reference-data convenience; full Engine 4 lands Phase 2) ---

async def lookup(
    session: AsyncSession, *, country_iso3: str, nationality_iso3: str, airport_icao: str | None, staleness_days: int
) -> VisaLookupResult:
    country_iso3 = country_iso3.upper()
    nationality_iso3 = nationality_iso3.upper()

    airport_override = None
    if airport_icao:
        stmt = select(VisaRule).where(
            VisaRule.country_iso3 == country_iso3,
            VisaRule.nationality_iso3 == nationality_iso3,
            VisaRule.airport_icao == airport_icao.upper(),
            VisaRule.deleted_at.is_(None),
        )
        row = (await session.execute(stmt)).scalar_one_or_none()
        airport_override = _row_to_dict(row) if row else None

    stmt = select(VisaRule).where(
        VisaRule.country_iso3 == country_iso3,
        VisaRule.nationality_iso3 == nationality_iso3,
        VisaRule.airport_icao.is_(None),
        VisaRule.deleted_at.is_(None),
    )
    exact_rule_row = (await session.execute(stmt)).scalar_one_or_none()
    exact_rule = _row_to_dict(exact_rule_row) if exact_rule_row else None

    stmt = select(VisaMatrixCell).where(
        VisaMatrixCell.country_iso3 == country_iso3,
        VisaMatrixCell.nationality_iso3 == nationality_iso3,
        VisaMatrixCell.deleted_at.is_(None),
    )
    matrix_row = (await session.execute(stmt)).scalar_one_or_none()
    matrix_cell = _row_to_dict(matrix_row) if matrix_row else None

    answer = resolve_visa_requirement(
        airport_override=airport_override, country_nationality_rule=exact_rule, matrix_cell=matrix_cell
    )
    today = datetime.now(timezone.utc).date()
    return VisaLookupResult(
        country_iso3=country_iso3,
        nationality_iso3=nationality_iso3,
        airport_icao=airport_icao.upper() if airport_icao else None,
        requirement=answer.requirement,
        visa_type=answer.visa_type,
        lead_time_days=answer.lead_time_days,
        max_stay_days=answer.max_stay_days,
        conditions=answer.conditions,
        source=answer.source,
        verified_by=answer.verified_by,
        verified_on=answer.verified_on,
        expires_on=answer.expires_on,
        answered_by_layer=answer.answered_by_layer,
        is_stale=is_visa_rule_stale(answer.verified_on, today, staleness_days),
    )
