"""
Navigation fee calculation engine.
Handles all global ANS fee formulas and provider-specific rules.
"""

import logging
import math
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass
from enum import Enum

logger = logging.getLogger(__name__)


class FeeFormulaType(Enum):
    """Types of fee calculation formulas used globally."""
    
    FLAT_RATE = "flat"  # Same fee regardless of MTOW/distance
    MTOW_ONLY = "mtow"  # Fee based on aircraft weight only
    DISTANCE_ONLY = "distance"  # Fee based on distance only
    MTOW_DISTANCE = "mtow_distance"  # Fee = (√MTOW × Distance) × rate
    DISTANCE_WEIGHT = "distance_weight"  # Fee = Distance × (√MTOW) × rate
    COMPLEX = "complex"  # Multi-component (en-route, terminal, etc.)


@dataclass
class FeeComponent:
    """Individual fee component calculation."""
    
    name: str
    formula_type: FeeFormulaType
    base_rate: float  # Primary multiplier
    mtow_factor: Optional[float] = None  # Weight factor if applicable
    distance_factor: Optional[float] = None  # Distance factor if applicable
    minimum_fee: float = 0.0  # Minimum charge
    maximum_fee: Optional[float] = None  # Maximum charge (if capped)
    notes: str = ""
    
    def calculate(
        self,
        mtow_kg: float,
        distance_nm: float,
    ) -> float:
        """Calculate fee for this component."""
        
        if self.formula_type == FeeFormulaType.FLAT_RATE:
            return max(self.base_rate, self.minimum_fee)
        
        elif self.formula_type == FeeFormulaType.MTOW_ONLY:
            # Typical: rate × √(MTOW in tonnes)
            mtow_tonnes = mtow_kg / 1000
            fee = self.base_rate * math.sqrt(mtow_tonnes)
        
        elif self.formula_type == FeeFormulaType.DISTANCE_ONLY:
            # Typical: rate × distance
            fee = self.base_rate * distance_nm
        
        elif self.formula_type == FeeFormulaType.MTOW_DISTANCE:
            # Eurocontrol style: rate × √MTOW × distance
            mtow_tonnes = mtow_kg / 1000
            fee = self.base_rate * math.sqrt(mtow_tonnes) * distance_nm
        
        elif self.formula_type == FeeFormulaType.DISTANCE_WEIGHT:
            # Alternative: rate × distance × √MTOW
            mtow_tonnes = mtow_kg / 1000
            fee = self.base_rate * distance_nm * math.sqrt(mtow_tonnes)
        
        else:
            fee = 0.0
        
        # Apply min/max bounds
        fee = max(fee, self.minimum_fee)
        if self.maximum_fee:
            fee = min(fee, self.maximum_fee)
        
        return fee


@dataclass
class ANSProvider:
    """Air Navigation Service Provider with fee structure."""
    
    icao_code: str
    name: str
    country: str
    firs_managed: List[str]
    fee_components: List[FeeComponent]
    
    # Regional specifics
    vat_rate: float = 0.0  # VAT/GST if applicable
    currency: str = "USD"
    
    # Special rules
    applies_50km_deduction: bool = False  # Some FIRs deduct 50km for land phases
    minimum_distance: float = 0.0  # Minimum distance charged
    
    notes: str = ""
    
    def calculate_fee(
        self,
        mtow_kg: float,
        distance_nm: float,
    ) -> Tuple[List[Dict], float]:
        """
        Calculate complete fee for this provider.
        
        Returns:
            (component_breakdown, total_fee)
        """
        # Apply distance deductions if applicable
        chargeable_distance_nm = distance_nm
        
        if self.applies_50km_deduction:
            deduction_nm = 50 * 0.539957  # Convert 50km to NM
            chargeable_distance_nm = max(distance_nm - deduction_nm, self.minimum_distance)
        
        chargeable_distance_nm = max(chargeable_distance_nm, self.minimum_distance)
        
        # Calculate each component
        components = []
        total = 0.0
        
        for component in self.fee_components:
            amount = component.calculate(mtow_kg, chargeable_distance_nm)
            
            components.append({
                "name": component.name,
                "formula": component.formula_type.value,
                "amount_usd": round(amount, 2),
            })
            
            total += amount
        
        # Apply VAT if configured
        vat_amount = total * (self.vat_rate / 100) if self.vat_rate > 0 else 0.0
        total_with_vat = total + vat_amount
        
        if vat_amount > 0:
            components.append({
                "name": f"VAT ({self.vat_rate}%)",
                "formula": "VAT",
                "amount_usd": round(vat_amount, 2),
            })
        
        return components, round(total_with_vat, 2)
    
    def to_dict(self) -> dict:
        """Serialize to dictionary."""
        return {
            "icao_code": self.icao_code,
            "name": self.name,
            "country": self.country,
            "firs_managed": self.firs_managed,
            "currency": self.currency,
            "notes": self.notes,
        }


