"""Engine 4 (credentials) — pure functions, no FastAPI/SQLAlchemy imports.

Passport and visa status per person, rolled up to a single blocking
signal. Visa resolution itself reuses app.domain.visa_resolution — this
module only converts that answer, plus passport status, into the rollup.
Souls on board (crew + pax) validated against max_pax.
"""

from dataclasses import dataclass
from datetime import date, timedelta


class PassportStatus:
    MISSING = "MISSING"
    EXPIRES_BEFORE_TRIP = "EXPIRES BEFORE TRIP"
    UNDER_6_MONTHS = "UNDER 6 MONTHS"
    VALID = "VALID"


class PersonRollupStatus:
    ACTION_REQUIRED = "ACTION REQUIRED"
    CHECK = "CHECK"
    OK = "OK"


# Visa requirements that are known but still need arranging — not a hard
# blocker at this layer (Documents/Phase 5 tracks whether it's actually in
# hand), but not clean either.
_VISA_NEEDS_ARRANGING = {"REQUIRED", "EVISA", "VISA_ON_ARRIVAL", "TIWB", "TRANSIT_ONLY"}


def resolve_passport_status(expiry_date: date | None, trip_end_date: date, buffer_days: int) -> str:
    if expiry_date is None:
        return PassportStatus.MISSING
    if expiry_date < trip_end_date:
        return PassportStatus.EXPIRES_BEFORE_TRIP
    if expiry_date < trip_end_date + timedelta(days=buffer_days):
        return PassportStatus.UNDER_6_MONTHS
    return PassportStatus.VALID


def resolve_person_rollup_status(passport_status: str, visa_requirement: str) -> str:
    """Any ACTION REQUIRED blocks CONFIRMED (enforced by the caller, not
    here — see spec: supervisor override with a logged reason).

    - Missing/expired passport: ACTION REQUIRED (can't travel at all).
    - Visa NOT ON FILE: ACTION REQUIRED — not knowing whether a visa is
      needed is itself a blocker, never treated as "fine".
    - Passport valid but under the 6-month buffer: CHECK.
    - A known visa requirement that still needs arranging: CHECK.
    - Valid passport + NOT REQUIRED visa: OK.
    """
    if passport_status in (PassportStatus.MISSING, PassportStatus.EXPIRES_BEFORE_TRIP):
        return PersonRollupStatus.ACTION_REQUIRED
    if visa_requirement == "NOT ON FILE":
        return PersonRollupStatus.ACTION_REQUIRED
    if passport_status == PassportStatus.UNDER_6_MONTHS:
        return PersonRollupStatus.CHECK
    if visa_requirement in _VISA_NEEDS_ARRANGING:
        return PersonRollupStatus.CHECK
    return PersonRollupStatus.OK


@dataclass(frozen=True)
class SoulsOnBoardResult:
    crew_count: int
    pax_count: int
    total: int
    max_pax: int | None
    exceeds: bool


def check_souls_on_board(crew_count: int, pax_count: int, max_pax: int | None) -> SoulsOnBoardResult:
    total = crew_count + pax_count
    exceeds = max_pax is not None and total > max_pax
    return SoulsOnBoardResult(crew_count=crew_count, pax_count=pax_count, total=total, max_pax=max_pax, exceeds=exceeds)
