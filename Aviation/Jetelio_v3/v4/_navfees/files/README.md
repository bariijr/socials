# Jetelio Navigation Fee Calculator v4.0

Global Air Navigation Service (ANS) provider fee calculation engine for the Jetelio v4 aviation permit platform.

**Status**: Production-ready service with support for 54+ African countries, EUROCONTROL, FAA, and 100+ ANS providers worldwide.

## Features

- ✈️ **Global ANS Coverage** - Supports multiple fee formulas (MTOW-only, distance-based, MTOW+distance, flat-rate)
- 🌍 **FIR-Aware Routing** - Automatic Flight Information Region intersection analysis
- 💨 **Wind Optimization** - Optional wind-corrected routing via Open-Meteo API
- 💰 **Multi-Provider Support** - EUROCONTROL, ASECNA, FAA, NATS, AEROTHAI, and extensible provider registry
- 📊 **Operator Cost Optimization** - Compare multiple routes ranked by total cost (nav fees + fuel)
- 📈 **Excel-First Data Model** - ANS provider data loads from Excel for easy updates
- 🔄 **Batch Processing** - Calculate fees for multiple permits efficiently
- 🗄️ **PostgreSQL Backend** - Persistent audit logging and permit quotes
- 🔌 **Jetelio v4 Integration** - REST API designed for seamless platform integration
- 🚀 **FastAPI** - Modern async framework with auto-generated OpenAPI docs

## Quick Start

### 1. Prerequisites

- Python 3.10+
- PostgreSQL 14+ (or use SQLite for dev)
- GEOS library (for Shapely geospatial operations)

### 2. Installation

```bash
# Clone repository
git clone <repository-url>
cd jetelio-nav-calculator

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Copy environment template
cp .env.example .env

# Edit .env with your settings
nano .env
```

### 3. Database Setup

```bash
# Initialize database (creates tables)
alembic upgrade head

# Or use FastAPI lifespan (automatic on startup)
python -m uvicorn main:app --reload
```

### 4. Run Service

```bash
# Development (with reload)
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Production
gunicorn -w 4 -k uvicorn.workers.UvicornWorker main:app --bind 0.0.0.0:8000
```

Service runs at `http://localhost:8000`
- **API Docs**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

## API Endpoints

### Health & Info

```bash
# Service health check
GET /health

# List all ANS providers
GET /providers

# Get provider details
GET /providers/{provider_icao}

# List FIRs (with optional region filter)
GET /firs?region=AFRICA
```

### Fee Calculation

```bash
# Calculate fees for a single route
POST /calculate
```

**Request:**
```json
{
  "request_id": "permit_20240815_001",
  "aircraft": {
    "icao_type": "B788",
    "mtow_kg": 242000,
    "wingspan_m": 64.8
  },
  "route_waypoints": [
    {"latitude": -11.0169, "longitude": 40.1924},
    {"latitude": -4.0383, "longitude": 39.2026},
    {"latitude": 4.1839, "longitude": 21.7589}
  ],
  "optimize_wind": false,
  "cruise_altitude": 25000
}
```

**Response:**
```json
{
  "request_id": "permit_20240815_001",
  "aircraft_type": "B788",
  "mtow_kg": 242000,
  "total_fee_usd": 1250.50,
  "jetelio_margin_usd": 187.58,
  "total_fee_usd": 1437.58,
  "fees_breakdown": [
    {
      "fir_icao": "FLLX",
      "fir_name": "Lilongwe",
      "ans_provider": "ASECNA",
      "distance_nm": 350.0,
      "distance_km": 648.2,
      "fee_components": [
        {
          "name": "En-route",
          "formula": "mtow_distance",
          "amount_usd": 450.0
        }
      ],
      "subtotal_usd": 450.0
    }
  ],
  "calculation_timestamp": "2024-08-15T10:30:00Z"
}
```

### Route Optimization

```bash
# Optimize operator cost across multiple route alternatives
POST /optimize-route
```

**Request:**
```json
{
  "request_id": "opt_20240815_001",
  "aircraft": {
    "icao_type": "B788",
    "mtow_kg": 242000
  },
  "flight_date": "2024-08-15T10:00:00Z",
  "route_alternatives": [
    {
      "id": "direct",
      "waypoints": [
        {"latitude": -11.0169, "longitude": 40.1924},
        {"latitude": 4.1839, "longitude": 21.7589}
      ],
      "estimated_distance_nm": 850.0
    },
    {
      "id": "via_congo",
      "waypoints": [
        {"latitude": -11.0169, "longitude": 40.1924},
        {"latitude": -4.0383, "longitude": 39.2026},
        {"latitude": 4.1839, "longitude": 21.7589}
      ],
      "estimated_distance_nm": 950.0
    }
  ],
  "fuel_cost_per_nm": 50.0,
  "optimize_wind": false
}
```