class FeeCalculationEngine:
    """Global navigation fee calculation engine."""
    
    def __init__(self, providers: Dict[str, ANSProvider]):
        """
        Initialize engine with provider catalog.
        
        Args:
            providers: Dict mapping FIR ICAO codes to ANSProvider instances
        """
        self.providers = providers
        logger.info(f"Initialized FeeCalculationEngine with {len(providers)} providers")
    
    def get_provider(self, icao_code: str) -> Optional[ANSProvider]:
        """Get provider by ICAO code."""
        return self.providers.get(icao_code)
    
    def get_provider_list(self) -> List[dict]:
        """Get list of all configured providers."""
        return [p.to_dict() for p in self.providers.values()]
    
    def calculate_segment_fee(
        self,
        fir_icao: str,
        aircraft: object,  # AircraftSpecs
        distance_nm: float,
        distance_km: Optional[float] = None,
    ) -> Dict:
        """
        Calculate fee for one FIR segment.
        
        Args:
            fir_icao: FIR ICAO code
            aircraft: AircraftSpecs object with icao_type and mtow_kg
            distance_nm: Distance in nautical miles
            distance_km: Distance in kilometers (for reference)
            
        Returns:
            Fee breakdown dict with components and total
        """
        provider = self.providers.get(fir_icao)
        
        if not provider:
            logger.warning(f"No provider found for FIR {fir_icao}")
            return {
                "fir_icao": fir_icao,
                "components": [
                    {
                        "name": "Unknown FIR",
                        "formula": "N/A",
                        "amount_usd": 0.0,
                    }
                ],
                "total": 0.0,
            }
        
        components, total = provider.calculate_fee(
            mtow_kg=aircraft.mtow_kg,
            distance_nm=distance_nm,
        )
        
        return {
            "fir_icao": fir_icao,
            "provider": provider.name,
            "components": components,
            "subtotal_usd": sum(c["amount_usd"] for c in components if c["name"] not in [f"VAT ({provider.vat_rate}%)"]),
            "total": total,
        }
    
    def estimate_overflight_fee(
        self,
        fir_icao_list: List[str],
        aircraft_mtow_kg: float,
        total_distance_nm: float,
    ) -> Dict:
        """
        Quick estimate for multiple FIRs (simplified; doesn't segment distance).
        
        For accurate quotes, use calculate_segment_fee per FIR.
        """
        estimated_total = 0.0
        fir_breakdown = {}
        
        # Rough proportional split
        distance_per_fir = total_distance_nm / len(fir_icao_list) if fir_icao_list else 0
        
        for fir in fir_icao_list:
            provider = self.providers.get(fir)
            if provider:
                _, fee = provider.calculate_fee(aircraft_mtow_kg, distance_per_fir)
                estimated_total += fee
                fir_breakdown[fir] = fee
        
        return {
            "estimated_total_usd": round(estimated_total, 2),
            "breakdown_by_fir": fir_breakdown,
            "note": "Simplified estimate; actual fees depend on precise distance per FIR",
        }


# ============================================================================
# Pre-configured providers (examples from around the world)
# ============================================================================

