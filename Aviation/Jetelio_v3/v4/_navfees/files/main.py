"""
Jetelio v4 Navigation Fee Calculator Service
Global ANS provider fee calculation engine with FIR-aware routing.
"""

import logging
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, HTTPException, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, validator
import uvicorn

from app.core.config import settings
from app.core.fees import FeeCalculationEngine
from app.models.schemas import (
    RouteSegment,
    NavFeeRequest,
    NavFeeResponse,
    OperatorOptimizationRequest,
    OperatorOptimizationResponse,
    AircraftSpecs,
)
from app.data.providers import load_ans_providers
from app.data.fir_registry import load_fir_geometries
from app.services.fir_router import FIRRouter
from app.services.wind_service import WindService
from app.db.session import engine, Base, get_db

# Configure logging
logging.basicConfig(
    level=logging.INFO if not settings.DEBUG else logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


# Global service instances (initialized on startup)
fee_engine: Optional[FeeCalculationEngine] = None
fir_router: Optional[FIRRouter] = None
wind_service: Optional[WindService] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage service lifecycle: startup and shutdown."""
    # Startup
    logger.info("🚀 Jetelio Nav Fee Calculator initializing...")
    
    try:
        # Create database tables
        Base.metadata.create_all(bind=engine)
        logger.info("✓ Database tables created/verified")
        
        # Load ANS provider data (from Excel, JSON, or database)
        ans_providers = load_ans_providers()
        logger.info(f"✓ Loaded {len(ans_providers)} ANS providers")
        
        # Load FIR geometries (from GeoJSON, shapefile, or PostGIS)
        fir_geometries = load_fir_geometries()
        logger.info(f"✓ Loaded {len(fir_geometries)} FIR boundaries")
        
        # Initialize service engines
        global fee_engine, fir_router, wind_service
        fee_engine = FeeCalculationEngine(providers=ans_providers)
        fir_router = FIRRouter(fir_geometries=fir_geometries)
        wind_service = WindService(api_key=settings.OPENMETEO_API_KEY)
        
        logger.info("✓ All services initialized")
        
    except Exception as e:
        logger.error(f"❌ Startup failed: {str(e)}")
        raise
    
    yield
    
    # Shutdown
    logger.info("🛑 Jetelio Nav Fee Calculator shutting down...")
    # Cleanup resources if needed
    logger.info("✓ Shutdown complete")


# Create FastAPI application
app = FastAPI(
    title="Jetelio Navigation Fee Calculator",
    description="Global ANS provider fee calculation with FIR-aware routing",
    version="4.0.0",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================================
# Health & Info Endpoints
# ============================================================================

@app.get("/health", tags=["System"])
async def health_check():
    """Service health check endpoint."""
    return {
        "status": "healthy",
        "service": "Jetelio Nav Fee Calculator",
        "version": "4.0.0",
    }


@app.get("/providers", tags=["Info"])
async def list_providers(db=Depends(get_db)):
    """List all configured ANS providers."""
    providers = fee_engine.get_provider_list()
    return {
        "count": len(providers),
        "providers": providers,
    }


@app.get("/providers/{provider_icao}", tags=["Info"])
async def get_provider_details(provider_icao: str, db=Depends(get_db)):
    """Get detailed info for a specific ANS provider."""
    provider = fee_engine.get_provider(provider_icao)
    if not provider:
        raise HTTPException(status_code=404, detail=f"Provider {provider_icao} not found")
    return provider.to_dict()


@app.get("/firs", tags=["Info"])
async def list_firs(
    region: Optional[str] = Query(None, description="Filter by region (e.g., 'AFRICA')"),
):
    """List all FIR boundaries with optional region filter."""
    firs = fir_router.get_fir_list(region=region)
    return {
        "count": len(firs),
        "firs": firs,
    }


# ============================================================================
# Core Fee Calculation Endpoints
# ============================================================================

@app.post("/calculate", tags=["Fees"], response_model=NavFeeResponse)
async def calculate_nav_fees(request: NavFeeRequest) -> NavFeeResponse:
    """
    Calculate navigation fees for a flight route.
    
    Supports:
    - Single FIR/provider routing
    - Multi-FIR routes (route intersection analysis)
    - Wind-optimized distance (optional)
    - All global ANS fee formulas (MTOW-only, distance, MTOW+distance, flat-rate)
    
    Args:
        request: Route and aircraft specifications
        
    Returns:
        Itemized fee breakdown by FIR/provider
    """
    try:
        # Validate input
        if not request.route_waypoints or len(request.route_waypoints) < 2:
            raise HTTPException(status_code=400, detail="Route must have at least 2 waypoints")
        
        # Identify FIRs crossed by route
        logger.info(f"Routing {len(request.route_waypoints)} waypoints through FIR network")
        route_segments = fir_router.intersect_route(request.route_waypoints)
        
        if not route_segments:
            raise HTTPException(status_code=400, detail="Route does not intersect any known FIRs")
        
        logger.info(f"Route crosses {len(route_segments)} FIR segments")
        
        # Optionally apply wind correction to distances
        if request.optimize_wind and request.flight_time:
            logger.info("Fetching wind data for optimization...")
            wind_data = await wind_service.get_wind_profile(
                route=request.route_waypoints,
                altitude_ft=request.cruise_altitude or 25000,
                timestamp=request.flight_time,
            )
            # Apply wind-adjusted distance calculation
            route_segments = wind_service.apply_wind_correction(route_segments, wind_data)
        
        # Calculate fees per segment
        fees_breakdown = []
        total_fee_usd = 0.0
        
        for segment in route_segments:
            segment_fee = fee_engine.calculate_segment_fee(
                fir_icao=segment.fir_icao,
                aircraft=request.aircraft,
                distance_nm=segment.distance_nm,
                distance_km=segment.distance_km,
            )
            
            fees_breakdown.append({
                "fir_icao": segment.fir_icao,
                "fir_name": segment.fir_name,
                "ans_provider": segment.ans_provider,
                "distance_nm": segment.distance_nm,
                "distance_km": segment.distance_km,
                "fee_components": segment_fee.components,
                "subtotal_usd": segment_fee.total,
            })
            
            total_fee_usd += segment_fee.total
        
        # Add Jetelio platform margin (if configured)
        jetelio_margin = total_fee_usd * settings.JETELIO_MARGIN_PERCENT / 100
        
        return NavFeeResponse(
            request_id=request.request_id,
            aircraft_type=request.aircraft.icao_type,
            mtow_kg=request.aircraft.mtow_kg,
            route_waypoints=request.route_waypoints,
            fir_segments=route_segments,
            fees_breakdown=fees_breakdown,
            subtotal_usd=total_fee_usd,
            jetelio_margin_usd=jetelio_margin,
            total_fee_usd=total_fee_usd + jetelio_margin,
            currency="USD",
            calculation_timestamp=None,  # Set by response model
        )
        
    except ValueError as e:
        logger.error(f"Validation error: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Fee calculation error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Fee calculation failed")


# ============================================================================
# Operator Cost Optimization
# ============================================================================

@app.post("/optimize-route", tags=["Optimization"], response_model=OperatorOptimizationResponse)
async def optimize_operator_cost(request: OperatorOptimizationRequest):
    """
    Optimize flight routing to minimize operator cost (fuel + nav fees).
    
    Evaluates multiple route options considering:
    - Navigation fee differences across routing alternatives
    - Wind-optimized routing (tailwind maximization)
    - Fuel efficiency vs. fee trade-offs
    
    Returns ranked route options with cost breakdowns.
    """
    try:
        alternatives = []
        
        # Evaluate each proposed route
        for i, route in enumerate(request.route_alternatives):
            # Calculate fees for this route
            fee_calc = NavFeeRequest(
                aircraft=request.aircraft,
                route_waypoints=route.waypoints,
                optimize_wind=request.optimize_wind,
                flight_time=request.flight_time,
                cruise_altitude=request.cruise_altitude,
            )
            
            fee_response = await calculate_nav_fees(fee_calc)
            
            # Estimate fuel cost (simplified; integrate with actual fuel predictor)
            estimated_fuel_cost = route.estimated_distance_nm * request.fuel_cost_per_nm
            
            # Total operator cost
            total_cost = fee_response.total_fee_usd + estimated_fuel_cost
            
            alternatives.append({
                "route_id": route.id or f"route_{i}",
                "waypoints": route.waypoints,
                "nav_fee_usd": fee_response.total_fee_usd,
                "estimated_fuel_cost_usd": estimated_fuel_cost,
                "total_cost_usd": total_cost,
                "distance_nm": route.estimated_distance_nm,
                "fir_summary": {fir["fir_icao"]: fir["fee_components"]["total"] 
                               for fir in fee_response.fees_breakdown},
            })
        
        # Sort by cost (ascending)
        alternatives.sort(key=lambda x: x["total_cost_usd"])
        
        # Calculate savings vs. most expensive
        if alternatives:
            most_expensive = alternatives[-1]["total_cost_usd"]
            for alt in alternatives:
                alt["savings_vs_worst_usd"] = most_expensive - alt["total_cost_usd"]
        
        return OperatorOptimizationResponse(
            request_id=request.request_id,
            aircraft_type=request.aircraft.icao_type,
            flight_date=request.flight_date,
            optimized_routes=alternatives,
            recommended_route_id=alternatives[0]["route_id"] if alternatives else None,
            potential_savings_usd=alternatives[0]["savings_vs_worst_usd"] if len(alternatives) > 1 else 0,
        )
        
    except Exception as e:
        logger.error(f"Route optimization error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Route optimization failed")


# ============================================================================
# Batch Fee Calculation
# ============================================================================

@app.post("/batch-calculate", tags=["Fees"])
async def batch_calculate_fees(requests: list[NavFeeRequest]):
    """
    Batch calculate fees for multiple routes (useful for permit forecasting).
    
    Returns array of NavFeeResponse objects.
    """
    results = []
    errors = []
    
    for i, req in enumerate(requests):
        try:
            result = await calculate_nav_fees(req)
            results.append(result)
        except HTTPException as e:
            errors.append({
                "request_index": i,
                "request_id": req.request_id,
                "error": e.detail,
            })
    
    return {
        "total_processed": len(requests),
        "successful": len(results),
        "failed": len(errors),
        "results": results,
        "errors": errors,
    }


# ============================================================================
# FIR & Route Inspection
# ============================================================================

@app.post("/route-analysis", tags=["Analysis"])
async def analyze_route(waypoints: list[dict] = Query(..., description="Array of lat/lon waypoints")):
    """
    Analyze route for FIR intersections without calculating fees.
    
    Returns detailed segment breakdown.
    """
    try:
        segments = fir_router.intersect_route(waypoints)
        return {
            "waypoint_count": len(waypoints),
            "fir_segments": [s.to_dict() for s in segments],
            "firs_crossed": list(set(s.fir_icao for s in segments)),
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ============================================================================
# Exception Handlers
# ============================================================================

@app.exception_handler(ValueError)
async def value_error_handler(request, exc):
    return JSONResponse(
        status_code=400,
        content={"detail": str(exc)},
    )


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host=settings.API_HOST,
        port=settings.API_PORT,
        reload=settings.DEBUG,
        log_level="info" if not settings.DEBUG else "debug",
    )