**Response:**
```json
{
  "optimized_routes": [
    {
      "route_id": "direct",
      "nav_fee_usd": 1250.50,
      "estimated_fuel_cost_usd": 42500.0,
      "total_cost_usd": 43750.50,
      "savings_vs_worst_usd": 500.0
    },
    {
      "route_id": "via_congo",
      "nav_fee_usd": 1450.75,
      "estimated_fuel_cost_usd": 47500.0,
      "total_cost_usd": 48950.75
    }
  ],
  "recommended_route_id": "direct",
  "potential_savings_usd": 500.0
}
```

### Batch Calculation

```bash
# Calculate fees for multiple permits
POST /batch-calculate
```

**Request:** Array of NavFeeRequest objects

### Route Analysis

```bash
# Analyze route without calculating fees
POST /route-analysis
```

## Configuration

### Environment Variables

Key settings in `.env`:

| Variable | Default | Description |
|----------|---------|-------------|
| `API_HOST` | `0.0.0.0` | API bind address |
| `API_PORT` | `8000` | API port |
| `DATABASE_URL` | `postgresql://...` | PostgreSQL connection |
| `JETELIO_API_BASE` | `http://localhost:8001` | Main Jetelio API URL |
| `JETELIO_MARGIN_PERCENT` | `15.0` | Platform margin on fees |
| `EXCEL_DATA_PATH` | `./data/ans_providers.xlsx` | ANS provider data file |
| `FIR_GEOJSON_PATH` | `./data/fir_boundaries.geojson` | FIR boundary geometries |
| `USE_POSTGIS` | `False` | Use PostGIS for FIR queries |
| `ENABLE_WIND_OPTIMIZATION` | `True` | Wind data integration |

### ANS Provider Data

ANS providers can be configured via:

#### 1. **Excel Format** (Recommended for Jetelio integration)

`data/ans_providers.xlsx` with sheet "Providers":

| Column | Type | Example |
|--------|------|---------|
| icao_code | TEXT | FLLX |
| name | TEXT | Lilongwe |
| country | TEXT | Malawi |
| fee_formula | TEXT | MTOW_DISTANCE |
| base_rate | FLOAT | 2.0 |
| minimum_fee | FLOAT | 50.0 |
| maximum_fee | FLOAT | 5000.0 |
| applies_50km_deduction | BOOL | TRUE |
| notes | TEXT | ASECNA provider |

#### 2. **JSON Format**

`data/ans_providers.json`:

```json
{
  "PROVIDERS": [
    {
      "icao_code": "FLLX",
      "name": "Lilongwe",
      "country": "Malawi",
      "fee_formula": "MTOW_DISTANCE",
      "base_rate": 2.0,
      "minimum_fee": 50.0,
      "applies_50km_deduction": true
    }
  ]
}
```

#### 3. **Database**

Providers auto-load from PostgreSQL `ans_providers` table if Excel/JSON unavailable.

### FIR Boundaries

#### 1. **GeoJSON Format** (Recommended)

`data/fir_boundaries.geojson`:

```geojson
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "properties": {
        "icao_code": "FLLX",
        "name": "Lilongwe",
        "country": "Malawi",
        "provider": "ASECNA",
        "region": "AFRICA"
      },
      "geometry": {
        "type": "Polygon",
        "coordinates": [[[-11, 24.5], [-9, 24.5], [-9, 36.5], [-11, 36.5], [-11, 24.5]]]
      }
    }
  ]
}
```

#### 2. **PostGIS Database**

If `USE_POSTGIS=True`, expects table:

```sql
CREATE TABLE fir_boundaries (
    icao_code TEXT PRIMARY KEY,
    fir_name TEXT,
    country TEXT,
    ans_provider TEXT,
    region TEXT,
    geometry GEOMETRY(POLYGON, 4326)
);

CREATE INDEX idx_fir_geometry ON fir_boundaries USING GIST (geometry);
```

## Jetelio v4 Integration

### How Jetelio Calls This Service

1. **On Permit Creation** - Jetelio v4 calls `/calculate` with aircraft + route to estimate fees
2. **Quote Generation** - Results stored in `permit_quotes` table for operator viewing
3. **Route Optimization** - When operator has multiple routing options, Jetelio calls `/optimize-route`
4. **Batch Permits** - Uses `/batch-calculate` for bulk forecasts

### Data Flow

```
Jetelio v4 Frontend
    ↓ (aircraft + waypoints)
Jetelio v4 Core API
    ↓ (REST call)
Nav Fee Calculator
    ↓ (FIR intersection + fee calculation)
Result (itemized breakdown + Jetelio margin)
    ↓ (stored in permit_quotes)
Operator Portal
```

### Environment Setup

In Jetelio v4 `.env`:

```bash
NAV_CALCULATOR_URL=http://localhost:8000
NAV_CALCULATOR_API_KEY=<shared-key>
```

In Jetelio v4 code:

```python
import httpx

async def get_nav_fees(aircraft, route_waypoints):
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{settings.NAV_CALCULATOR_URL}/calculate",
            json={
                "aircraft": {
                    "icao_type": aircraft.icao_type,
                    "mtow_kg": aircraft.mtow_kg,
                },
                "route_waypoints": [
                    {"latitude": w.lat, "longitude": w.lon}
                    for w in route_waypoints
                ],
            },
            headers={"Authorization": f"Bearer {settings.NAV_CALCULATOR_API_KEY}"},
        )
        return response.json()
```

