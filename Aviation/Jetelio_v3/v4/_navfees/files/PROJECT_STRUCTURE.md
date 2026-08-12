# Jetelio Navigation Fee Calculator - Project Structure & Architecture

## Directory Tree

```
jetelio-nav-calculator/
├── main.py                          # FastAPI application entry point
├── README.md                        # Complete documentation
├── INTEGRATION_EXAMPLE.md          # Usage examples for Jetelio v4
├── PROJECT_STRUCTURE.md            # This file
├── requirements.txt                # Python dependencies
├── .env.example                    # Environment template
├── Dockerfile                      # Container image definition
├── docker-compose.yml             # Multi-container orchestration
│
├── app/                           # Main application package
│   ├── __init__.py
│   │
│   ├── core/                      # Core business logic
│   │   ├── __init__.py
│   │   ├── config.py              # Settings & environment (Pydantic)
│   │   └── fees.py                # Fee calculation engine (CORE LOGIC)
│   │       ├── FeeFormulaType     # Enum: FLAT, MTOW, DISTANCE, etc.
│   │       ├── FeeComponent       # Individual fee calculation
│   │       ├── ANSProvider        # Provider definition & fee structure
│   │       └── FeeCalculationEngine  # Main calculation service
│   │
│   ├── models/                    # Data models
│   │   ├── __init__.py
│   │   └── schemas.py             # Pydantic request/response models
│   │       ├── AircraftSpecs      # Aircraft weight/dimensions
│   │       ├── Waypoint           # Lat/lon point
│   │       ├── RouteSegment       # FIR segment
│   │       ├── NavFeeRequest      # API request (/calculate)
│   │       ├── NavFeeResponse     # API response
│   │       ├── OperatorOptimizationRequest  # Route optimization request
│   │       └── OperatorOptimizationResponse # Route optimization response
│   │
│   ├── services/                  # Service layer (integrations)
│   │   ├── __init__.py
│   │   ├── fir_router.py          # FIR intersection analysis
│   │   │   ├── FIRBoundary        # FIR definition
│   │   │   ├── RouteSegment       # Segment through FIR
│   │   │   ├── FIRRouter          # Route/FIR intersector
│   │   │   └── load_fir_from_geojson()
│   │   │
│   │   └── wind_service.py        # Wind data integration (Open-Meteo)
│   │       ├── WindService        # Fetch & interpolate wind data
│   │       └── altitude_to_pressure()
│   │
│   ├── db/                        # Database layer
│   │   ├── __init__.py
│   │   ├── session.py             # SQLAlchemy session & connection
│   │   │   ├── engine
│   │   │   ├── SessionLocal
│   │   │   └── get_db()          # FastAPI dependency
│   │   │
│   │   └── models.py              # SQLAlchemy ORM models
│   │       ├── ANSProviderModel   # Provider persistent storage
│   │       ├── FIRModel           # FIR boundary storage
│   │       ├── FeeCalculationLog  # Audit log
│   │       └── PermitQuote        # Generated quotes
│   │
│   └── data/                      # Data loading utilities
│       ├── __init__.py
│       ├── providers.py           # Load ANS providers
│       │   ├── load_ans_providers() # Priority: DB → Excel → JSON
│       │   ├── load_from_excel()
│       │   ├── load_from_json()
│       │   └── load_from_database()
│       │
│       └── fir_registry.py        # Load FIR boundaries
│           ├── load_fir_geometries()
│           └── load_from_postgis()
│
├── data/                          # Data files (must be created by user)
│   ├── ans_providers.xlsx        # ANS provider fee data (Excel)
│   ├── ans_providers.json        # ANS provider fee data (JSON fallback)
│   └── fir_boundaries.geojson    # FIR polygon boundaries (GeoJSON)
│
├── logs/                         # Application logs (created at runtime)
│   └── jetelio_nav.log
│
└── tests/                        # Unit & integration tests (optional)
    ├── __init__.py
    ├── test_fees.py
    ├── test_fir_routing.py
    └── test_api.py
```

## Architecture Overview

### Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    Jetelio v4 Webapp                        │
│           (Permit creation, route planning)                 │
└────────────────────┬────────────────────────────────────────┘
                     │
                     │ HTTP POST
                     │ /calculate, /optimize-route
                     ↓
┌─────────────────────────────────────────────────────────────┐
│            Navigation Fee Calculator API                    │
│                   (FastAPI/main.py)                         │
├─────────────────────────────────────────────────────────────┤
│  Request Validation (Pydantic schemas)                      │
│  ↓                                                           │
│  Route Analysis (FIR Router)                                │
│  • Load FIR boundaries                                      │
│  • Intersect route with FIRs (Shapely)                      │
│  • Calculate distance per FIR segment                       │
│  ↓                                                           │
│  Fee Calculation (FeeCalculationEngine)                     │
│  • For each FIR:                                            │
│    - Look up ANS provider                                   │
│    - Apply fee formula (MTOW-distance, flat, etc.)         │
│    - Sum components                                         │
│  • Apply margins & taxes                                    │
│  ↓                                                           │
│  Optional: Wind Optimization (WindService)                 │
│  • Fetch wind data (Open-Meteo API)                        │
│  • Calculate wind-aware distance                           │
│  ↓                                                           │
│  Database Logging (SQLAlchemy ORM)                         │
│  • Store calculation in audit log                          │
│  • Store permit quote                                       │
│  ↓                                                           │
│  Response Serialization (Pydantic)                         │
└─────────────────────────────────────────────────────────────┘
                     │
                     │ JSON Response
                     ↓
┌─────────────────────────────────────────────────────────────┐
│              Jetelio v4 Webapp (Frontend)                   │
│   • Display itemized fee breakdown                          │
│   • Show Jetelio margin                                     │
│   • Show quote to operator                                  │
└─────────────────────────────────────────────────────────────┘
```

## Core Components Explained

### 1. Fee Calculation Engine (`app/core/fees.py`)

**Purpose**: Calculate navigation fees using global ANS formulas

**Key Classes**:
- `FeeFormulaType` (Enum) - Formula types (FLAT, MTOW, DISTANCE, MTOW_DISTANCE, etc.)
- `FeeComponent` - Individual fee component with formula and bounds
- `ANSProvider` - Provider definition with fee structure
- `FeeCalculationEngine` - Main calculation service

**Example Usage**:
```python
# Create provider
provider = ANSProvider(
    icao_code="FLLX",
    name="Lilongwe",
    fee_components=[
        FeeComponent(
            name="En-route",
            formula_type=FeeFormulaType.MTOW_DISTANCE,
            base_rate=2.0,
            minimum_fee=50.0,
        )
    ]
)

# Calculate fee
components, total = provider.calculate_fee(
    mtow_kg=242000,
    distance_nm=350.0
)
# total = ~450 USD
```

**Fee Formulas Supported**:
| Formula | Equation | Example |
|---------|----------|---------|
| FLAT_RATE | Constant | FLAT: USD 100 |
| MTOW_ONLY | rate × √MTOW | 10 × √242 ≈ USD 155 |
| DISTANCE_ONLY | rate × distance | 2 × 350 = USD 700 |
| MTOW_DISTANCE | rate × √MTOW × distance | 2 × √242 × 350 ≈ USD 10,700 |

### 2. FIR Router (`app/services/fir_router.py`)

**Purpose**: Determine which FIRs a flight route passes through

**Key Classes**:
- `FIRBoundary` - FIR polygon + metadata
- `RouteSegment` - Flight segment through one FIR
- `FIRRouter` - Intersection analysis using Shapely

**Key Methods**:
```python
# Intersect route with FIRs
segments = fir_router.intersect_route(waypoints)

# Get FIR list
firs = fir_router.get_fir_list(region="AFRICA")

# Calculate great circle distance
dist_nm, dist_km = fir_router.great_circle_distance(
    lat1, lon1, lat2, lon2
)

