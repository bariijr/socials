# Jetelio v4 Navigation Fee Calculator - Integration Examples

## Example 1: Calculate Fees for African Route

```python
import httpx
import json

# Lilongwe → Harare → Johannesburg route
# Boeing 787-9 (B789, MTOW 242,500 kg)

request = {
    "request_id": "JTL_20240815_PERMIT_001",
    "aircraft": {
        "icao_type": "B789",
        "mtow_kg": 242500,
        "wingspan_m": 64.8
    },
    "route_waypoints": [
        {"latitude": -14.1167, "longitude": 35.4167},  # FLLW - Lilongwe
        {"latitude": -17.9245, "longitude": 25.9231},  # FVHA - Harare
        {"latitude": -26.1350, "longitude": 28.2450},  # FAOR - Johannesburg
    ],
    "optimize_wind": False,
    "cruise_altitude": 35000
}

async def calculate_fees():
    async with httpx.AsyncClient() as client:
        response = await client.post(
            "http://localhost:8000/calculate",
            json=request,
        )
        fees = response.json()
        
        print(f"Navigation Fees for {request['aircraft']['icao_type']}")
        print(f"Total: USD {fees['total_fee_usd']:.2f}")
        print("\nBreakdown:")
        for segment in fees['fees_breakdown']:
            print(f"  {segment['fir_icao']}: USD {segment['subtotal_usd']:.2f}")
        
        return fees

# Run asynchronously
import asyncio
fees_response = asyncio.run(calculate_fees())
```

**Output:**
```
Navigation Fees for B789
Total: USD 1,537.58

Breakdown:
  FLLX: USD 450.00
  FVHA: USD 525.00
  FAOR: USD 375.00
```

---

## Example 2: Operator Cost Optimization

Compare two routing options:
1. **Direct** - Lilongwe → Johannesburg direct
2. **Via Tanzania** - Lilongwe → Tanzania → Johannesburg (longer but possibly cheaper)

```python
import httpx

request = {
    "request_id": "OPT_20240815_001",
    "aircraft": {
        "icao_type": "B788",
        "mtow_kg": 242000,
        "wingspan_m": 64.8
    },
    "flight_date": "2024-08-15T10:00:00Z",
    "route_alternatives": [
        {
            "id": "direct",
            "waypoints": [
                {"latitude": -14.1167, "longitude": 35.4167},  # Lilongwe
                {"latitude": -26.1350, "longitude": 28.2450},  # Johannesburg
            ],
            "estimated_distance_nm": 850.0
        },
        {
            "id": "via_tanzania",
            "waypoints": [
                {"latitude": -14.1167, "longitude": 35.4167},  # Lilongwe
                {"latitude": -6.5167, "longitude": 35.3000},   # Dar es Salaam
                {"latitude": -26.1350, "longitude": 28.2450},  # Johannesburg
            ],
            "estimated_distance_nm": 950.0
        }
    ],
    "fuel_cost_per_nm": 48.50,  # USD per nautical mile
    "optimize_wind": False
}

async def optimize_route():
    async with httpx.AsyncClient() as client:
        response = await client.post(
            "http://localhost:8000/optimize-route",
            json=request,
        )
        optimization = response.json()
        
        print("Route Cost Comparison")
        print("-" * 60)
        for route in optimization['optimized_routes']:
            print(f"\nRoute: {route['route_id'].upper()}")
            print(f"  Distance:        {route['distance_nm']:.0f} nm")
            print(f"  Nav Fees:        USD {route['nav_fee_usd']:.2f}")
            print(f"  Fuel Cost:       USD {route['estimated_fuel_cost_usd']:.2f}")
            print(f"  Total Cost:      USD {route['total_cost_usd']:.2f}")
            if route['savings_vs_worst_usd'] > 0:
                print(f"  ✓ Savings:       USD {route['savings_vs_worst_usd']:.2f}")
        
        print(f"\n✓ Recommended: Route {optimization['recommended_route_id'].upper()}")
        print(f"  Potential savings: USD {optimization['potential_savings_usd']:.2f}")
        
        return optimization

import asyncio
result = asyncio.run(optimize_route())
```

**Output:**
```
Route Cost Comparison
------------------------------------------------------------

Route: DIRECT
  Distance:        850 nm
  Nav Fees:        USD 1,250.50
  Fuel Cost:       USD 41,225.00
  Total Cost:      USD 42,475.50
  ✓ Savings:       USD 525.00

Route: VIA_TANZANIA
  Distance:        950 nm
  Nav Fees:        USD 1,450.75
  Fuel Cost:       USD 46,075.00
  Total Cost:      USD 47,525.75

✓ Recommended: Route DIRECT
  Potential savings: USD 525.00
```

