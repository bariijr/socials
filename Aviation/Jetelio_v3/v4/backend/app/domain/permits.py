"""Engine 2 (permits) — pure functions, no FastAPI/SQLAlchemy imports.

Overflight for every en-route state except the leg's departure state
(clearance held) and destination state (covered by the landing permit).
One landing permit per arrival — landing twice in a state means two
permits, so results are indexed by leg, never deduped by country. Ground
handling is one order per country per trip, due at the earliest ground
event in that country; every other service (the other 14 top-level
catalogue codes, confirmed against the live service_catalogue table) is
per-stop. file_by = reference_datetime - lead_time_hours, all UTC.
"""

from dataclasses import dataclass, field
from datetime import datetime, timedelta

from dateutil.relativedelta import relativedelta

GROUND_HANDLING_CODE = "GH"


class ServiceScope:
    PER_COUNTRY_PER_TRIP = "PER_COUNTRY_PER_TRIP"
    PER_STOP = "PER_STOP"


class DeadlineStatus:
    OVERDUE = "OVERDUE"
    URGENT = "URGENT"
    DUE_SOON = "DUE SOON"
    PENDING = "PENDING"


class FeasibilityVerdict:
    NOT_FEASIBLE = "NOT FEASIBLE"
    NOT_FEASIBLE_AS_ROUTED = "NOT FEASIBLE AS ROUTED"
    TIGHT = "TIGHT"
    FEASIBLE = "FEASIBLE"


class PermitValidityUnit:
    """Mirrors app.models.country.PermitValidityUnit's values as plain
    strings — this module stays free of SQLAlchemy/model imports, same
    convention as DeadlineStatus/ServiceScope above."""

    HOURS = "HOURS"
    DAYS = "DAYS"
    WEEKS = "WEEKS"
    MONTHS = "MONTHS"


def compute_file_by(reference_datetime: datetime, lead_time_hours: float) -> datetime:
    return reference_datetime - timedelta(hours=lead_time_hours)


def normalize_request_type(value: str) -> str:
    """CountryRequirement.request_type is free text straight from the
    source workbook ("GROUND HANDLING", not "GROUND_HANDLING") — comparing
    it against an internal constant with `==` is fragile. Normalize both
    sides through this before comparing."""
    return value.strip().upper().replace(" ", "_").replace("-", "_")


def compute_valid_until(granted_at: datetime, amount: float, unit: str) -> datetime:
    """Forward computation, the mirror image of compute_file_by: a granted
    permit stays valid from granted_at for `amount` of `unit`. WEEKS/HOURS/
    DAYS are fixed-duration (timedelta); MONTHS is calendar arithmetic
    (relativedelta) since a month isn't a fixed number of hours — fractional
    months aren't meaningful so amount is truncated to whole months there.
    """
    if unit == PermitValidityUnit.HOURS:
        return granted_at + timedelta(hours=amount)
    if unit == PermitValidityUnit.DAYS:
        return granted_at + timedelta(days=amount)
    if unit == PermitValidityUnit.WEEKS:
        return granted_at + timedelta(weeks=amount)
    if unit == PermitValidityUnit.MONTHS:
        return granted_at + relativedelta(months=int(amount))
    raise ValueError(f"Unknown permit validity unit: {unit!r}")


def classify_deadline(file_by: datetime, now: datetime) -> str:
    """OVERDUE (past) / URGENT (<24h) / DUE SOON (<72h) / PENDING."""
    hours_until = (file_by - now).total_seconds() / 3600.0
    if hours_until < 0:
        return DeadlineStatus.OVERDUE
    if hours_until < 24:
        return DeadlineStatus.URGENT
    if hours_until < 72:
        return DeadlineStatus.DUE_SOON
    return DeadlineStatus.PENDING


@dataclass(frozen=True)
class OverflightPermitRequirement:
    leg_index: int
    country_iso3: str


def determine_overflight_permits(
    leg_index: int, route_states_iso3: list[str], departure_iso3: str, arrival_iso3: str
) -> list[OverflightPermitRequirement]:
    """Every en-route state except departure (clearance held) and arrival
    (covered by the landing permit). route_states_iso3 is assumed ordered
    and de-duplicated already (Engine 1's job).
    """
    excluded = {departure_iso3, arrival_iso3}
    return [
        OverflightPermitRequirement(leg_index=leg_index, country_iso3=iso3)
        for iso3 in route_states_iso3
        if iso3 not in excluded
    ]


@dataclass(frozen=True)
class LandingPermitRequirement:
    leg_index: int
    country_iso3: str


def determine_landing_permits(arrivals: list[tuple[int, str]]) -> list[LandingPermitRequirement]:
    """One per (leg_index, country) pair, never deduped by country — landing
    twice in a state means two permits.
    """
    return [LandingPermitRequirement(leg_index=leg_index, country_iso3=iso3) for leg_index, iso3 in arrivals]


def classify_service_scope(service_code: str) -> str:
    """GH (Ground Handling) is the one catalogue code the spec singles out
    as per-country-per-trip; every other top-level service is per-stop.
    """
    return ServiceScope.PER_COUNTRY_PER_TRIP if service_code == GROUND_HANDLING_CODE else ServiceScope.PER_STOP