# Interpolate great circle (for accuracy)
points = fir_router.interpolate_great_circle(
    lat1, lon1, lat2, lon2, step_nm=10.0
)
```

**Implementation Details**:
- Uses Shapely for polygon intersection
- Optional spatial indexing (STRtree) for performance
- Haversine formula for great circle distance
- Interpolates route at 10nm intervals for accuracy

### 3. Wind Service (`app/services/wind_service.py`)

**Purpose**: Fetch & apply wind data for route optimization

**Features**:
- Integrates with Open-Meteo API (free tier available)
- Converts altitude to standard pressure levels (FL250 → 700 hPa)
- Interpolates wind data for specific time/location
- Optional wind-corrected distance calculations

**Usage**:
```python
wind_data = await wind_service.get_wind_profile(
    route=waypoints,
    altitude_ft=35000,  # FL350
    timestamp=datetime.utcnow(),
)
# Returns: {u_component, v_component} in m/s

# Apply to route segments
segments = wind_service.apply_wind_correction(segments, wind_data)
```

### 4. API Layer (`main.py`)

**FastAPI Endpoints**:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | Service health check |
| `/providers` | GET | List all ANS providers |
| `/providers/{icao}` | GET | Provider details |
| `/firs` | GET | List FIRs (filterable) |
| `/calculate` | POST | Calculate navigation fees |
| `/optimize-route` | POST | Compare routing options |
| `/batch-calculate` | POST | Batch fee calculation |
| `/route-analysis` | POST | Analyze route (no fees) |

### 5. Data Models

**Request/Response Schemas** (Pydantic):

```
NavFeeRequest
├── aircraft: AircraftSpecs (icao_type, mtow_kg, wingspan_m)
├── route_waypoints: List[Waypoint]  (lat, lon)
├── optimize_wind: bool
└── cruise_altitude: int (feet)

↓ PROCESSING ↓

NavFeeResponse
├── aircraft_type, mtow_kg
├── route_waypoints
├── fir_segments: List[RouteSegment]
├── fees_breakdown: List[FeeComponent]
├── subtotal_usd
├── jetelio_margin_usd
└── total_fee_usd
```

## Data Loading Priority

### ANS Providers

1. **PostgreSQL** (if database exists)
2. **Excel** (`data/ans_providers.xlsx`)
3. **JSON** (`data/ans_providers.json`)
4. **Built-in defaults** (minimal ASECNA, FAA, etc.)

### FIR Boundaries

1. **PostGIS** (if USE_POSTGIS=True)
2. **GeoJSON** (`data/fir_boundaries.geojson`)
3. **Minimal fallback** (3 African FIRs for testing)

## Database Schema

### Tables (SQLAlchemy ORM)

```sql
-- ANS Providers
CREATE TABLE ans_providers (
    id SERIAL PRIMARY KEY,
    icao_code VARCHAR(10) UNIQUE NOT NULL,
    name VARCHAR(255),
    country VARCHAR(100),
    fee_formula_type VARCHAR(50),
    base_unit_rate FLOAT,
    applies_50km_deduction BOOLEAN,
    minimum_distance_nm FLOAT,
    vat_rate FLOAT,
    data_version VARCHAR(20)
);

-- FIR Boundaries
CREATE TABLE firs (
    id SERIAL PRIMARY KEY,
    icao_code VARCHAR(10) UNIQUE NOT NULL,
    name VARCHAR(255),
    country VARCHAR(100),
    ans_provider VARCHAR(10) REFERENCES ans_providers(icao_code),
    region VARCHAR(50),
    boundary_geojson JSON,
    min_altitude_ft INT,
    max_altitude_ft INT
);

-- Audit Logs
CREATE TABLE fee_calculation_logs (
    id SERIAL PRIMARY KEY,
    request_id VARCHAR(100),
    aircraft_icao_type VARCHAR(20),
    aircraft_mtow_kg FLOAT,
    origin_icao VARCHAR(10),
    destination_icao VARCHAR(10),
    firs_crossed JSON,
    total_distance_nm FLOAT,
    total_fee_usd FLOAT,
    fee_breakdown JSON,
    timestamp TIMESTAMP DEFAULT NOW()
);