## Fee Formulas Supported

### EUROCONTROL (Europe)

```
Fee = 0.5 × √(MTOW in tonnes) × Distance in km
```

### ASECNA (Africa - 18 countries)

```
Fee = 2.0 × √(MTOW) × Distance
- Minimum: USD 50
- Applies 50km deduction for takeoff/landing
- Additional approach fee: 10 × √(MTOW)
```

### FAA (USA)

```
Flat terminal navigation fee: $25
(No distance-based overflight charges for US airspace)
```

### Thailand (AEROTHAI)

```
Fee = 4.5 × √(MTOW) × Distance
- Minimum: USD 100
- Applies 50km deduction
```

### Custom Formulas

Define new formulas in `app/core/fees.py` by extending `FeeFormulaType` enum and adding calculation logic to `FeeComponent.calculate()`.

## Adding New ANS Providers

### Method 1: Excel Update (Recommended for Jetelio)

1. Edit `data/ans_providers.xlsx`
2. Add row with provider data
3. Service auto-reloads on next request (or restart)

### Method 2: API/Database

```python
from app.db.models import ANSProviderModel
from app.db.session import SessionLocal

db = SessionLocal()
db.add(ANSProviderModel(
    icao_code="XXXX",
    name="New Provider",
    country="Country",
    fee_formula_type="MTOW_DISTANCE",
    base_unit_rate=2.5,
))
db.commit()
```

### Method 3: Code

Modify `get_default_providers()` in `app/core/fees.py`.

## Monitoring & Logging

### Audit Logging

All fee calculations logged to `fee_calculation_logs` table:

```sql
SELECT * FROM fee_calculation_logs
WHERE timestamp > NOW() - INTERVAL '1 day'
ORDER BY timestamp DESC;
```

### Application Logs

```bash
# View logs
tail -f logs/jetelio_nav.log

# Set log level
LOG_LEVEL=DEBUG python -m uvicorn main:app
```

## Performance Tuning

### Caching

Enable response caching to reduce database queries:

```python
ENABLE_CACHE=True
CACHE_TTL_SECONDS=3600
```

### Spatial Indexing

If using PostGIS, ensure index exists:

```sql
CREATE INDEX IF NOT EXISTS idx_fir_geometry 
ON fir_boundaries USING GIST (geometry);
```

### Connection Pooling

PostgreSQL connection pool settings in `app/db/session.py`:

```python
engine = create_engine(
    DATABASE_URL,
    pool_size=20,          # Max connections
    max_overflow=40,       # Additional connections
    pool_pre_ping=True,    # Verify connections
)
```

## Testing

```bash
# Run tests
pytest

# With coverage
pytest --cov=app

# Specific test
pytest tests/test_fees.py::test_eurocontrol_fee_calculation
```

## Troubleshooting

### Database Connection Failed
```bash
# Check PostgreSQL running
psql -U postgres -c "SELECT version();"

# Verify DATABASE_URL in .env
# Format: postgresql://user:password@host:port/database
```

### FIR Boundaries Not Loading
```bash
# Verify GeoJSON path
ls -la data/fir_boundaries.geojson

# Or enable PostGIS and check table
psql -d jetelio_nav -c "SELECT COUNT(*) FROM fir_boundaries;"
```

### Slow Fee Calculations
```bash
# Check if Shapely spatial index is active
# (Look for "Spatial index created" in logs)

# If not, enable PostGIS:
USE_POSTGIS=True
```

## API Authentication

For production, add Bearer token validation:

```python
from fastapi import HTTPException, Header

async def verify_api_key(authorization: str = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization")
    
    token = authorization.replace("Bearer ", "")
    if token != settings.JETELIO_API_KEY:
        raise HTTPException(status_code=403, detail="Invalid token")
```

## Production Deployment

### Docker

```dockerfile
FROM python:3.11-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["gunicorn", "-w", "4", "-k", "uvicorn.workers.UvicornWorker", \
     "main:app", "--bind", "0.0.0.0:8000"]
```

```bash
docker build -t jetelio-nav:latest .
docker run -p 8000:8000 --env-file .env jetelio-nav:latest
```

### Kubernetes Deployment

See `k8s/deployment.yaml` for example manifests.

## Data Sources & References

- **EUROCONTROL**: https://www.eurocontrol.int/
- **ASECNA**: https://www.asecna.aero/
- **FAA**: https://www.faa.gov/
- **ICAO**: https://www.icao.int/
- **FIR Data**: OpenNav, AIP documents

## Contributing

1. Fork repository
2. Create feature branch: `git checkout -b feature/new-provider`
3. Add tests
4. Submit pull request

## License

Proprietary - Insider Tech Sol

## Support

- **Documentation**: http://localhost:8000/docs
- **Issues**: GitHub Issues
- **Email**: support@insidertechsol.com

---

**Version**: 4.0.0  
**Last Updated**: August 2024  
**Status**: Production-Ready
