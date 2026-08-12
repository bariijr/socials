"""
FIR routing module - determines which FIRs a route passes through.
Uses Shapely for geometric calculations.
"""

import logging
import math
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass
from shapely.geometry import LineString, Polygon, Point

logger = logging.getLogger(__name__)


@dataclass
class FIRBoundary:
    """Flight Information Region boundary definition."""
    
    icao_code: str
    name: str
    country: str
    provider: str
    polygon: Polygon  # Shapely polygon
    region: Optional[str] = None  # e.g., "AFRICA", "EUROPE"
    min_altitude_ft: int = 0
    max_altitude_ft: int = 65000


@dataclass
class RouteSegment:
    """Flight segment through a single FIR."""
    
    fir_icao: str
    fir_name: str
    ans_provider: str
    
    # Distance calculations
    distance_nm: float  # Nautical miles
    distance_km: float  # Kilometers
    
    # Geometry
    entry_point: Tuple[float, float]  # (lat, lon)
    exit_point: Tuple[float, float]
    segment_waypoints: List[Tuple[float, float]]
    
    # Metadata
    crossing_sequence: int  # Order in route (1-indexed)
    
    def to_dict(self) -> dict:
        """Serialize to dictionary."""
        return {
            "fir_icao": self.fir_icao,
            "fir_name": self.fir_name,
            "ans_provider": self.ans_provider,
            "distance_nm": round(self.distance_nm, 2),
            "distance_km": round(self.distance_km, 2),
            "entry_point": self.entry_point,
            "exit_point": self.exit_point,
            "crossing_sequence": self.crossing_sequence,
        }


