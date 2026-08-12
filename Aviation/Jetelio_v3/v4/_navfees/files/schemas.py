"""Data models and Pydantic schemas for API requests/responses."""

from typing import Optional, List, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field, validator
from enum import Enum


class AircraftSpecs(BaseModel):
    """Aircraft specifications for fee calculation."""
    
    icao_type: str = Field(..., description="ICAO aircraft type (e.g., 'B788', 'A350')")
    mtow_kg: float = Field(..., description="Maximum takeoff weight in kg", gt=0)
    wingspan_m: Optional[float] = Field(None, description="Wingspan in meters (some FIRs use this)")
    
    class Config:
        json_schema_extra = {
            "example": {
                "icao_type": "B788",
                "mtow_kg": 242000,
                "wingspan_m": 64.8,
            }
        }


class Waypoint(BaseModel):
    """Geographic waypoint (lat/lon)."""
    
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    
    class Config:
        json_schema_extra = {
            "example": {
                "latitude": -11.0169,
                "longitude": 40.1924,
            }
        }


class RouteSegment(BaseModel):
    """Flight route segment (typically one FIR)."""
    
    fir_icao: str
    fir_name: Optional[str] = None
    ans_provider: Optional[str] = None
    distance_nm: float = Field(..., gt=0, description="Distance in nautical miles")
    distance_km: float = Field(..., gt=0, description="Distance in kilometers")
    waypoints: Optional[List[Waypoint]] = None
    
    class Config:
        json_schema_extra = {
            "example": {
                "fir_icao": "FLLX",
                "fir_name": "Lilongwe",
                "ans_provider": "ASECNA",
                "distance_nm": 250.5,
                "distance_km": 464.2,
            }
        }


class FeeComponent(BaseModel):
    """Individual fee component (e.g., en-route, terminal, approach)."""
    
    name: str = Field(..., description="Component name (e.g., 'En-route', 'Terminal')")
    formula: str = Field(..., description="Fee formula applied")
    amount_usd: float = Field(..., ge=0)
    
    class Config:
        json_schema_extra = {
            "example": {
                "name": "En-route",
                "formula": "0.5 × √MTOW × Distance",
                "amount_usd": 450.00,
            }
        }


class SegmentFee(BaseModel):
    """Complete fee breakdown for one route segment."""
    
    fir_icao: str
    components: List[FeeComponent]
    subtotal_usd: float
    taxes_vat_usd: float = 0.0
    total_usd: float
    
    class Config:
        json_schema_extra = {
            "example": {
                "fir_icao": "FLLX",
                "components": [
                    {"name": "En-route", "formula": "0.5 × √MTOW × Distance", "amount_usd": 450.0}
                ],
                "subtotal_usd": 450.0,
                "taxes_vat_usd": 0.0,
                "total_usd": 450.0,
            }
        }


class NavFeeRequest(BaseModel):
    """Navigation fee calculation request."""
    
    request_id: Optional[str] = Field(None, description="Unique request ID for tracking")
    aircraft: AircraftSpecs
    route_waypoints: List[Waypoint] = Field(..., min_items=2, description="Flight route waypoints")
    
    # Optional wind optimization
    optimize_wind: bool = Field(default=False, description="Apply wind-optimized distance calculation")
    flight_time: Optional[datetime] = Field(None, description="Flight departure time (for wind data)")
    cruise_altitude: Optional[int] = Field(default=25000, description="Cruise altitude in feet")
    
    class Config:
        json_schema_extra = {
            "example": {
                "request_id": "permit_20240815_001",
                "aircraft": {"icao_type": "B788", "mtow_kg": 242000},
                "route_waypoints": [
                    {"latitude": -11.0169, "longitude": 40.1924},
                    {"latitude": -4.0383, "longitude": 39.2026},
                ],
                "optimize_wind": False,
            }
        }


class NavFeeResponse(BaseModel):
    """Navigation fee calculation response."""
    
    request_id: Optional[str]
    aircraft_type: str
    mtow_kg: float
    route_waypoints: List[Waypoint]
    fir_segments: List[RouteSegment]
    
    # Fee breakdown
    fees_breakdown: List[Dict[str, Any]]
    subtotal_usd: float
    jetelio_margin_usd: float
    total_fee_usd: float
    
    currency: str = "USD"
    calculation_timestamp: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        json_schema_extra = {
            "example": {
                "request_id": "permit_20240815_001",
                "aircraft_type": "B788",
                "mtow_kg": 242000,
                "total_fee_usd": 1250.50,
                "jetelio_margin_usd": 187.58,
            }
        }


class RouteAlternative(BaseModel):
    """Alternative flight route for cost optimization."""
    
    id: Optional[str] = None
    waypoints: List[Waypoint]
    estimated_distance_nm: float


class OperatorOptimizationRequest(BaseModel):
    """Request to optimize routing for operator cost minimization."""
    
    request_id: Optional[str] = None
    aircraft: AircraftSpecs
    flight_date: datetime
    route_alternatives: List[RouteAlternative] = Field(..., min_items=1, max_items=10)
    
    # Cost parameters
    fuel_cost_per_nm: float = Field(..., gt=0, description="Fuel cost per nautical mile (USD)")
    optimize_wind: bool = Field(default=False)
    flight_time: Optional[datetime] = None
    cruise_altitude: Optional[int] = 25000
    
    class Config:
        json_schema_extra = {
            "example": {
                "aircraft": {"icao_type": "B788", "mtow_kg": 242000},
                "flight_date": "2024-08-15T10:00:00Z",
                "route_alternatives": [
                    {
                        "waypoints": [
                            {"latitude": -11.0169, "longitude": 40.1924},
                            {"latitude": -4.0383, "longitude": 39.2026},
                        ],
                        "estimated_distance_nm": 350.0,
                    }
                ],
                "fuel_cost_per_nm": 50.0,
            }
        }


class OperatorOptimizationResponse(BaseModel):
    """Response with optimized routing alternatives ranked by cost."""
    
    request_id: Optional[str]
    aircraft_type: str
    flight_date: datetime
    
    optimized_routes: List[Dict[str, Any]]
    recommended_route_id: Optional[str] = Field(None, description="ID of lowest-cost route")
    potential_savings_usd: float = Field(default=0.0, description="Savings vs worst option")
    
    class Config:
        json_schema_extra = {
            "example": {
                "optimized_routes": [
                    {
                        "route_id": "route_0",
                        "nav_fee_usd": 1250.50,
                        "estimated_fuel_cost_usd": 17500.0,
                        "total_cost_usd": 18750.50,
                        "savings_vs_worst_usd": 500.0,
                    }
                ],
                "recommended_route_id": "route_0",
                "potential_savings_usd": 500.0,
            }
        }


class ANSProviderInfo(BaseModel):
    """Information about an ANS provider."""
    
    icao_code: str
    name: str
    country: str
    firs_managed: List[str]
    fee_formula: str
    base_unit_rate: float
    currency: str
    website: Optional[str] = None
    notes: Optional[str] = None


class FIRInfo(BaseModel):
    """Information about a Flight Information Region."""
    
    icao_code: str
    name: str
    country: str
    ans_provider: str
    region: str
    boundary_coordinates: Optional[List[List[float]]] = None
    notes: Optional[str] = None