-- Permit Quotes (generated for operators)
CREATE TABLE permit_quotes (
    id SERIAL PRIMARY KEY,
    permit_id VARCHAR(50) UNIQUE NOT NULL,
    operator_id VARCHAR(100),
    aircraft_reg VARCHAR(20),
    aircraft_icao_type VARCHAR(20),
    aircraft_mtow_kg FLOAT,
    origin_icao VARCHAR(10),
    destination_icao VARCHAR(10),
    navigation_fee_usd FLOAT,
    jetelio_margin_usd FLOAT,
    total_quote_usd FLOAT,
    is_accepted BOOLEAN DEFAULT FALSE,
    quote_valid_until TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

## Configuration Hierarchy

```
Environment Variables (.env)
    ↓
Pydantic Settings (app/core/config.py)
    ↓
Service Initialization (main.py lifespan)
    ↓
Runtime Configuration (FastAPI context)
```

## Extension Points

### Adding New Fee Formulas

```python
# In app/core/fees.py

class FeeFormulaType(Enum):
    # Add new type
    CUSTOM_FORMULA = "custom"

# In FeeComponent.calculate()
elif self.formula_type == FeeFormulaType.CUSTOM_FORMULA:
    fee = self.custom_calculation(mtow_kg, distance_nm)
```

### Adding New ANS Provider

```python
# Option 1: Excel (recommended for Jetelio)
# Edit data/ans_providers.xlsx → add row

# Option 2: Programmatic
provider = ANSProvider(
    icao_code="NEW_FIR",
    name="New Provider",
    # ... fee components
)
fee_engine.providers["NEW_FIR"] = provider
```

### Adding New Data Source

```python
# In app/data/providers.py

def load_from_custom_source(source_path):
    # Parse custom format
    # Return Dict[icao_code → ANSProvider]
    pass

# In load_ans_providers()
try:
    return load_from_custom_source(settings.CUSTOM_SOURCE_PATH)
except:
    # Fall back to existing sources
```

## Performance Considerations

### Database Queries
- Index on `permit_id`, `operator_id`, `timestamp` in `permit_quotes`
- Index on `icao_code` in `ans_providers`, `firs`

### Spatial Queries
- PostGIS: `CREATE INDEX idx_fir_geometry ON fir_boundaries USING GIST (geometry)`
- Shapely: STRtree spatial index (auto-created)

### Caching
- Response caching (1 hour default) via FastAPI
- FIR geometries cached in memory on startup

### Async Processing
- Wind API calls are async (aiohttp)
- Database queries use SQLAlchemy (can use asyncio extensions)

## Testing Strategy

### Unit Tests
- `test_fees.py` - Fee formula calculations
- `test_fir_routing.py` - Route/FIR intersection

### Integration Tests
- `test_api.py` - API endpoint behavior
- Mock Jetelio integration

### Performance Tests
- Batch processing (10+ permits)
- Complex routes (10+ waypoints)

## Deployment

### Local Development
```bash
docker-compose up -d
# API at http://localhost:8000
# Postgres at localhost:5432
```

### Production
```bash
docker build -t jetelio-nav:latest .
docker run -p 8000:8000 \
  -e DATABASE_URL=postgresql://... \
  -v /data/ans_providers.xlsx:/app/data/ans_providers.xlsx \
  jetelio-nav:latest
```

### Environment-Specific Settings
- `DEBUG=False` (production)
- `LOG_LEVEL=INFO` (production)
- `CORS_ORIGINS` - whitelist frontend IPs
- `JETELIO_API_KEY` - shared authentication token

## Monitoring & Operations

### Health Checks
```bash
curl http://localhost:8000/health
# { "status": "healthy", "version": "4.0.0" }
```

### Logs
```bash
tail -f logs/jetelio_nav.log
```

### Database Backups
```bash
docker exec jetelio-nav-db pg_dump -U jetelio jetelio_nav > backup.sql
```

### Performance Profiling
```bash
# View slow queries
SELECT * FROM fee_calculation_logs
WHERE (calculation_timestamp - timestamp) > INTERVAL '1 second'
```

---

This architecture is:
- **Modular** - Swap components (FIR data source, wind service, etc.)
- **Scalable** - Async operations, connection pooling, spatial indexing
- **Extensible** - Easy to add providers, formulas, data sources
- **Testable** - Clear separation of concerns
- **Observable** - Comprehensive logging and audit trails
