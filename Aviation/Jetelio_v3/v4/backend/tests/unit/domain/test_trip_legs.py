from datetime import datetime, timedelta, timezone

from app.domain.trip_legs import LegOrderingCheck, validate_primary_leg_ordering


def _dt(hour_offset: float) -> datetime:
    return datetime(2026, 1, 1, 12, 0, tzinfo=timezone.utc) + timedelta(hours=hour_offset)


class TestValidatePrimaryLegOrdering:
    def test_correctly_ordered_primary_legs_pass(self):
        legs = [
            LegOrderingCheck(leg_index=0, departure=_dt(0), arrival=_dt(2), is_primary=True),
            LegOrderingCheck(leg_index=1, departure=_dt(3), arrival=_dt(5), is_primary=True),
        ]
        assert validate_primary_leg_ordering(legs) == []

    def test_second_leg_departing_before_first_arrives_is_a_violation(self):
        legs = [
            LegOrderingCheck(leg_index=0, departure=_dt(0), arrival=_dt(5), is_primary=True),
            LegOrderingCheck(leg_index=1, departure=_dt(2), arrival=_dt(7), is_primary=True),
        ]
        violations = validate_primary_leg_ordering(legs)
        assert len(violations) == 1
        assert "Leg 2" in violations[0]

    def test_alternate_legs_are_exempt_and_never_flagged(self):
        legs = [
            LegOrderingCheck(leg_index=0, departure=_dt(0), arrival=_dt(5), is_primary=True),
            LegOrderingCheck(leg_index=1, departure=_dt(1), arrival=_dt(3), is_primary=False),
            LegOrderingCheck(leg_index=2, departure=_dt(6), arrival=_dt(8), is_primary=True),
        ]
        assert validate_primary_leg_ordering(legs) == []

    def test_out_of_order_leg_index_input_is_sorted_first(self):
        legs = [
            LegOrderingCheck(leg_index=1, departure=_dt(3), arrival=_dt(5), is_primary=True),
            LegOrderingCheck(leg_index=0, departure=_dt(0), arrival=_dt(2), is_primary=True),
        ]
        assert validate_primary_leg_ordering(legs) == []