@dataclass(frozen=True)
class StopEvent:
    country_iso3: str
    icao: str
    event_datetime: datetime


@dataclass(frozen=True)
class GroundHandlingOrder:
    country_iso3: str
    due_at: datetime
    earliest_icao: str


def determine_ground_handling_orders(stops: list[StopEvent]) -> list[GroundHandlingOrder]:
    """One order per country per trip, due at the earliest ground event
    in that country — never one per airport.
    """
    earliest_by_country: dict[str, StopEvent] = {}
    for stop in stops:
        current = earliest_by_country.get(stop.country_iso3)
        if current is None or stop.event_datetime < current.event_datetime:
            earliest_by_country[stop.country_iso3] = stop

    ordered = sorted(earliest_by_country.values(), key=lambda s: s.event_datetime)
    return [
        GroundHandlingOrder(country_iso3=stop.country_iso3, due_at=stop.event_datetime, earliest_icao=stop.icao)
        for stop in ordered
    ]


@dataclass(frozen=True)
class StateCrossing:
    iso3: str
    entry_datetime: datetime
    exit_datetime: datetime


def compute_state_crossings(
    ordered_states: list[tuple[str, int]],
    sample_point_count: int,
    reference_datetime: datetime,
    eet_hours: float,
) -> dict[str, StateCrossing]:
    """Entry/exit instants per state along the route, linearly interpolated
    from EET — the same great-circle-track simplification already used for
    distance (cumulative_nm is exactly linear in sample index, see
    app.domain.great_circle.sample_great_circle_track). Exit for a state is
    the entry instant of the next state in route order, or trip end for the
    last one; a state entered more than once keeps its first crossing —
    route pass-throughs are not re-timed.
    """
    crossings: dict[str, StateCrossing] = {}
    n = len(ordered_states)
    for i, (iso3, index) in enumerate(ordered_states):
        if iso3 in crossings:
            continue
        entry_fraction = index / (sample_point_count - 1) if sample_point_count > 1 else 0.0
        if i + 1 < n:
            next_index = ordered_states[i + 1][1]
            exit_fraction = next_index / (sample_point_count - 1) if sample_point_count > 1 else 1.0
        else:
            exit_fraction = 1.0
        crossings[iso3] = StateCrossing(
            iso3=iso3,
            entry_datetime=reference_datetime + timedelta(hours=eet_hours * entry_fraction),
            exit_datetime=reference_datetime + timedelta(hours=eet_hours * exit_fraction),
        )
    return crossings


@dataclass(frozen=True)
class AvoidIncludeViolation:
    violated: bool
    avoided_states_transited: list[str] = field(default_factory=list)
    required_states_missed: list[str] = field(default_factory=list)


def check_avoid_include_violation(
    route_states_iso3: list[str], avoid_states: set[str], include_states: set[str]
) -> AvoidIncludeViolation:
    transited = [iso3 for iso3 in route_states_iso3 if iso3 in avoid_states]
    missed = [iso3 for iso3 in include_states if iso3 not in route_states_iso3]
    return AvoidIncludeViolation(
        violated=bool(transited or missed), avoided_states_transited=transited, required_states_missed=missed
    )


def determine_feasibility_verdict(
    *,
    capability_exceeds_even_with_tech_stop: bool,
    avoid_include_violated: bool,
    reroute_found: bool,
    margin_tight: bool,
) -> str:
    """Precedence: capability failure that no tech stop fixes always wins
    (NOT FEASIBLE). An avoid/include violation with no viable re-route is
    also NOT FEASIBLE; with a viable re-route it's NOT FEASIBLE AS ROUTED —
    the plan as specified doesn't work, but an alternative does. Otherwise
    a thin capability or deadline margin renders TIGHT, else FEASIBLE.
    """
    if capability_exceeds_even_with_tech_stop:
        return FeasibilityVerdict.NOT_FEASIBLE
    if avoid_include_violated and not reroute_found:
        return FeasibilityVerdict.NOT_FEASIBLE
    if avoid_include_violated and reroute_found:
        return FeasibilityVerdict.NOT_FEASIBLE_AS_ROUTED
    if margin_tight:
        return FeasibilityVerdict.TIGHT
    return FeasibilityVerdict.FEASIBLE


_VERDICT_SEVERITY = {
    FeasibilityVerdict.NOT_FEASIBLE: 3,
    FeasibilityVerdict.NOT_FEASIBLE_AS_ROUTED: 2,
    FeasibilityVerdict.TIGHT: 1,
    FeasibilityVerdict.FEASIBLE: 0,
}


def aggregate_trip_verdict(leg_verdicts: list[str]) -> str:
    """A multi-leg trip is only as good as its worst leg — the trip verdict
    is the most severe of the per-leg verdicts (NOT FEASIBLE > NOT FEASIBLE
    AS ROUTED > TIGHT > FEASIBLE). An empty leg list is FEASIBLE (nothing
    to fail on), never used in practice since a trip needs at least one leg.
    """
    if not leg_verdicts:
        return FeasibilityVerdict.FEASIBLE
    return max(leg_verdicts, key=lambda v: _VERDICT_SEVERITY[v])
