"""Visa requirement resolution — precedence only, pure function.

Precedence, in this exact order: airport-specific override -> exact
(country, nationality) rule -> matrix cell -> NOT ON FILE. Never guess,
never default to NOT REQUIRED. Full per-leg/per-person visa status
(Engine 4) is built in Phase 2; this is the reference-data-layer lookup
used by CRUD/browse endpoints and reused by that engine later.
"""

from dataclasses import dataclass
from datetime import date


NOT_ON_FILE = "NOT ON FILE"


@dataclass(frozen=True)
class VisaAnswer:
    requirement: str
    visa_type: str | None
    lead_time_days: int | None
    max_stay_days: int | None
    conditions: str | None
    source: str | None
    verified_by: str | None
    verified_on: date | None
    expires_on: date | None
    answered_by_layer: str  # AIRPORT_OVERRIDE | COUNTRY_NATIONALITY_RULE | MATRIX_CELL | NOT_ON_FILE


def resolve_visa_requirement(
    *,
    airport_override: dict | None,
    country_nationality_rule: dict | None,
    matrix_cell: dict | None,
) -> VisaAnswer:
    """Each argument, if present, is a plain dict with the visa-rule shape
    (requirement, visa_type, lead_time_days, max_stay_days, conditions,
    source, verified_by, verified_on, expires_on). None means no row
    exists at that layer — resolution falls through, it never guesses.
    """
    for layer_name, row in (
        ("AIRPORT_OVERRIDE", airport_override),
        ("COUNTRY_NATIONALITY_RULE", country_nationality_rule),
        ("MATRIX_CELL", matrix_cell),
    ):
        if row is not None:
            return VisaAnswer(
                requirement=row["requirement"],
                visa_type=row.get("visa_type"),
                lead_time_days=row.get("lead_time_days"),
                max_stay_days=row.get("max_stay_days"),
                conditions=row.get("conditions"),
                source=row.get("source"),
                verified_by=row.get("verified_by"),
                verified_on=row.get("verified_on"),
                expires_on=row.get("expires_on"),
                answered_by_layer=layer_name,
            )
    return VisaAnswer(
        requirement=NOT_ON_FILE,
        visa_type=None,
        lead_time_days=None,
        max_stay_days=None,
        conditions=None,
        source=None,
        verified_by=None,
        verified_on=None,
        expires_on=None,
        answered_by_layer="NOT_ON_FILE",
    )


def is_visa_rule_stale(verified_on: date | None, today: date, staleness_days: int) -> bool:
    """Rules older than a configurable age render STALE and queue
    re-verification. A rule with no verified_on is not "stale" by this
    definition — it is simply unverified (a different, more severe state
    handled by the caller).
    """
    if verified_on is None:
        return False
    return (today - verified_on).days > staleness_days