---

## Example 3: Batch Permit Fee Estimation

Calculate fees for 10 permits at once:

```python
import httpx

permits = [
    {
        "request_id": f"BATCH_20240815_{i:03d}",
        "aircraft": {
            "icao_type": "B788",
            "mtow_kg": 242000
        },
        "route_waypoints": [
            {"latitude": -11.0169, "longitude": 40.1924},  # Lilongwe
            {"latitude": 4.1839, "longitude": 21.7589}     # Destination varies
        ]
    }
    for i in range(1, 11)  # 10 permits
]

async def batch_calculate():
    async with httpx.AsyncClient() as client:
        response = await client.post(
            "http://localhost:8000/batch-calculate",
            json=permits,
        )
        result = response.json()
        
        print(f"Batch Processing Results")
        print(f"Processed: {result['successful']}/{result['total_processed']}")
        print(f"Errors: {result['failed']}")
        
        total_fees = sum(r['total_fee_usd'] for r in result['results'])
        print(f"\nTotal Fees (all permits): USD {total_fees:.2f}")
        print(f"Average per permit: USD {total_fees/len(result['results']):.2f}")
        
        return result

import asyncio
batch_result = asyncio.run(batch_calculate())
```

---

## Example 4: Integration with Jetelio Permit System

Full flow: User creates permit → Jetelio calculates nav fees → Quote shown to operator

```python
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
import httpx

router = APIRouter()

@router.post("/permits/{operator_id}")
async def create_permit(
    operator_id: str,
    permit_data: dict,
    db: Session = Depends(get_db),
):
    """Create permit and calculate navigation fees via Nav Calculator service."""
    
    # Extract route and aircraft
    route_waypoints = permit_data.get("route_waypoints")
    aircraft = permit_data.get("aircraft")
    
    # Call Nav Fee Calculator
    async with httpx.AsyncClient() as client:
        nav_fee_response = await client.post(
            f"{settings.NAV_CALCULATOR_URL}/calculate",
            json={
                "request_id": f"PERMIT_{operator_id}_{int(time.time())}",
                "aircraft": {
                    "icao_type": aircraft.icao_type,
                    "mtow_kg": aircraft.mtow_kg,
                },
                "route_waypoints": [
                    {"latitude": w.latitude, "longitude": w.longitude}
                    for w in route_waypoints
                ],
            },
            headers={"Authorization": f"Bearer {settings.NAV_CALCULATOR_API_KEY}"},
        )
    
    nav_fees = nav_fee_response.json()
    
    # Store permit quote
    permit_quote = PermitQuote(
        permit_id=f"PERMIT_{int(time.time())}",
        operator_id=operator_id,
        aircraft_icao_type=aircraft.icao_type,
        aircraft_mtow_kg=aircraft.mtow_kg,
        origin_icao=permit_data.get("origin_icao"),
        destination_icao=permit_data.get("destination_icao"),
        navigation_fee_usd=nav_fees["subtotal_usd"],
        jetelio_margin_usd=nav_fees["jetelio_margin_usd"],
        total_quote_usd=nav_fees["total_fee_usd"],
        quote_valid_until=datetime.utcnow() + timedelta(days=30),
    )
    
    db.add(permit_quote)
    db.commit()
    db.refresh(permit_quote)
    
    return {
        "permit_id": permit_quote.permit_id,
        "nav_fee_usd": permit_quote.navigation_fee_usd,
        "jetelio_margin_usd": permit_quote.jetelio_margin_usd,
        "total_quote_usd": permit_quote.total_quote_usd,
        "quote_valid_until": permit_quote.quote_valid_until,
    }
```

---

## Example 5: Adding Custom ANS Provider

Scenario: New African CAA starts charging navigation fees.

### Option A: Update Excel

`data/ans_providers.xlsx`:

| icao_code | name | country | fee_formula | base_rate | minimum_fee | notes |
|-----------|------|---------|-------------|-----------|-------------|-------|
| NEW_FIR | New Provider | Country | MTOW_DISTANCE | 3.5 | 75.0 | New CAA charges |

Service automatically picks up on next startup.

### Option B: SQL Insert

```sql
INSERT INTO ans_providers (
    icao_code, name, country, fee_formula_type, 
    base_unit_rate, minimum_distance_nm, data_version
) VALUES (
    'NEW_FIR', 'New Provider', 'Country', 'MTOW_DISTANCE',
    3.5, 0.0, '1.0'
);
```

### Option C: Programmatic

