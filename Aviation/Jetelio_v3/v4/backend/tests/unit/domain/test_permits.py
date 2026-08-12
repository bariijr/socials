from datetime import datetime, timedelta, timezone

import pytest

from app.domain.permits import (
    DeadlineStatus,
    FeasibilityVerdict,
    GROUND_HANDLING_CODE,
    PermitValidityUnit,
    ServiceScope,
    StopEvent,
    aggregate_trip_verdict,
    check_avoid_include_violation,
    classify_deadline,
    classify_service_scope,
    compute_file_by,
    compute_state_crossings,
    compute_valid_until,
    determine_feasibility_verdict,
    determine_ground_handling_orders,
    determine_landing_permits,
    determine_overflight_permits,
)


def _dt(hour_offset: float, base: datetime | None = None) -> datetime:
    base = base or datetime(2026, 1, 1, 12, 0, tzinfo=timezone.utc)
    return base + timedelta(hours=hour_offset)


class TestComputeFileBy:
    def test_subtracts_lead_time(self):
        ref = datetime(2026, 3, 10, 12, 0, tzinfo=timezone.utc)
        file_by = compute_file_by(ref, 72)
        assert file_by == datetime(2026, 3, 7, 12, 0, tzinfo=timezone.utc)


class TestComputeValidUntil:
    def test_hours(self):
        granted = datetime(2026, 3, 10, 12, 0, tzinfo=timezone.utc)
        assert compute_valid_until(granted, 48, PermitValidityUnit.HOURS) == datetime(
            2026, 3, 12, 12, 0, tzinfo=timezone.utc
        )

    def test_days(self):
        granted = datetime(2026, 3, 10, 12, 0, tzinfo=timezone.utc)
        assert compute_valid_until(granted, 30, PermitValidityUnit.DAYS) == datetime(
            2026, 4, 9, 12, 0, tzinfo=timezone.utc
        )

    def test_weeks(self):
        granted = datetime(2026, 3, 10, 12, 0, tzinfo=timezone.utc)
        assert compute_valid_until(granted, 2, PermitValidityUnit.WEEKS) == datetime(
            2026, 3, 24, 12, 0, tzinfo=timezone.utc
        )

    def test_months_uses_calendar_arithmetic_not_a_fixed_30_days(self):
        # Jan 31 + 1 month must land on Feb 28 (2026 is not a leap year),
        # which a fixed timedelta(days=30) would get wrong (Mar 2).
        granted = datetime(2026, 1, 31, 0, 0, tzinfo=timezone.utc)
        assert compute_valid_until(granted, 1, PermitValidityUnit.MONTHS) == datetime(
            2026, 2, 28, 0, 0, tzinfo=timezone.utc
        )

    def test_unknown_unit_raises(self):
        with pytest.raises(ValueError):
            compute_valid_until(datetime(2026, 1, 1, tzinfo=timezone.utc), 1, "FORTNIGHTS")


class TestClassifyDeadline:
    def test_past_file_by_is_overdue(self):
        now = _dt(0)
        assert classify_deadline(_dt(-1), now) == DeadlineStatus.OVERDUE

    def test_under_24h_is_urgent(self):
        now = _dt(0)
        assert classify_deadline(_dt(23), now) == DeadlineStatus.URGENT

    def test_exactly_24h_is_due_soon_not_urgent(self):
        now = _dt(0)
        assert classify_deadline(_dt(24), now) == DeadlineStatus.DUE_SOON

    def test_under_72h_is_due_soon(self):
        now = _dt(0)
        assert classify_deadline(_dt(71), now) == DeadlineStatus.DUE_SOON

    def test_72h_or_more_is_pending(self):
        now = _dt(0)
        assert classify_deadline(_dt(72), now) == DeadlineStatus.PENDING
        assert classify_deadline(_dt(200), now) == DeadlineStatus.PENDING