def create_eurocontrol_provider() -> ANSProvider:
    """EUROCONTROL (Europe) - distance and weight based."""
    return ANSProvider(
        icao_code="LFFF",  # France FIR (example)
        name="EUROCONTROL",
        country="France",
        firs_managed=["LFFF", "LFRR", "LFRB"],
        fee_components=[
            FeeComponent(
                name="En-route",
                formula_type=FeeFormulaType.MTOW_DISTANCE,
                base_rate=0.5,  # €0.5 × √MTOW × distance (simplified USD equiv)
                minimum_fee=5.0,
                notes="Formula: 0.5 × √(MTOW) × distance"
            )
        ],
        vat_rate=20.0,
        notes="EUROCONTROL Charging System"
    )


def create_asecna_provider(fir_code: str, fir_name: str) -> ANSProvider:
    """ASECNA (Africa) - based on MTOW + distance."""
    return ANSProvider(
        icao_code=fir_code,
        name="ASECNA",
        country="Multi-country (Africa)",
        firs_managed=[fir_code],
        fee_components=[
            FeeComponent(
                name="En-route",
                formula_type=FeeFormulaType.MTOW_DISTANCE,
                base_rate=2.0,  # USD per unit
                minimum_fee=50.0,
                notes="ASECNA standard formula"
            ),
            FeeComponent(
                name="Approach",
                formula_type=FeeFormulaType.MTOW_ONLY,
                base_rate=10.0,
                minimum_fee=25.0,
            ),
        ],
        applies_50km_deduction=True,
        notes=f"ASECNA {fir_name}"
    )


def create_faa_provider() -> ANSProvider:
    """FAA (USA) - primarily based on landing/departure, minimal overflight fees."""
    return ANSProvider(
        icao_code="KZNY",  # New York FIR (example)
        name="FAA",
        country="USA",
        firs_managed=["KZNY", "KZOA", "KZFW"],
        fee_components=[
            FeeComponent(
                name="Terminal Navigation",
                formula_type=FeeFormulaType.FLAT_RATE,
                base_rate=25.0,
                notes="Flat fee for arrival/departure"
            ),
        ],
        notes="FAA charges primarily on landing/departure, not distance-based"
    )


def create_thai_provider() -> ANSProvider:
    """Thailand (AEROTHAI) - distance + weight formula."""
    return ANSProvider(
        icao_code="VTBB",
        name="AEROTHAI",
        country="Thailand",
        firs_managed=["VTBB"],
        fee_components=[
            FeeComponent(
                name="En-route",
                formula_type=FeeFormulaType.MTOW_DISTANCE,
                base_rate=4.5,
                minimum_fee=100.0,
                notes="50km deduction for takeoff/landing"
            ),
        ],
        applies_50km_deduction=True,
        currency="USD",
        notes="Thailand Airways regulations"
    )


def create_nats_provider() -> ANSProvider:
    """NATS (UK/Ireland) - distance and weight based."""
    return ANSProvider(
        icao_code="EGTT",
        name="NATS",
        country="UK/Ireland",
        firs_managed=["EGTT", "EGGX"],
        fee_components=[
            FeeComponent(
                name="En-route",
                formula_type=FeeFormulaType.MTOW_DISTANCE,
                base_rate=0.6,
                minimum_fee=10.0,
            ),
        ],
        vat_rate=20.0,
        notes="NATS UK"
    )


def get_default_providers() -> Dict[str, ANSProvider]:
    """Get default provider catalog."""
    providers = {}
    
    # EUROCONTROL
    providers["LFFF"] = create_eurocontrol_provider()
    
    # ASECNA (African FIRs)
    asecna_firs = {
        "FLLX": "Lilongwe",
        "FZZA": "Antananarivo",
        "GOOO": "Dakar",
        "FTTT": "N'Djamena",
        "FMMM": "Antananarivo",
    }
    for fir, name in asecna_firs.items():
        providers[fir] = create_asecna_provider(fir, name)
    
    # FAA (USA)
    providers["KZNY"] = create_faa_provider()
    
    # Thailand
    providers["VTBB"] = create_thai_provider()
    
    # NATS
    providers["EGTT"] = create_nats_provider()
    
    return providers
