import math

import pytest

from app.domain.nav_fees import FeeFormula, calculate_fee_component, calculate_provider_fee

MTOW_KG = 5000  # 5 tonnes -> sqrt(5) tonnes factor


class TestCalculateFeeComponent:
    def test_flat_rate_ignores_mtow_and_distance(self):
        fee = calculate_fee_component(
            formula=FeeFormula.FLAT_RATE, base_rate=25.0, mtow_kg=999999, distance_nm=999999, minimum_fee=0.0, maximum_fee=None
        )
        assert fee == pytest.approx(25.0)

    def test_mtow_only_uses_sqrt_tonnes(self):
        fee = calculate_fee_component(
            formula=FeeFormula.MTOW_ONLY, base_rate=10.0, mtow_kg=MTOW_KG, distance_nm=0, minimum_fee=0.0, maximum_fee=None
        )
        assert fee == pytest.approx(10.0 * math.sqrt(5))

    def test_distance_only_uses_rate_times_distance(self):
        fee = calculate_fee_component(
            formula=FeeFormula.DISTANCE_ONLY, base_rate=2.0, mtow_kg=0, distance_nm=350, minimum_fee=0.0, maximum_fee=None
        )
        assert fee == pytest.approx(700.0)

    def test_mtow_distance_multiplies_all_three(self):
        fee = calculate_fee_component(
            formula=FeeFormula.MTOW_DISTANCE, base_rate=2.0, mtow_kg=MTOW_KG, distance_nm=350, minimum_fee=0.0, maximum_fee=None
        )
        assert fee == pytest.approx(2.0 * math.sqrt(5) * 350)

    def test_distance_weight_matches_mtow_distance(self):
        # DISTANCE_WEIGHT is the same product in a different order — kept as
        # a distinct formula name because real ANS schedules cite it that way.
        a = calculate_fee_component(
            formula=FeeFormula.MTOW_DISTANCE, base_rate=1.5, mtow_kg=MTOW_KG, distance_nm=200, minimum_fee=0.0, maximum_fee=None
        )
        b = calculate_fee_component(
            formula=FeeFormula.DISTANCE_WEIGHT, base_rate=1.5, mtow_kg=MTOW_KG, distance_nm=200, minimum_fee=0.0, maximum_fee=None
        )
        assert a == pytest.approx(b)

    def test_minimum_fee_floor_applies(self):
        fee = calculate_fee_component(
            formula=FeeFormula.DISTANCE_ONLY, base_rate=0.1, mtow_kg=0, distance_nm=1, minimum_fee=50.0, maximum_fee=None
        )
        assert fee == pytest.approx(50.0)

    def test_maximum_fee_cap_applies(self):
        fee = calculate_fee_component(
            formula=FeeFormula.DISTANCE_ONLY, base_rate=10.0, mtow_kg=0, distance_nm=1000, minimum_fee=0.0, maximum_fee=500.0
        )
        assert fee == pytest.approx(500.0)


class TestCalculateProviderFee:
    def test_50km_deduction_reduces_chargeable_distance(self):
        result = calculate_provider_fee(
            formula=FeeFormula.DISTANCE_ONLY,
            base_rate=1.0,
            mtow_kg=0,
            distance_nm=100,
            minimum_fee=0.0,
            maximum_fee=None,
            vat_rate=0.0,
            applies_50km_deduction=True,
        )
        # 50km == 26.9979 nm, so chargeable ~= 73.0
        assert result.chargeable_distance_nm == pytest.approx(100 - 50 * 0.539957)
        assert result.component_fee == pytest.approx(result.chargeable_distance_nm, abs=0.01)

    def test_deduction_never_goes_negative(self):
        result = calculate_provider_fee(
            formula=FeeFormula.DISTANCE_ONLY,
            base_rate=1.0,
            mtow_kg=0,
            distance_nm=10,
            minimum_fee=0.0,
            maximum_fee=None,
            vat_rate=0.0,
            applies_50km_deduction=True,
        )
        assert result.chargeable_distance_nm == pytest.approx(0.0)

    def test_vat_is_applied_on_top_of_component_fee(self):
        result = calculate_provider_fee(
            formula=FeeFormula.FLAT_RATE,
            base_rate=100.0,
            mtow_kg=0,
            distance_nm=0,
            minimum_fee=0.0,
            maximum_fee=None,
            vat_rate=20.0,
            applies_50km_deduction=False,
        )
        assert result.component_fee == pytest.approx(100.0)
        assert result.vat_amount == pytest.approx(20.0)
        assert result.total_fee == pytest.approx(120.0)

    def test_zero_vat_rate_adds_no_vat(self):
        result = calculate_provider_fee(
            formula=FeeFormula.FLAT_RATE,
            base_rate=100.0,
            mtow_kg=0,
            distance_nm=0,
            minimum_fee=0.0,
            maximum_fee=None,
            vat_rate=0.0,
            applies_50km_deduction=False,
        )
        assert result.vat_amount == 0.0
        assert result.total_fee == pytest.approx(100.0)
