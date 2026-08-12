import pytest

from app.domain.service_delivery import (
    ConfirmationRoutingCandidate,
    ServiceDeliveryCandidate,
    resolve_confirmation_routing_config,
    resolve_service_delivery_config,
)


class TestResolveServiceDeliveryConfig:
    def test_no_candidates_returns_none(self):
        assert resolve_service_delivery_config([], requested_service_code="FUL") is None

    def test_leg_beats_trip_beats_operator(self):
        leg = ServiceDeliveryCandidate(id="leg", leg_id="L1", trip_id=None, operator_id=None, service_code=None)
        trip = ServiceDeliveryCandidate(id="trip", leg_id=None, trip_id="T1", operator_id=None, service_code=None)
        operator = ServiceDeliveryCandidate(id="op", leg_id=None, trip_id=None, operator_id="O1", service_code=None)

        assert resolve_service_delivery_config([operator, trip, leg], requested_service_code="FUL").id == "leg"
        assert resolve_service_delivery_config([operator, trip], requested_service_code="FUL").id == "trip"
        assert resolve_service_delivery_config([operator], requested_service_code="FUL").id == "op"

    def test_exact_service_code_beats_wildcard_at_the_same_scope(self):
        wildcard = ServiceDeliveryCandidate(id="wildcard", leg_id="L1", trip_id=None, operator_id=None, service_code=None)
        exact = ServiceDeliveryCandidate(id="exact", leg_id="L1", trip_id=None, operator_id=None, service_code="FUL")

        result = resolve_service_delivery_config([wildcard, exact], requested_service_code="FUL")
        assert result.id == "exact"

    def test_scope_specificity_beats_service_specificity(self):
        # A leg-wide wildcard still beats an operator-wide exact match —
        # scope is ranked before service-code specificity.
        leg_wildcard = ServiceDeliveryCandidate(id="leg_wildcard", leg_id="L1", trip_id=None, operator_id=None, service_code=None)
        operator_exact = ServiceDeliveryCandidate(id="op_exact", leg_id=None, trip_id=None, operator_id="O1", service_code="FUL")

        result = resolve_service_delivery_config([operator_exact, leg_wildcard], requested_service_code="FUL")
        assert result.id == "leg_wildcard"

    def test_row_for_a_different_specific_service_never_applies(self):
        other_service = ServiceDeliveryCandidate(id="other", leg_id="L1", trip_id=None, operator_id=None, service_code="GRH")
        assert resolve_service_delivery_config([other_service], requested_service_code="FUL") is None

    def test_unscoped_candidate_raises(self):
        bad = ServiceDeliveryCandidate(id="bad", leg_id=None, trip_id=None, operator_id=None, service_code=None)
        with pytest.raises(ValueError):
            resolve_service_delivery_config([bad], requested_service_code="FUL")


class TestResolveConfirmationRoutingConfig:
    def test_no_candidates_returns_none(self):
        assert resolve_confirmation_routing_config([]) is None

    def test_leg_beats_trip_beats_operator(self):
        leg = ConfirmationRoutingCandidate(id="leg", leg_id="L1", trip_id=None, operator_id=None)
        trip = ConfirmationRoutingCandidate(id="trip", leg_id=None, trip_id="T1", operator_id=None)
        operator = ConfirmationRoutingCandidate(id="op", leg_id=None, trip_id=None, operator_id="O1")

        assert resolve_confirmation_routing_config([operator, trip, leg]).id == "leg"
        assert resolve_confirmation_routing_config([operator, trip]).id == "trip"
        assert resolve_confirmation_routing_config([operator]).id == "op"
