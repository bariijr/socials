"""Engine 3 (capability) — pure functions, no FastAPI/SQLAlchemy imports.

practical_range = max_range * (1 - reserve_margin). EXCEEDS PRACTICAL RANGE
is flagged rather than planned silently. Published performance figures are
advisory only — engineer sign-off (app.domain.reference_status.
resolve_aircraft_planning_status) gates whether a type may drive a planning
verdict at all; that is decided upstream by the caller, not here.
"""

from dataclasses import dataclass

from app.domain.great_circle import great_circle_distance_nm


def compute_practical_range_nm(max_range_nm: float, reserve_margin: float) -> float:
    return max_range_nm * (1 - reserve_margin)


@dataclass(frozen=True)
class CapabilityResult:
    distance_nm: float
    practical_range_nm: float
    exceeds: bool
    margin_nm: float


def capability_check(distance_nm: float, practical_range_nm: float) -> CapabilityResult:
    margin = practical_range_nm - distance_nm
    return CapabilityResult(
        distance_nm=distance_nm, practical_range_nm=practical_range_nm, exceeds=margin < 0, margin_nm=margin
    )


def is_capability_margin_tight(capability: CapabilityResult, tight_margin_fraction: float) -> bool:
    """TIGHT only applies once capability is otherwise OK — an already
    EXCEEDS PRACTICAL RANGE leg is NOT FEASIBLE territory, not tight.
    """
    if capability.exceeds or capability.practical_range_nm <= 0:
        return False
    return capability.margin_nm < capability.practical_range_nm * tight_margin_fraction


@dataclass(frozen=True)
class TechStopCandidate:
    icao: str
    lat: float
    lon: float
    longest_runway_ft: float | None
    fuel_grades: list[str] | None
    is_airport_of_entry: bool | None
    operating_hours_present: bool


@dataclass(frozen=True)
class TechStopSuggestion:
    icao: str
    leg1_distance_nm: float
    leg2_distance_nm: float
    added_distance_nm: float


def filter_tech_stop_candidates(
    *,
    dep_lat: float,
    dep_lon: float,
    arr_lat: float,
    arr_lon: float,
    direct_distance_nm: float,
    candidates: list[TechStopCandidate],
    practical_range_nm: float,
    min_runway_ft: float | None,
    required_fuel_grades: set[str] | None,
) -> list[TechStopSuggestion]:
    """Filtered by range from both ends, runway length, fuel grade,
    airport-of-entry status and operating hours (spec section, Engine 3),
    sorted by least added distance.
    """
    suggestions: list[TechStopSuggestion] = []
    for candidate in candidates:
        if candidate.is_airport_of_entry is not True:
            continue
        if not candidate.operating_hours_present:
            continue
        if min_runway_ft is not None and (
            candidate.longest_runway_ft is None or candidate.longest_runway_ft < min_runway_ft
        ):
            continue
        if required_fuel_grades and not (candidate.fuel_grades and required_fuel_grades & set(candidate.fuel_grades)):
            continue

        leg1 = great_circle_distance_nm(dep_lat, dep_lon, candidate.lat, candidate.lon)
        leg2 = great_circle_distance_nm(candidate.lat, candidate.lon, arr_lat, arr_lon)
        if leg1 > practical_range_nm or leg2 > practical_range_nm:
            continue

        suggestions.append(
            TechStopSuggestion(
                icao=candidate.icao,
                leg1_distance_nm=leg1,
                leg2_distance_nm=leg2,
                added_distance_nm=(leg1 + leg2) - direct_distance_nm,
            )
        )

    suggestions.sort(key=lambda s: s.added_distance_nm)
    return suggestions
