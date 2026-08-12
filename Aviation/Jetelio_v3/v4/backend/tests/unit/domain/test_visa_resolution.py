from datetime import date

from app.domain.visa_resolution import NOT_ON_FILE, is_visa_rule_stale, resolve_visa_requirement


def _rule(requirement="REQUIRED", **overrides):
    base = dict(
        requirement=requirement, visa_type=None, lead_time_days=None, max_stay_days=None,
        conditions=None, source=None, verified_by=None, verified_on=None, expires_on=None,
    )
    base.update(overrides)
    return base


class TestResolveVisaRequirement:
    def test_precedence_airport_override_wins(self):
        answer = resolve_visa_requirement(
            airport_override=_rule("EVISA"),
            country_nationality_rule=_rule("REQUIRED"),
            matrix_cell=_rule("NOT_REQUIRED"),
        )
        assert answer.requirement == "EVISA"
        assert answer.answered_by_layer == "AIRPORT_OVERRIDE"

    def test_precedence_country_nationality_rule_beats_matrix(self):
        answer = resolve_visa_requirement(
            airport_override=None, country_nationality_rule=_rule("REQUIRED"), matrix_cell=_rule("NOT_REQUIRED")
        )
        assert answer.requirement == "REQUIRED"
        assert answer.answered_by_layer == "COUNTRY_NATIONALITY_RULE"

    def test_falls_through_to_matrix_cell(self):
        answer = resolve_visa_requirement(airport_override=None, country_nationality_rule=None, matrix_cell=_rule("VISA_ON_ARRIVAL"))
        assert answer.requirement == "VISA_ON_ARRIVAL"
        assert answer.answered_by_layer == "MATRIX_CELL"

    def test_blank_never_defaults_to_not_required(self):
        """The spec is explicit: blank fails safe as NOT ON FILE, never a
        guessed NOT REQUIRED.
        """
        answer = resolve_visa_requirement(airport_override=None, country_nationality_rule=None, matrix_cell=None)
        assert answer.requirement == NOT_ON_FILE
        assert answer.requirement != "NOT_REQUIRED"
        assert answer.answered_by_layer == "NOT_ON_FILE"


class TestVisaRuleStaleness:
    def test_no_verification_date_is_not_stale(self):
        assert is_visa_rule_stale(None, date(2026, 1, 1), 365) is False

    def test_recent_verification_is_not_stale(self):
        assert is_visa_rule_stale(date(2025, 6, 1), date(2026, 1, 1), 365) is False

    def test_old_verification_is_stale(self):
        assert is_visa_rule_stale(date(2024, 1, 1), date(2026, 1, 1), 365) is True
