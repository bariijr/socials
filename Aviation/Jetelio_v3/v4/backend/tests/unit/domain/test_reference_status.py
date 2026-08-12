"""Domain layer unit tests. No FastAPI, no SQLAlchemy, no DB — these run
in isolation and are the tests a workbook parallel-run would diff against.
"""

from datetime import date

from app.domain.reference_status import (
    AircraftPlanningStatus,
    CountryReferenceStatus,
    OperatorAssignableStatus,
    TechStopReadiness,
    is_ground_handling_policy_decided,
    resolve_aircraft_planning_status,
    resolve_airport_tech_stop_readiness,
    resolve_country_reference_status,
    resolve_effective_lead_time_hours,
    resolve_effective_permit_validity,
    resolve_operator_assignable,
)


def _fully_verified_lead_time_kwargs():
    return dict(
        standard_lead_time_hours=48,
        lead_time_source="AIP ENR 1.1",
        lead_time_verified_by="J. Ops",
        lead_time_verified_on=date(2026, 1, 1),
    )


def _fully_verified_permit_flags_kwargs():
    return dict(
        permit_flags_source="CAA confirmation email",
        permit_flags_verified_by="J. Ops",
        permit_flags_verified_on=date(2026, 1, 1),
    )


class TestResolveEffectiveLeadTimeHours:
    def test_falls_back_when_no_standard_value(self):
        result = resolve_effective_lead_time_hours(None, default_permit_lead_time_hours=72)
        assert result.hours == 72
        assert result.is_fallback is True

    def test_uses_verified_value_when_present(self):
        result = resolve_effective_lead_time_hours(48, default_permit_lead_time_hours=72)
        assert result.hours == 48
        assert result.is_fallback is False


class TestResolveEffectivePermitValidity:
    def test_falls_back_when_amount_missing(self):
        result = resolve_effective_permit_validity(None, "DAYS", 30, "DAYS")
        assert result.amount == 30
        assert result.unit == "DAYS"
        assert result.is_fallback is True

    def test_falls_back_when_unit_missing(self):
        result = resolve_effective_permit_validity(14, None, 30, "DAYS")
        assert result.amount == 30
        assert result.unit == "DAYS"
        assert result.is_fallback is True

    def test_uses_verified_value_when_present(self):
        result = resolve_effective_permit_validity(6, "MONTHS", 30, "DAYS")
        assert result.amount == 6
        assert result.unit == "MONTHS"
        assert result.is_fallback is False


class TestResolveCountryReferenceStatus:
    def test_fully_verified(self):
        status = resolve_country_reference_status(
            **_fully_verified_lead_time_kwargs(), **_fully_verified_permit_flags_kwargs()
        )
        assert status == CountryReferenceStatus.VERIFIED

    def test_lead_time_ok_flags_unverified(self):
        status = resolve_country_reference_status(
            **_fully_verified_lead_time_kwargs(),
            permit_flags_source=None,
            permit_flags_verified_by=None,
            permit_flags_verified_on=None,
        )
        assert status == CountryReferenceStatus.LEAD_TIME_OK_FLAGS_UNVERIFIED

    def test_no_lead_time_value_at_all_uses_fallback_status(self):
        status = resolve_country_reference_status(
            standard_lead_time_hours=None,
            lead_time_source=None,
            lead_time_verified_by=None,
            lead_time_verified_on=None,
            permit_flags_source=None,
            permit_flags_verified_by=None,
            permit_flags_verified_on=None,
        )
        assert status == CountryReferenceStatus.UNVERIFIED_USING_FALLBACK

    def test_value_present_but_unverified_is_not_the_same_as_fallback(self):
        """Presence is not verification: a lead time entered with no
        source/verifier/date must NOT read as 'using fallback' — the
        value is real, just unverified.
        """
        status = resolve_country_reference_status(
            standard_lead_time_hours=48,
            lead_time_source=None,
            lead_time_verified_by=None,
            lead_time_verified_on=None,
            permit_flags_source=None,
            permit_flags_verified_by=None,
            permit_flags_verified_on=None,
        )
        assert status == CountryReferenceStatus.UNVERIFIED_NO_SOURCE

    def test_partial_provenance_is_not_verified(self):
        status = resolve_country_reference_status(
            standard_lead_time_hours=48,
            lead_time_source="AIP",
            lead_time_verified_by=None,
            lead_time_verified_on=date(2026, 1, 1),
            permit_flags_source=None,
            permit_flags_verified_by=None,
            permit_flags_verified_on=None,
        )
        assert status == CountryReferenceStatus.UNVERIFIED_NO_SOURCE


class TestGroundHandlingPolicyDecided:
    def test_verify_is_not_decided(self):
        assert is_ground_handling_policy_decided("VERIFY") is False

    def test_mandatory_is_decided(self):
        assert is_ground_handling_policy_decided("MANDATORY") is True


class TestResolveAircraftPlanningStatus:
    def test_approved_requires_all_three(self):
        status = resolve_aircraft_planning_status(verified=True, verified_by="Eng. Smith", verified_on=date(2026, 1, 1))
        assert status == AircraftPlanningStatus.APPROVED_FOR_PLANNING

    def test_verified_flag_alone_is_not_enough(self):
        status = resolve_aircraft_planning_status(verified=True, verified_by=None, verified_on=None)
        assert status == AircraftPlanningStatus.ADVISORY_ONLY

    def test_default_advisory(self):
        status = resolve_aircraft_planning_status(verified=False, verified_by=None, verified_on=None)
        assert status == AircraftPlanningStatus.ADVISORY_ONLY


class TestResolveAirportTechStopReadiness:
    def test_incomplete_when_not_all_populated(self):
        status = resolve_airport_tech_stop_readiness(
            operating_hours=None, is_airport_of_entry=True, fuel_grades=["JET A-1"],
            ops_data_source=None, ops_data_verified_on=None,
        )
        assert status == TechStopReadiness.INCOMPLETE

    def test_unverified_advisory_when_populated_but_not_sourced(self):
        status = resolve_airport_tech_stop_readiness(
            operating_hours="H24", is_airport_of_entry=True, fuel_grades=["JET A-1"],
            ops_data_source=None, ops_data_verified_on=None,
        )
        assert status == TechStopReadiness.UNVERIFIED_ADVISORY

    def test_verified_when_fully_sourced(self):
        status = resolve_airport_tech_stop_readiness(
            operating_hours="H24", is_airport_of_entry=True, fuel_grades=["JET A-1"],
            ops_data_source="Jeppesen", ops_data_verified_on=date(2026, 1, 1),
        )
        assert status == TechStopReadiness.VERIFIED

    def test_false_is_airport_of_entry_still_counts_as_populated(self):
        status = resolve_airport_tech_stop_readiness(
            operating_hours="H24", is_airport_of_entry=False, fuel_grades=["JET A-1"],
            ops_data_source="Jeppesen", ops_data_verified_on=date(2026, 1, 1),
        )
        assert status == TechStopReadiness.VERIFIED


class TestResolveOperatorAssignable:
    def test_blank_name_blocks(self):
        assert resolve_operator_assignable(None) == OperatorAssignableStatus.BLOCKED_NAME_REQUIRED
        assert resolve_operator_assignable("   ") == OperatorAssignableStatus.BLOCKED_NAME_REQUIRED

    def test_named_operator_is_assignable(self):
        assert resolve_operator_assignable("Fireblade Aviation") == OperatorAssignableStatus.ASSIGNABLE