class TestDetermineOverflightPermits:
    def test_excludes_departure_and_arrival_states(self):
        result = determine_overflight_permits(0, ["KEN", "TZA", "ZAF"], "KEN", "ZAF")
        assert [r.country_iso3 for r in result] == ["TZA"]
        assert result[0].leg_index == 0

    def test_direct_neighbor_leg_has_no_overflight_permits(self):
        result = determine_overflight_permits(2, ["KEN", "TZA"], "KEN", "TZA")
        assert result == []

    def test_departure_equals_arrival_excludes_both_occurrences(self):
        # Defensive: a degenerate same-state leg never produces a
        # self-overflight requirement.
        result = determine_overflight_permits(0, ["KEN"], "KEN", "KEN")
        assert result == []


class TestDetermineLandingPermits:
    def test_landing_twice_in_same_state_is_two_permits(self):
        result = determine_landing_permits([(0, "TZA"), (1, "KEN"), (2, "TZA")])
        assert len(result) == 3
        assert [r.country_iso3 for r in result] == ["TZA", "KEN", "TZA"]
        assert [r.leg_index for r in result] == [0, 1, 2]


class TestClassifyServiceScope:
    def test_ground_handling_is_per_country_per_trip(self):
        assert classify_service_scope(GROUND_HANDLING_CODE) == ServiceScope.PER_COUNTRY_PER_TRIP

    def test_other_services_are_per_stop(self):
        for code in ("FUL", "CAT", "CIQ", "SEC", "FPL", "NAV", "SLT", "CRW", "MRO", "MED", "CRT", "CRH", "PXT", "PXH"):
            assert classify_service_scope(code) == ServiceScope.PER_STOP


class TestDetermineGroundHandlingOrders:
    def test_one_order_per_country_due_at_earliest_event(self):
        stops = [
            StopEvent("TZA", "HTDA", _dt(10)),
            StopEvent("TZA", "HTKJ", _dt(5)),  # earlier event, same country
            StopEvent("KEN", "HKJK", _dt(8)),
        ]
        orders = determine_ground_handling_orders(stops)
        by_country = {o.country_iso3: o for o in orders}
        assert len(orders) == 2
        assert by_country["TZA"].due_at == _dt(5)
        assert by_country["TZA"].earliest_icao == "HTKJ"
        assert by_country["KEN"].due_at == _dt(8)

    def test_no_stops_produces_no_orders(self):
        assert determine_ground_handling_orders([]) == []


class TestCheckAvoidIncludeViolation:
    def test_no_violation_when_clean(self):
        result = check_avoid_include_violation(["KEN", "TZA"], avoid_states=set(), include_states=set())
        assert result.violated is False
        assert result.avoided_states_transited == []
        assert result.required_states_missed == []

    def test_transiting_an_avoided_state_is_a_violation(self):
        result = check_avoid_include_violation(["KEN", "SDN", "EGY"], avoid_states={"SDN"}, include_states=set())
        assert result.violated is True
        assert result.avoided_states_transited == ["SDN"]

    def test_missing_a_required_included_state_is_a_violation(self):
        result = check_avoid_include_violation(["KEN", "TZA"], avoid_states=set(), include_states={"UGA"})
        assert result.violated is True
        assert result.required_states_missed == ["UGA"]


class TestDetermineFeasibilityVerdict:
    def test_capability_failure_always_not_feasible(self):
        verdict = determine_feasibility_verdict(
            capability_exceeds_even_with_tech_stop=True,
            avoid_include_violated=True,
            reroute_found=True,
            margin_tight=True,
        )
        assert verdict == FeasibilityVerdict.NOT_FEASIBLE

    def test_violation_with_no_reroute_is_not_feasible(self):
        verdict = determine_feasibility_verdict(
            capability_exceeds_even_with_tech_stop=False,
            avoid_include_violated=True,
            reroute_found=False,
            margin_tight=False,
        )
        assert verdict == FeasibilityVerdict.NOT_FEASIBLE

    def test_violation_with_reroute_is_not_feasible_as_routed(self):
        verdict = determine_feasibility_verdict(
            capability_exceeds_even_with_tech_stop=False,
            avoid_include_violated=True,
            reroute_found=True,
            margin_tight=False,
        )
        assert verdict == FeasibilityVerdict.NOT_FEASIBLE_AS_ROUTED

    def test_thin_margin_with_no_violation_is_tight(self):
        verdict = determine_feasibility_verdict(
            capability_exceeds_even_with_tech_stop=False,
            avoid_include_violated=False,
            reroute_found=False,
            margin_tight=True,
        )
        assert verdict == FeasibilityVerdict.TIGHT

    def test_clean_leg_is_feasible(self):
        verdict = determine_feasibility_verdict(
            capability_exceeds_even_with_tech_stop=False,
            avoid_include_violated=False,
            reroute_found=False,
            margin_tight=False,
        )
        assert verdict == FeasibilityVerdict.FEASIBLE