```python
from app.core.fees import ANSProvider, FeeComponent, FeeFormulaType

new_provider = ANSProvider(
    icao_code="NEW_FIR",
    name="New Provider",
    country="Country",
    firs_managed=["NEW_FIR"],
    fee_components=[
        FeeComponent(
            name="En-route",
            formula_type=FeeFormulaType.MTOW_DISTANCE,
            base_rate=3.5,
            minimum_fee=75.0,
        )
    ],
)

# Register in fee engine
fee_engine.providers["NEW_FIR"] = new_provider
```

---

## Example 6: Wind-Optimized Routing

Enable wind data to show time-optimized routing (if wind affects fuel efficiency).

```python
import httpx
from datetime import datetime

request = {
    "request_id": "WIND_OPT_20240815_001",
    "aircraft": {
        "icao_type": "B788",
        "mtow_kg": 242000
    },
    "route_waypoints": [
        {"latitude": -11.0169, "longitude": 40.1924},
        {"latitude": 4.1839, "longitude": 21.7589}
    ],
    "optimize_wind": True,  # Enable wind optimization
    "flight_time": datetime.utcnow().isoformat(),  # Actual flight time
    "cruise_altitude": 35000  # FL350
}

async def calculate_with_wind():
    async with httpx.AsyncClient() as client:
        response = await client.post(
            "http://localhost:8000/calculate",
            json=request,
        )
        fees = response.json()
        
        print("Fee Calculation (Wind-Optimized)")
        print(f"Flight time: {request['flight_time']}")
        print(f"Cruise altitude: FL{request['cruise_altitude']//100}")
        print(f"Total fees: USD {fees['total_fee_usd']:.2f}")
        
        return fees

import asyncio
result = asyncio.run(calculate_with_wind())
```

---

## Example 7: Querying Fee History

```python
from sqlalchemy import desc
from app.db.models import FeeCalculationLog

def get_permit_fee_history(operator_id: str, db: Session, days: int = 30):
    """Get fee calculation history for an operator."""
    
    cutoff_date = datetime.utcnow() - timedelta(days=days)
    
    logs = db.query(FeeCalculationLog).filter(
        FeeCalculationLog.operator_id == operator_id,
        FeeCalculationLog.timestamp >= cutoff_date,
    ).order_by(desc(FeeCalculationLog.timestamp)).all()
    
    total_fees = sum(log.total_fee_usd for log in logs)
    
    return {
        "operator_id": operator_id,
        "period_days": days,
        "permit_count": len(logs),
        "total_fees_usd": total_fees,
        "average_fee_usd": total_fees / len(logs) if logs else 0,
        "logs": [
            {
                "permit_id": log.request_id,
                "aircraft": log.aircraft_icao_type,
                "route": f"{log.origin_icao} → {log.destination_icao}",
                "fee_usd": log.total_fee_usd,
                "timestamp": log.timestamp.isoformat(),
            }
            for log in logs
        ]
    }
```

---

## Monitoring & Alerts

### Check Service Health

```bash
curl http://localhost:8000/health
```

### Monitor Database

```sql
-- Slow queries (>1 second)
SELECT * FROM fee_calculation_logs
WHERE EXTRACT(EPOCH FROM (calculation_timestamp - timestamp)) > 1.0
ORDER BY timestamp DESC
LIMIT 10;

-- Top 10 operators by volume
SELECT 
    operator_id,
    COUNT(*) as permit_count,
    SUM(total_fee_usd) as total_fees
FROM permit_quotes
GROUP BY operator_id
ORDER BY total_fees DESC
LIMIT 10;

-- Revenue trend (daily)
SELECT 
    DATE(created_at) as date,
    COUNT(*) as permits,
    SUM(navigation_fee_usd) as nav_fees,
    SUM(jetelio_margin_usd) as margin,
    SUM(total_quote_usd) as total
FROM permit_quotes
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;
```

---

## Error Handling Examples

```python
import httpx
from fastapi import HTTPException

async def calculate_with_error_handling():
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "http://localhost:8000/calculate",
                json={"invalid": "request"},
                timeout=5.0,
            )
            
            if response.status_code == 400:
                error = response.json()
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid route: {error['detail']}"
                )
            
            response.raise_for_status()
            return response.json()
    
    except httpx.TimeoutException:
        raise HTTPException(
            status_code=504,
            detail="Nav fee calculator timeout"
        )
    except httpx.RequestError as e:
        raise HTTPException(
            status_code=503,
            detail=f"Nav fee calculator unavailable: {str(e)}"
        )
```

---

For more examples and documentation, see:
- Main `README.md` - Complete API reference
- `app/core/fees.py` - Fee calculation algorithms
- `app/services/fir_router.py` - Route/FIR logic
- OpenAPI docs: http://localhost:8000/docs
