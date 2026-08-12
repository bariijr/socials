# Jetelio Navigation Fee Calculator v4.0 - Quick Start Guide

**For: BM @ Insider Tech Sol**  
**Purpose**: Standalone navigation fee calculation service for Jetelio v4 platform  
**Status**: Production-ready, ready to integrate  

---

## 📦 What You're Getting

A **complete FastAPI microservice** for calculating worldwide aviation navigation fees.

```
Files included:
├── main.py                  # FastAPI app (copy & run)
├── app/                     # Complete package structure
│   ├── core/fees.py        # Fee calculation engine
│   ├── core/config.py      # Settings
│   ├── models/schemas.py   # Request/response models
│   ├── services/           # FIR routing, wind data
│   ├── db/                 # Database models
│   └── data/               # Data loading utilities
├── requirements.txt         # Python dependencies
├── Dockerfile              # Container image
├── docker-compose.yml      # PostgreSQL + API
├── .env.example            # Configuration template
├── README.md               # Full documentation
├── INTEGRATION_EXAMPLE.md  # Code examples for Jetelio
└── PROJECT_STRUCTURE.md    # Architecture guide
```

---

## 🚀 Installation (5 minutes)

### Option A: Docker (Recommended)

**Prerequisites**: Docker + Docker Compose

```bash
# 1. Clone/extract files
git clone <repo> jetelio-nav-calculator
cd jetelio-nav-calculator

# 2. Start services (PostgreSQL + API)
docker-compose up -d

# 3. Verify running
curl http://localhost:8000/health

# Expected output:
# {"status":"healthy","service":"Jetelio Nav Fee Calculator","version":"4.0.0"}
```

**API ready at**: http://localhost:8000/docs

### Option B: Local Python

**Prerequisites**: Python 3.10+, PostgreSQL, GEOS (geospatial library)

```bash
# 1. Create virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# 2. Install dependencies
pip install -r requirements.txt

# 3. Create .env from template
cp .env.example .env
# Edit .env with your database URL and settings

# 4. Initialize database
# (Optional; FastAPI auto-creates on startup)
alembic upgrade head

# 5. Run service
python -m uvicorn main:app --reload --port 8000
```

---

## ⚙️ Configuration

### Minimal Setup (out of the box)

1. **Edit `.env`** with your database URL:

```bash
DATABASE_URL=postgresql://jetelio:password@localhost:5432/jetelio_nav
JETELIO_API_BASE=http://localhost:8001
JETELIO_MARGIN_PERCENT=15.0
```

2. **Create data files** (optional; service has built-in defaults):

- `data/ans_providers.xlsx` - ANS fee data (Excel)
- `data/fir_boundaries.geojson` - FIR polygons (GeoJSON)

