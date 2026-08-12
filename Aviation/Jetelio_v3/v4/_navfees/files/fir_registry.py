"""Load FIR boundaries from various sources."""

import logging
from typing import Dict
from app.core.config import settings
from app.services.fir_router import FIRBoundary, load_fir_from_geojson

logger = logging.getLogger(__name__)


def load_fir_geometries() -> Dict[str, FIRBoundary]:
    """
    Load FIR boundaries from configured source.
    
    Priority:
    1. PostGIS database (if enabled)
    2. GeoJSON file
    3. Fallback to empty dict (fees still work, just no FIR intersection)
    """
    
    if settings.USE_POSTGIS:
        try:
            return load_from_postgis()
        except Exception as e:
            logger.warning(f"Failed to load FIRs from PostGIS: {str(e)}")
    
    # Try GeoJSON
    if settings.FIR_GEOJSON_PATH:
        try:
            return load_fir_from_geojson(settings.FIR_GEOJSON_PATH)
        except Exception as e:
            logger.warning(f"Failed to load FIRs from GeoJSON: {str(e)}")
    
    logger.warning("No FIR boundaries loaded; route analysis will be unavailable")
    return {}


def load_from_postgis() -> Dict[str, FIRBoundary]:
    """
    Load FIR boundaries from PostGIS database.
    
    Expects table: public.fir_boundaries
    Columns:
    - icao_code (TEXT PRIMARY KEY)
    - fir_name (TEXT)
    - country (TEXT)
    - ans_provider (TEXT)
    - region (TEXT)
    - geometry (POLYGON)
    """
    try:
        from geoalchemy2 import Geometry
        from shapely.wkb import loads
        from app.db.session import SessionLocal
        
        db = SessionLocal()
        
        firs = {}
        
        # Raw SQL query to fetch FIR geometries
        from sqlalchemy import text
        
        query = text("""
            SELECT
                icao_code,
                fir_name,
                country,
                ans_provider,
                region,
                ST_AsText(geometry) as geom_wkt
            FROM fir_boundaries
            WHERE ST_IsValid(geometry)
        """)
        
        for row in db.execute(query):
            icao, name, country, provider, region, geom_wkt = row
            
            # Parse WKT to Shapely
            from shapely import wkt
            polygon = wkt.loads(geom_wkt)
            
            fir = FIRBoundary(
                icao_code=icao,
                name=name,
                country=country,
                provider=provider,
                polygon=polygon,
                region=region,
            )
            
            firs[icao] = fir
        
        db.close()
        logger.info(f"Loaded {len(firs)} FIRs from PostGIS")
        return firs
    
    except ImportError as e:
        logger.error(f"PostGIS dependencies not installed: {str(e)}")
        raise
    except Exception as e:
        logger.error(f"Error loading from PostGIS: {str(e)}")
        raise


def get_default_fir_subset() -> Dict[str, FIRBoundary]:
    """
    Return minimal FIR set for testing (African FIRs).
    
    This is a fallback with simplified polygon boundaries.
    """
    from shapely.geometry import Polygon
    
    firs = {}
    
    # Lilongwe (Malawi/Southern Africa)
    firs["FLLX"] = FIRBoundary(
        icao_code="FLLX",
        name="Lilongwe",
        country="Malawi",
        provider="ASECNA",
        polygon=Polygon([
            (-19.0, 24.5), (-9.0, 24.5), (-9.0, 36.5), (-19.0, 36.5), (-19.0, 24.5)
        ]),
        region="AFRICA",
    )
    
    # Dakar (West Africa)
    firs["GOOO"] = FIRBoundary(
        icao_code="GOOO",
        name="Dakar",
        country="Senegal",
        provider="ASECNA",
        polygon=Polygon([
            (5.0, -20.0), (5.0, 5.0), (20.0, 5.0), (20.0, -20.0), (5.0, -20.0)
        ]),
        region="AFRICA",
    )
    
    # Antananarivo (Madagascar)
    firs["FMMM"] = FIRBoundary(
        icao_code="FMMM",
        name="Antananarivo",
        country="Madagascar",
        provider="ASECNA",
        polygon=Polygon([
            (-27.0, 40.0), (-12.0, 40.0), (-12.0, 52.0), (-27.0, 52.0), (-27.0, 40.0)
        ]),
        region="AFRICA",
    )
    
    logger.info(f"Loaded {len(firs)} default FIRs (subset for testing)")
    return firs
