import pytest

from app.domain.capability import (
    TechStopCandidate,
    capability_check,
    compute_practical_range_nm,
    filter_tech_stop_candidates,
    is_capability_margin_tight,
)
from app.domain.great_circle import great_circle_distance_nm

DEP = (0.0, 0.0)
ARR = (0.0, 60.0)
DIRECT_NM = great_circle_distance_nm(*DEP, *ARR)


def _candidate(icao: str, lon: float, **overrides) -> TechStopCandidate:
    base = dict(
        icao=icao,
        lat=0.0,
        lon=lon,
        longest_runway_ft=10000.0,
        fuel_grades=["JET A-1"],
        is_airport_of_entry=True,
        operating_hours_present=True,
    )
    base.update(overrides)
    return TechStopCandidate(**base)


class TestComputePracticalRangeNm:
    def test_applies_reserve_margin(self):
        assert compute_practical_range_nm(4000, 0.15) == pytest.approx(3400)

    def test_zero_margin_returns_max_range(self):
        assert compute_practical_range_nm(4000, 0.0) == pytest.approx(4000)


class TestCapabilityCheck:
    def test_within_range_does_not_exceed(self):
        result = capability_check(distance_nm=2000, practical_range_nm=3000)
        assert result.exceeds is False
        assert result.margin_nm == pytest.approx(1000)

    def test_beyond_range_exceeds(self):
        result = capability_check(distance_nm=3500, practical_range_nm=3000)
        assert result.exceeds is True
        assert result.margin_nm == pytest.approx(-500)

    def test_exactly_at_range_does_not_exceed(self):
        result = capability_check(distance_nm=3000, practical_range_nm=3000)
        assert result.exceeds is False
        assert result.margin_nm == 0.0


class TestIsCapabilityMarginTight:
    def test_exceeding_range_is_never_tight(self):
        exceeded = capability_check(distance_nm=3500, practical_range_nm=3000)
        assert is_capability_margin_tight(exceeded, tight_margin_fraction=0.10) is False

    def test_thin_margin_is_tight(self):
        result = capability_check(distance_nm=2950, practical_range_nm=3000)  # margin 50, 1.7%
        assert is_capability_margin_tight(result, tight_margin_fraction=0.10) is True

    def test_comfortable_margin_is_not_tight(self):
        result = capability_check(distance_nm=2000, practical_range_nm=3000)  # margin 1000, 33%
        assert is_capability_margin_tight(result, tight_margin_fraction=0.10) is False


class TestFilterTechStopCandidates:
    def _run(self, candidates, practical_range_nm=2000.0, min_runway_ft=5000.0, required_fuel_grades=None):
        return filter_tech_stop_candidates(
            dep_lat=DEP[0],
            dep_lon=DEP[1],
            arr_lat=ARR[0],
            arr_lon=ARR[1],
            direct_distance_nm=DIRECT_NM,
            candidates=candidates,
            practical_range_nm=practical_range_nm,
            min_runway_ft=min_runway_ft,
            required_fuel_grades=required_fuel_grades,
        )

    def test_midpoint_candidate_within_range_on_both_legs_is_accepted(self):
        result = self._run([_candidate("MID1", 30.0)])
        assert len(result) == 1
        assert result[0].icao == "MID1"
        assert result[0].added_distance_nm == pytest.approx(0.0, abs=1.0)

    def test_candidate_too_far_from_departure_is_rejected(self):
        # Close to arrival only — the departure leg exceeds practical range.
        result = self._run([_candidate("FAR1", 58.0)])
        assert result == []

    def test_candidate_missing_airport_of_entry_status_is_rejected(self):
        result = self._run([_candidate("NOENTRY", 30.0, is_airport_of_entry=False)])
        assert result == []

    def test_candidate_with_no_confirmed_operating_hours_is_rejected(self):
        result = self._run([_candidate("NOHOURS", 30.0, operating_hours_present=False)])
        assert result == []

    def test_candidate_with_short_runway_is_rejected(self):
        result = self._run([_candidate("SHORT", 30.0, longest_runway_ft=3000.0)], min_runway_ft=5000.0)
        assert result == []

    def test_candidate_without_required_fuel_grade_is_rejected(self):
        result = self._run([_candidate("NOFUEL", 30.0, fuel_grades=["AVGAS 100LL"])], required_fuel_grades={"JET A-1"})
        assert result == []

    def test_results_sorted_by_least_added_distance(self):
        # CENTER sits exactly on the direct equatorial path (~zero added
        # distance); OFFCENTER is laterally displaced (lat=3), so it's a
        # genuine detour and must sort after CENTER.
        offcenter = _candidate("OFFCENTER", 30.0, lat=3.0)
        center = _candidate("CENTER", 30.0)
        result = self._run([offcenter, center])
        assert [c.icao for c in result] == ["CENTER", "OFFCENTER"]
        assert result[0].added_distance_nm < result[1].added_distance_nm