class FIRRouter:
    """Route FIR intersection analysis."""
    
    def __init__(self, fir_geometries: Dict[str, FIRBoundary]):
        """
        Initialize router with FIR boundaries.
        
        Args:
            fir_geometries: Dict mapping FIR ICAO codes to FIRBoundary objects
        """
        self.fir_geometries = fir_geometries
        logger.info(f"Initialized FIRRouter with {len(fir_geometries)} FIR boundaries")
        
        # Create spatial index for faster lookups (if Shapely STRtree available)
        try:
            from shapely.strtree import STRtree
            self.spatial_index = STRtree([fir.polygon for fir in fir_geometries.values()])
            logger.info("Spatial index created for FIR lookups")
        except ImportError:
            self.spatial_index = None
            logger.warning("STRtree not available; using brute-force FIR lookups")
    
    def get_fir_list(self, region: Optional[str] = None) -> List[dict]:
        """Get list of configured FIRs, optionally filtered by region."""
        firs = []
        for fir in self.fir_geometries.values():
            if region is None or fir.region == region:
                firs.append({
                    "icao_code": fir.icao_code,
                    "name": fir.name,
                    "country": fir.country,
                    "provider": fir.provider,
                    "region": fir.region,
                })
        return firs
    
    def great_circle_distance(
        self,
        lat1: float,
        lon1: float,
        lat2: float,
        lon2: float,
    ) -> Tuple[float, float]:
        """
        Calculate great circle distance between two points.
        
        Returns:
            (distance_nm, distance_km)
        """
        # Convert to radians
        lat1_rad = math.radians(lat1)
        lon1_rad = math.radians(lon1)
        lat2_rad = math.radians(lat2)
        lon2_rad = math.radians(lon2)
        
        # Haversine formula
        dlat = lat2_rad - lat1_rad
        dlon = lon2_rad - lon1_rad
        
        a = math.sin(dlat / 2) ** 2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(dlon / 2) ** 2
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
        
        # Earth radius in km
        earth_radius_km = 6371
        distance_km = earth_radius_km * c
        
        # Convert to nautical miles
        distance_nm = distance_km / 1.852
        
        return distance_nm, distance_km
    
    def interpolate_great_circle(
        self,
        lat1: float,
        lon1: float,
        lat2: float,
        lon2: float,
        step_nm: float = 10.0,
    ) -> List[Tuple[float, float]]:
        """
        Interpolate points along great circle between two coordinates.
        
        Args:
            lat1, lon1: Start point
            lat2, lon2: End point
            step_nm: Interpolation step in nautical miles
            
        Returns:
            List of (lat, lon) tuples along great circle
        """
        distance_nm, _ = self.great_circle_distance(lat1, lon1, lat2, lon2)
        
        if distance_nm < step_nm:
            return [(lat1, lon1), (lat2, lon2)]
        
        # Number of steps
        num_steps = int(distance_nm / step_nm) + 1
        
        # Convert to radians
        lat1_rad = math.radians(lat1)
        lon1_rad = math.radians(lon1)
        lat2_rad = math.radians(lat2)
        lon2_rad = math.radians(lon2)
        
        # Angular distance (radians)
        d = math.acos(
            math.sin(lat1_rad) * math.sin(lat2_rad) +
            math.cos(lat1_rad) * math.cos(lat2_rad) * math.cos(lon2_rad - lon1_rad)
        )
        
        points = []
        for i in range(num_steps + 1):
            f = i / num_steps
            
            A = math.sin((1 - f) * d) / math.sin(d)
            B = math.sin(f * d) / math.sin(d)
            
            x = A * math.cos(lat1_rad) * math.cos(lon1_rad) + B * math.cos(lat2_rad) * math.cos(lon2_rad)
            y = A * math.cos(lat1_rad) * math.sin(lon1_rad) + B * math.cos(lat2_rad) * math.sin(lon2_rad)
            z = A * math.sin(lat1_rad) + B * math.sin(lat2_rad)
            
            lat = math.degrees(math.atan2(z, math.sqrt(x**2 + y**2)))
            lon = math.degrees(math.atan2(y, x))
            
            points.append((lat, lon))
        
        return points
    
    def intersect_route(self, waypoints: List[dict]) -> List[RouteSegment]:
        """
        Determine which FIRs a route passes through.
        
        Args:
            waypoints: List of waypoint dicts with 'latitude' and 'longitude'
            
        Returns:
            Ordered list of RouteSegment objects
        """
        if len(waypoints) < 2:
            raise ValueError("Route must have at least 2 waypoints")
        
        segments = []
        encountered_firs = {}  # Track which FIRs we've entered
        segment_counter = 0
        
        # Process each leg of the route
        for i in range(len(waypoints) - 1):
            wp1 = waypoints[i]
            wp2 = waypoints[i + 1]
            
            lat1, lon1 = wp1["latitude"], wp1["longitude"]
            lat2, lon2 = wp2["latitude"], wp2["longitude"]
            
            # Interpolate great circle route at 10nm intervals
            interpolated = self.interpolate_great_circle(lat1, lon1, lat2, lon2, step_nm=10.0)
            route_line = LineString(interpolated)
            
            # Find intersecting FIRs
            intersecting_firs = self._find_intersecting_firs(route_line)
            
            # Process each FIR segment
            for fir_code in intersecting_firs:
                if fir_code not in encountered_firs:
                    encountered_firs[fir_code] = 0
                
                encountered_firs[fir_code] += 1
                segment_counter += 1
                
                fir = self.fir_geometries[fir_code]
                
                # Calculate intersection length
                intersection = route_line.intersection(fir.polygon)
                
                if intersection.is_empty:
                    continue
                
                if intersection.geom_type == "LineString":
                    segment_distance_km = intersection.length * 111.0  # Approx km per degree
                    entry_point = tuple(intersection.coords[0])
                    exit_point = tuple(intersection.coords[-1])
                    segment_waypoints = list(intersection.coords)
                    
                elif intersection.geom_type == "MultiLineString":
                    # Multiple segments within same FIR
                    total_distance_km = 0.0
                    segment_waypoints = []
                    entry_point = None
                    exit_point = None
                    
                    for line in intersection.geoms:
                        total_distance_km += line.length * 111.0
                        if entry_point is None:
                            entry_point = tuple(line.coords[0])
                        exit_point = tuple(line.coords[-1])
                        segment_waypoints.extend(line.coords)
                    
                    segment_distance_km = total_distance_km
                
                else:
                    # Point or other geometry
                    continue
                
                # Convert to nautical miles
                segment_distance_nm = segment_distance_km / 1.852
                
                # Create segment
                segment = RouteSegment(
                    fir_icao=fir.icao_code,
                    fir_name=fir.name,
                    ans_provider=fir.provider,
                    distance_nm=segment_distance_nm,
                    distance_km=segment_distance_km,
                    entry_point=entry_point,
                    exit_point=exit_point,
                    segment_waypoints=segment_waypoints,
                    crossing_sequence=segment_counter,
                )
                
                segments.append(segment)
        
        if not segments:
            logger.warning("No FIR intersections found for route")
        
        return segments
    
    def _find_intersecting_firs(self, route_line: LineString) -> List[str]:
        """Find all FIRs that intersect a route line."""
        intersecting = []
        
        if self.spatial_index:
            # Use spatial index for faster lookup
            potential_firs = self.spatial_index.query(route_line)
            for idx in potential_firs:
                fir_code = list(self.fir_geometries.keys())[idx]
                fir = self.fir_geometries[fir_code]
                if route_line.intersects(fir.polygon):
                    intersecting.append(fir_code)
        else:
            # Brute force
            for fir_code, fir in self.fir_geometries.items():
                if route_line.intersects(fir.polygon):
                    intersecting.append(fir_code)
        
        return intersecting


def load_fir_from_geojson(geojson_path: str) -> Dict[str, FIRBoundary]:
    """
    Load FIR boundaries from GeoJSON file.
    
    GeoJSON should have features with properties:
    - icao_code
    - name
    - country
    - provider (ANS provider code)
    - region (optional)
    """
    try:
        import json
        import shapely
        
        firs = {}
        
        with open(geojson_path, "r") as f:
            geojson = json.load(f)
        
        for feature in geojson.get("features", []):
            props = feature.get("properties", {})
            geometry = feature.get("geometry", {})
            
            coords = geometry.get("coordinates", [])
            if not coords:
                continue
            
            # Handle different geometry types
            if geometry.get("type") == "Polygon":
                polygon = Polygon(coords[0])
            elif geometry.get("type") == "MultiPolygon":
                from shapely.geometry import MultiPolygon
                polygons = [Polygon(ring[0]) for ring in coords]
                polygon = MultiPolygon(polygons)
            else:
                continue
            
            fir = FIRBoundary(
                icao_code=props.get("icao_code", "UNKNOWN"),
                name=props.get("name", "Unknown FIR"),
                country=props.get("country", ""),
                provider=props.get("provider", "Unknown"),
                polygon=polygon,
                region=props.get("region"),
            )
            
            firs[fir.icao_code] = fir
        
        logger.info(f"Loaded {len(firs)} FIRs from {geojson_path}")
        return firs
        
    except Exception as e:
        logger.error(f"Error loading FIR GeoJSON: {str(e)}")
        return {}
