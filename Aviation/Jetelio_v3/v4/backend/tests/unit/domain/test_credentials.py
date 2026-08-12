from datetime import date

from app.domain.credentials import (
    PassportStatus,
    PersonRollupStatus,
    check_souls_on_board,
    is_crew_role,
    is_pax_role,
    resolve_passport_status,
    resolve_person_rollup_status,
)

TRIP_END = date(2026, 6, 1)
BUFFER_DAYS = 180


class TestResolvePassportStatus:
    def test_no_expiry_date_is_missing(self):
        assert resolve_passport_status(None, TRIP_END, BUFFER_DAYS) == PassportStatus.MISSING

    def test_expiry_before_trip_end_is_expires_before_trip(self):
        assert resolve_passport_status(date(2026, 5, 1), TRIP_END, BUFFER_DAYS) == PassportStatus.EXPIRES_BEFORE_TRIP

    def test_expiry_on_trip_end_day_is_not_expired(self):
        assert resolve_passport_status(TRIP_END, TRIP_END, BUFFER_DAYS) != PassportStatus.EXPIRES_BEFORE_TRIP

    def test_expiry_within_buffer_is_under_6_months(self):
        # Trip ends 2026-06-01, expiry 2026-08-01 is ~61 days after trip
        # end, well inside the 180-day buffer.
        assert resolve_passport_status(date(2026, 8, 1), TRIP_END, BUFFER_DAYS) == PassportStatus.UNDER_6_MONTHS

    def test_expiry_beyond_buffer_is_valid(self):
        assert resolve_passport_status(date(2027, 6, 1), TRIP_END, BUFFER_DAYS) == PassportStatus.VALID

    def test_expiry_exactly_at_buffer_boundary_is_valid(self):
        # "At least" buffer_days out satisfies the buffer — the boundary
        # itself is VALID, one day short of it is UNDER_6_MONTHS.
        boundary = date(2026, 11, 28)  # TRIP_END + 180 days exactly
        assert resolve_passport_status(boundary, TRIP_END, BUFFER_DAYS) == PassportStatus.VALID
        assert resolve_passport_status(date(2026, 11, 27), TRIP_END, BUFFER_DAYS) == PassportStatus.UNDER_6_MONTHS


class TestResolvePersonRollupStatus:
    def test_missing_passport_is_action_required_regardless_of_visa(self):
        assert (
            resolve_person_rollup_status(PassportStatus.MISSING, "NOT_REQUIRED") == PersonRollupStatus.ACTION_REQUIRED
        )

    def test_expired_passport_is_action_required(self):
        assert (
            resolve_person_rollup_status(PassportStatus.EXPIRES_BEFORE_TRIP, "NOT_REQUIRED")
            == PersonRollupStatus.ACTION_REQUIRED
        )

    def test_visa_not_on_file_is_action_required_even_with_valid_passport(self):
        assert resolve_person_rollup_status(PassportStatus.VALID, "NOT ON FILE") == PersonRollupStatus.ACTION_REQUIRED

    def test_under_6_months_passport_is_check(self):
        assert resolve_person_rollup_status(PassportStatus.UNDER_6_MONTHS, "NOT_REQUIRED") == PersonRollupStatus.CHECK

    def test_visa_required_with_valid_passport_is_check(self):
        assert resolve_person_rollup_status(PassportStatus.VALID, "REQUIRED") == PersonRollupStatus.CHECK

    def test_evisa_is_check(self):
        assert resolve_person_rollup_status(PassportStatus.VALID, "EVISA") == PersonRollupStatus.CHECK

    def test_valid_passport_and_not_required_visa_is_ok(self):
        assert resolve_person_rollup_status(PassportStatus.VALID, "NOT_REQUIRED") == PersonRollupStatus.OK


class TestCheckSoulsOnBoard:
    def test_within_max_pax_does_not_exceed(self):
        result = check_souls_on_board(crew_count=3, pax_count=5, max_pax=10)
        assert result.total == 8
        assert result.exceeds is False

    def test_exceeding_max_pax_flags(self):
        result = check_souls_on_board(crew_count=3, pax_count=9, max_pax=10)
        assert result.total == 12
        assert result.exceeds is True

    def test_exactly_at_max_pax_does_not_exceed(self):
        result = check_souls_on_board(crew_count=2, pax_count=8, max_pax=10)
        assert result.exceeds is False

    def test_no_max_pax_never_exceeds(self):
        result = check_souls_on_board(crew_count=2, pax_count=8, max_pax=None)
        assert result.exceeds is False


class TestRoleBucketing:
    def test_generic_crew_and_pax_still_bucket(self):
        assert is_crew_role("CREW") is True
        assert is_pax_role("PAX") is True

    def test_crew_sub_roles_bucket_as_crew(self):
        for role in ("PIC", "FO", "FA", "MECHANIC", "ENGINEER"):
            assert is_crew_role(role) is True
            assert is_pax_role(role) is False

    def test_pax_sub_roles_bucket_as_pax(self):
        for role in ("VIP", "PRINCIPAL"):
            assert is_pax_role(role) is True
            assert is_crew_role(role) is False

    def test_other_buckets_as_pax_not_crew(self):
        assert is_pax_role("OTHER") is True
        assert is_crew_role("OTHER") is False