class TestComputeStateCrossings:
    def test_two_state_leg_splits_entry_exit_at_boundary(self):
        ref = datetime(2026, 3, 10, 0, 0, tzinfo=timezone.utc)
        # 101-point track (indices 0..100), state B first entered halfway.
        crossings = compute_state_crossings(
            [("KEN", 0), ("TZA", 50)], sample_point_count=101, reference_datetime=ref, eet_hours=10.0
        )
        assert crossings["KEN"].entry_datetime == ref
        assert crossings["KEN"].exit_datetime == crossings["TZA"].entry_datetime
        assert crossings["TZA"].entry_datetime == ref + timedelta(hours=5.0)
        assert crossings["TZA"].exit_datetime == ref + timedelta(hours=10.0)

    def test_single_state_leg_spans_full_eet(self):
        ref = datetime(2026, 3, 10, 0, 0, tzinfo=timezone.utc)
        crossings = compute_state_crossings([("KEN", 0)], sample_point_count=50, reference_datetime=ref, eet_hours=2.0)
        assert crossings["KEN"].entry_datetime == ref
        assert crossings["KEN"].exit_datetime == ref + timedelta(hours=2.0)

    def test_repeated_state_keeps_first_crossing_only(self):
        ref = datetime(2026, 3, 10, 0, 0, tzinfo=timezone.utc)
        crossings = compute_state_crossings(
            [("KEN", 0), ("TZA", 30), ("KEN", 70)], sample_point_count=101, reference_datetime=ref, eet_hours=10.0
        )
        assert len(crossings) == 2
        assert crossings["KEN"].entry_datetime == ref


class TestAggregateTripVerdict:
    def test_all_feasible_is_feasible(self):
        assert aggregate_trip_verdict([FeasibilityVerdict.FEASIBLE, FeasibilityVerdict.FEASIBLE]) == FeasibilityVerdict.FEASIBLE

    def test_one_tight_leg_makes_trip_tight(self):
        verdicts = [FeasibilityVerdict.FEASIBLE, FeasibilityVerdict.TIGHT, FeasibilityVerdict.FEASIBLE]
        assert aggregate_trip_verdict(verdicts) == FeasibilityVerdict.TIGHT

    def test_not_feasible_as_routed_beats_tight(self):
        verdicts = [FeasibilityVerdict.TIGHT, FeasibilityVerdict.NOT_FEASIBLE_AS_ROUTED]
        assert aggregate_trip_verdict(verdicts) == FeasibilityVerdict.NOT_FEASIBLE_AS_ROUTED

    def test_not_feasible_beats_everything(self):
        verdicts = [
            FeasibilityVerdict.FEASIBLE,
            FeasibilityVerdict.NOT_FEASIBLE_AS_ROUTED,
            FeasibilityVerdict.NOT_FEASIBLE,
            FeasibilityVerdict.TIGHT,
        ]
        assert aggregate_trip_verdict(verdicts) == FeasibilityVerdict.NOT_FEASIBLE

    def test_single_leg_trip_returns_that_legs_verdict(self):
        assert aggregate_trip_verdict([FeasibilityVerdict.TIGHT]) == FeasibilityVerdict.TIGHT

    def test_empty_list_is_feasible(self):
        assert aggregate_trip_verdict([]) == FeasibilityVerdict.FEASIBLE
