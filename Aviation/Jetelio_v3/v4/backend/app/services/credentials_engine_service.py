"""Engine 4 (credentials) — service layer. Per-person passport + visa
status, rolled up, plus souls-on-board. Visa resolution reuses
app.domain.visa_resolution.resolve_visa_requirement — not reimplemented.
"""

from dataclasses import dataclass
from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.credentials import (
    PersonRollupStatus,
    SoulsOnBoardResult,
    check_souls_on_board,
    resolve_passport_status,
    resolve_person_rollup_status,
)
from app.domain.visa_resolution import VisaAnswer, resolve_visa_requirement
from app.models.visa import VisaMatrixCell, VisaRule
from app.services import settings_service


@dataclass(frozen=True)
class PersonInput:
    person_id: str
    # A real, admin-defined role code (task #120) — see
    # app.services.person_role_service, not a fixed CREW|PAX enum.
    role: str
    nationality_iso3: str
    passport_expiry: date | None


@dataclass(frozen=True)
class PersonCredentialResult:
    person_id: str
    role: str
    passport_status: str
    visa_answer: VisaAnswer
    rollup_status: str


@dataclass(frozen=True)
class LegCredentialsResult:
    persons: list[PersonCredentialResult]
    souls_on_board: SoulsOnBoardResult
    any_action_required: bool


def _row_to_visa_dict(row: VisaRule | VisaMatrixCell | None) -> dict | None:
    if row is None:
        return None
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


async def _resolve_person_visa(
    session: AsyncSession, arrival_iso3: str, arrival_icao: str, nationality_iso3: str
) -> VisaAnswer:
    airport_override = (
        await session.execute(
            select(VisaRule).where(
                VisaRule.country_iso3 == arrival_iso3,
                VisaRule.nationality_iso3 == nationality_iso3,
                VisaRule.airport_icao == arrival_icao,
                VisaRule.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    country_nationality_rule = (
        await session.execute(
            select(VisaRule).where(
                VisaRule.country_iso3 == arrival_iso3,
                VisaRule.nationality_iso3 == nationality_iso3,
                VisaRule.airport_icao.is_(None),
                VisaRule.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    matrix_cell = (
        await session.execute(
            select(VisaMatrixCell).where(
                VisaMatrixCell.country_iso3 == arrival_iso3,
                VisaMatrixCell.nationality_iso3 == nationality_iso3,
                VisaMatrixCell.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()

    return resolve_visa_requirement(
        airport_override=_row_to_visa_dict(airport_override),
        country_nationality_rule=_row_to_visa_dict(country_nationality_rule),
        matrix_cell=_row_to_visa_dict(matrix_cell),
    )


async def compute_leg_credentials(
    session: AsyncSession,
    *,
    persons: list[PersonInput],
    arrival_iso3: str,
    arrival_icao: str,
    trip_end_date: date,
    max_pax: int | None,
    role_is_crew: dict[str, bool],
) -> LegCredentialsResult:
    settings_map = await settings_service.get_typed_settings_map(session)
    buffer_days = settings_map["passport_validity_buffer_days"]

    results: list[PersonCredentialResult] = []
    for person in persons:
        passport_status = resolve_passport_status(person.passport_expiry, trip_end_date, buffer_days)
        visa_answer = await _resolve_person_visa(session, arrival_iso3, arrival_icao, person.nationality_iso3)
        rollup_status = resolve_person_rollup_status(passport_status, visa_answer.requirement)
        results.append(
            PersonCredentialResult(
                person_id=person.person_id,
                role=person.role,
                passport_status=passport_status,
                visa_answer=visa_answer,
                rollup_status=rollup_status,
            )
        )

    # Task #120: role_is_crew is fetched once per leg computation and
    # passed in (app.services.person_role_service.get_crew_bucket_map),
    # not queried per person — mirrors settings_map's fetch-once pattern.
    # An unrecognized role defaults to non-crew (pax) — same
    # erring-toward-the-safer-interpretation stance the old fixed
    # CREW_ROLES/PAX_ROLES frozensets used for OTHER.
    crew_count = sum(1 for p in persons if role_is_crew.get(p.role, False))
    pax_count = len(persons) - crew_count
    souls_on_board = check_souls_on_board(crew_count, pax_count, max_pax)
    any_action_required = any(r.rollup_status == PersonRollupStatus.ACTION_REQUIRED for r in results)

    return LegCredentialsResult(persons=results, souls_on_board=souls_on_board, any_action_required=any_action_required)
