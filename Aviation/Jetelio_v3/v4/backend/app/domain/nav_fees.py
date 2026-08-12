"""Nav fee (ANS overflight fee) calculation — pure functions, no FastAPI/
SQLAlchemy imports. Formulas and the 50km land-phase deduction rule are
ported from the original _navfees/files/fees.py prototype; that file's
example provider rates were explicitly placeholder ("simplified USD
equiv") and are NOT reused — real rates come from app.models.nav_fee_provider
rows, sourced and verified like every other reference table in this system.
"""

import math
from dataclasses import dataclass
from enum import Enum

_KM_TO_NM = 0.539957


class FeeFormula(str, Enum):
    FLAT_RATE = "FLAT_RATE"
    MTOW_ONLY = "MTOW_ONLY"
    DISTANCE_ONLY = "DISTANCE_ONLY"
    MTOW_DISTANCE = "MTOW_DISTANCE"
    DISTANCE_WEIGHT = "DISTANCE_WEIGHT"


def calculate_fee_component(
    *,
    formula: FeeFormula,
    base_rate: float,
    mtow_kg: float,
    distance_nm: float,
    minimum_fee: float,
    maximum_fee: float | None,
) -> float:
    """Fee for one provider before VAT. `distance_nm` is the chargeable
    distance — the caller applies the 50km deduction (if any) before this.
    """
    mtow_tonnes = mtow_kg / 1000

    if formula == FeeFormula.FLAT_RATE:
        fee = base_rate
    elif formula == FeeFormula.MTOW_ONLY:
        fee = base_rate * math.sqrt(mtow_tonnes)
    elif formula == FeeFormula.DISTANCE_ONLY:
        fee = base_rate * distance_nm
    elif formula == FeeFormula.MTOW_DISTANCE:
        fee = base_rate * math.sqrt(mtow_tonnes) * distance_nm
    elif formula == FeeFormula.DISTANCE_WEIGHT:
        fee = base_rate * distance_nm * math.sqrt(mtow_tonnes)
    else:  # pragma: no cover - exhaustive Enum
        raise ValueError(f"Unknown fee formula: {formula}")

    fee = max(fee, minimum_fee)
    if maximum_fee is not None:
        fee = min(fee, maximum_fee)
    return fee


@dataclass(frozen=True)
class ProviderFeeResult:
    chargeable_distance_nm: float
    component_fee: float
    vat_amount: float
    total_fee: float


def calculate_provider_fee(
    *,
    formula: FeeFormula,
    base_rate: float,
    mtow_kg: float,
    distance_nm: float,
    minimum_fee: float,
    maximum_fee: float | None,
    vat_rate: float,
    applies_50km_deduction: bool,
) -> ProviderFeeResult:
    """Full per-provider calculation for one FIR segment: distance
    deduction, formula, min/max bounds, VAT. Mirrors ANSProvider.calculate_fee
    from the original prototype.
    """
    chargeable_distance_nm = distance_nm
    if applies_50km_deduction:
        chargeable_distance_nm = max(distance_nm - 50 * _KM_TO_NM, 0.0)

    component_fee = calculate_fee_component(
        formula=formula,
        base_rate=base_rate,
        mtow_kg=mtow_kg,
        distance_nm=chargeable_distance_nm,
        minimum_fee=minimum_fee,
        maximum_fee=maximum_fee,
    )
    vat_amount = component_fee * (vat_rate / 100) if vat_rate > 0 else 0.0

    return ProviderFeeResult(
        chargeable_distance_nm=chargeable_distance_nm,
        component_fee=round(component_fee, 2),
        vat_amount=round(vat_amount, 2),
        total_fee=round(component_fee + vat_amount, 2),
    )