See [Data Models](#data-models) below for format.

### Optional Enhancements

```bash
# Enable wind optimization (Open-Meteo API)
ENABLE_WIND_OPTIMIZATION=True
OPENMETEO_API_KEY=  # Leave empty for free tier

# Use PostGIS for faster FIR queries
USE_POSTGIS=True

# Set platform margin on fees
JETELIO_MARGIN_PERCENT=15.0  # 15% markup
```

---

## 🔄 Integration with Jetelio v4

### How It Works

1. **Jetelio Frontend** → User creates permit, enters route + aircraft
2. **Jetelio Core API** → Calls `/calculate` endpoint with route data
3. **Nav Fee Calculator** → Returns itemized fee breakdown
4. **Jetelio Stores** → Quote in database, shows operator
5. **Operator** → Accepts/declines permit

### Jetelio v4 Code Integration

**In Jetelio Core `.env`**:

```bash
NAV_CALCULATOR_URL=http://localhost:8000
NAV_CALCULATOR_API_KEY=dev-key
```

**In Jetelio service code**:

```python
import httpx

async def calculate_navigation_fees(aircraft, route_waypoints):
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{settings.NAV_CALCULATOR_URL}/calculate",
            json={
                "aircraft": {
                    "icao_type": aircraft.icao_type,
                    "mtow_kg": aircraft.mtow_kg,
                },
                "route_waypoints": [
                    {"latitude": wp.latitude, "longitude": wp.longitude}
                    for wp in route_waypoints
                ],
            },
            headers={"Authorization": f"Bearer {settings.NAV_CALCULATOR_API_KEY}"},
        )
        
        if response.status_code != 200:
            raise ValueError(f"Fee calculation failed: {response.text}")
        
        fees = response.json()
        
        # Store quote for operator
        permit_quote = PermitQuote(
            permit_id=permit.id,
            navigation_fee_usd=fees["subtotal_usd"],
            jetelio_margin_usd=fees["jetelio_margin_usd"],
            total_quote_usd=fees["total_fee_usd"],
        )
        db.add(permit_quote)
        db.commit()
        
        return fees
```

### Testing the Integration

```bash
# Verify service is running
curl http://localhost:8000/health

# Get list of ANS providers
curl http://localhost:8000/providers

# Calculate fees for a sample route
curl -X POST http://localhost:8000/calculate \
  -H "Content-Type: application/json" \
  -d '{
    "aircraft": {"icao_type": "B788", "mtow_kg": 242000},
    "route_waypoints": [
      {"latitude": -11.0169, "longitude": 40.1924},
      {"latitude": 4.1839, "longitude": 21.7589}
    ]
  }'
```

---

## 📊 API Endpoints

### Health & Info
```bash
GET /health                    # Service status
GET /providers                 # List ANS providers
GET /providers/{icao}          # Provider details
GET /firs?region=AFRICA        # List FIRs
```

### Fee Calculation
```bash
POST /calculate                # Calculate fees for one route
POST /batch-calculate          # Calculate multiple routes
POST /optimize-route           # Compare routing options
POST /route-analysis           # Analyze route (no fees)
```

### Full Documentation
Open http://localhost:8000/docs (Swagger UI)

---

## 📋 Data Models

### ANS Provider Data (Excel Format)

`data/ans_providers.xlsx` sheet "Providers":

| Column | Type | Example | Required |
|--------|------|---------|----------|
| icao_code | TEXT | FLLX | ✓ |
| name | TEXT | Lilongwe | ✓ |
| country | TEXT | Malawi | ✓ |
| fee_formula | TEXT | MTOW_DISTANCE | ✓ |
| base_rate | FLOAT | 2.0 | ✓ |
| minimum_fee | FLOAT | 50.0 |  |
| maximum_fee | FLOAT | 5000.0 |  |
| applies_50km_deduction | BOOL | TRUE |  |
| vat_rate | FLOAT | 0.0 |  |

**Fee Formulas**:
- `FLAT_RATE` - Constant fee (e.g., USD 100)
- `MTOW_ONLY` - Weight-based: `rate × √MTOW`
- `DISTANCE_ONLY` - Distance-based: `rate × distance`
- `MTOW_DISTANCE` - Both: `rate × √MTOW × distance` (EUROCONTROL, ASECNA)

### FIR Boundaries (GeoJSON Format)

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
        "coordinates": [[
          [-11, 24.5], [-9, 24.5], 
          [-9, 36.5], [-11, 36.5], 
          [-11, 24.5]
        ]]
      }
    }
  ]
}
```

### Request Example

```json
{
  "request_id": "PERMIT_20240815_001",
  "aircraft": {
    "icao_type": "B788",
    "mtow_kg": 242000,
    "wingspan_m": 64.8
  },
  "route_waypoints": [
    {"latitude": -11.0169, "longitude": 40.1924},
    {"latitude": 4.1839, "longitude": 21.7589}
  ],
  "optimize_wind": false,
  "cruise_altitude": 35000
}
```

### Response Example

```json
{
  "request_id": "PERMIT_20240815_001",
  "aircraft_type": "B788",
  "mtow_kg": 242000,
  "total_fee_usd": 1437.58,
  "fees_breakdown": [
    {
      "fir_icao": "FLLX",
      "fir_name": "Lilongwe",
      "ans_provider": "ASECNA",
      "distance_nm": 350.0,
      "subtotal_usd": 450.0
    }
  ],
  "calculation_timestamp": "2024-08-15T10:30:00Z"
}
```

---

## 🌍 Global ANS Provider Support

### Pre-Configured (Production-Ready)

| Provider | Region | Formula | Coverage |
|----------|--------|---------|----------|
| EUROCONTROL | Europe | MTOW×Distance | France, UK, etc. |
| ASECNA | Africa | MTOW×Distance+50km deduction | 18 African countries |
| FAA | USA | Flat rate (terminal) | Continental US |
| NATS | UK/Ireland | MTOW×Distance | UK, Ireland |
| AEROTHAI | Thailand | MTOW×Distance | Thailand airspace |

### Adding New Providers

**Method 1: Excel (Recommended for you)**

1. Open `data/ans_providers.xlsx`
2. Add row with provider details
3. Service auto-loads on next request

**Method 2: Database**

```sql
INSERT INTO ans_providers (
    icao_code, name, country, fee_formula_type, 
    base_unit_rate, managed_firs
) VALUES (
    'NEW_FIR', 'New Provider', 'Country', 'MTOW_DISTANCE',
    3.5, '["NEW_FIR"]'
);
```

**Method 3: Programmatic**

See `INTEGRATION_EXAMPLE.md` → "Example 5: Adding Custom ANS Provider"

---

## 🔍 Monitoring & Debugging

### Check Service Health

```bash
# Is service running?
curl http://localhost:8000/health

# View logs
docker-compose logs -f nav-calculator

# Or locally:
tail -f logs/jetelio_nav.log
```

### Check Database

```bash
# Connect to database
docker exec -it jetelio-nav-db psql -U jetelio -d jetelio_nav

# View fee calculation history
SELECT * FROM fee_calculation_logs ORDER BY timestamp DESC LIMIT 10;

# View permit quotes
SELECT * FROM permit_quotes ORDER BY created_at DESC LIMIT 10;
```

### Common Issues

| Issue | Solution |
|-------|----------|
| `Database connection failed` | Check `DATABASE_URL` in `.env`, verify PostgreSQL running |
| `FIR boundaries not loading` | Ensure `data/fir_boundaries.geojson` exists (or run with defaults) |
| `No providers found` | Create `data/ans_providers.xlsx` or add to database |
| `Slow calculations` | Use `USE_POSTGIS=True` for faster FIR queries |

---

## 📈 Performance Tuning

### For Your Use Case

**Single permits**: Default config is fine (~50-100ms per calculation)

**Batch processing** (10+ permits): Enable caching

```bash
ENABLE_CACHE=True
CACHE_TTL_SECONDS=3600
```

**PostGIS optimization** (if you have many FIRs):

```bash
USE_POSTGIS=True
```

Then create index:

```sql
CREATE INDEX IF NOT EXISTS idx_fir_geometry 
ON fir_boundaries USING GIST (geometry);
```

---

## 🧪 Testing

### Manual API Testing

```bash
# List providers
curl http://localhost:8000/providers | jq .

# Calculate fees
curl -X POST http://localhost:8000/calculate \
  -H "Content-Type: application/json" \
  -d @- << 'EOF'
{
  "aircraft": {"icao_type": "B788", "mtow_kg": 242000},
  "route_waypoints": [
    {"latitude": -11.0169, "longitude": 40.1924},
    {"latitude": 4.1839, "longitude": 21.7589}
  ]
}
EOF

# Get Swagger UI
open http://localhost:8000/docs
```

### Unit Tests (if included)

```bash
pip install pytest pytest-asyncio

# Run all tests
pytest

# Run specific test
pytest tests/test_fees.py::test_asecna_calculation

# With coverage
pytest --cov=app
```

---

## 📚 Documentation

- **Full API Docs**: `README.md` (50+ pages)
- **Integration Examples**: `INTEGRATION_EXAMPLE.md` (7 code examples)
- **Architecture Guide**: `PROJECT_STRUCTURE.md` (detailed diagrams)
- **OpenAPI Swagger**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

---

## 🚢 Production Deployment

### Docker Image

```bash
# Build image
docker build -t jetelio-nav:4.0 .

# Run container
docker run -p 8000:8000 \
  -e DATABASE_URL=postgresql://... \
  -e JETELIO_MARGIN_PERCENT=15.0 \
  -v /data/ans_providers.xlsx:/app/data/ans_providers.xlsx \
  jetelio-nav:4.0
```

### Kubernetes (optional)

Update `docker-compose.yml` to production settings:

```yaml
environment:
  DEBUG: "False"
  LOG_LEVEL: "INFO"
  REQUESTS_PER_MINUTE: 120  # Rate limiting
```

### Health Checks

Service exposes health endpoint:

```bash
curl http://localhost:8000/health

# Kubernetes liveness probe:
# httpGet:
#   path: /health
#   port: 8000
#   initialDelaySeconds: 10
#   periodSeconds: 30
```

---

## 📞 Support & Troubleshooting

### Quick Checklist

- [ ] Service running: `curl http://localhost:8000/health`
- [ ] Database connected: `docker-compose logs nav-calculator | grep database`
- [ ] ANS providers loaded: `curl http://localhost:8000/providers`
- [ ] FIR boundaries available: `curl http://localhost:8000/firs`

### Configuration Checklist

- [ ] `.env` file created and configured
- [ ] `DATABASE_URL` points to valid PostgreSQL
- [ ] `JETELIO_API_BASE` set to Jetelio v4 URL
- [ ] `JETELIO_API_KEY` matches Jetelio config
- [ ] `JETELIO_MARGIN_PERCENT` configured (default 15%)

### For Issues

1. Check logs: `docker-compose logs nav-calculator`
2. Review `.env` configuration
3. Verify database: `docker-compose logs postgres`
4. Test API: `curl http://localhost:8000/health`
5. See `README.md` → Troubleshooting section

---

## 📋 Next Steps

1. **Extract files** to your working directory
2. **Configure `.env`** with your database and Jetelio settings
3. **Start service** with Docker Compose
4. **Integrate with Jetelio** using example code in `INTEGRATION_EXAMPLE.md`
5. **Test** with sample permit routes
6. **Monitor** via logs and `/health` endpoint

---

## 🎯 Key Features for Jetelio

✅ **Global coverage** - 54+ African countries + worldwide ANS providers  
✅ **FIR-aware routing** - Automatic route/FIR intersection analysis  
✅ **Multiple fee formulas** - MTOW, distance, combined, flat-rate  
✅ **Excel-driven data** - Easy provider updates without code changes  
✅ **Margin control** - Configurable platform markup per permit  
✅ **Audit logging** - Complete calculation history for compliance  
✅ **Wind optimization** - Optional time-efficient routing  
✅ **Batch processing** - Quote multiple permits at once  
✅ **API-first** - Clean REST API for Jetelio integration  
✅ **Production-ready** - Docker, PostgreSQL, logging, error handling  

---

## 📦 Versions

- **Service**: 4.0.0
- **Python**: 3.10+
- **FastAPI**: 0.109+
- **PostgreSQL**: 14+

---

**Created for**: Insider Tech Sol  
**Jetelio Platform Integration**: Ready for v4 webapp  
**Last Updated**: August 2024  

For detailed documentation, see `README.md`
