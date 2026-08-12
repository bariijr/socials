"""Wind data integration for wind-optimized routing."""

import logging
import aiohttp
from typing import List, Optional, Dict, Tuple
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)


class WindService:
    """Integration with Open-Meteo API for wind data."""
    
    def __init__(self, api_key: Optional[str] = None):
        """
        Initialize wind service.
        
        Args:
            api_key: Open-Meteo API key (not required for free tier)
        """
        self.api_key = api_key
        self.base_url = "https://api.open-meteo.com/v1"
        self.cache = {}  # Simple in-memory cache
    
    async def get_wind_profile(
        self,
        route: List[Dict],
        altitude_ft: int = 25000,
        timestamp: Optional[datetime] = None,
    ) -> Dict:
        """
        Fetch wind data for a flight route at given altitude and time.
        
        Args:
            route: List of waypoint dicts with 'latitude' and 'longitude'
            altitude_ft: Cruise altitude in feet (converted to pressure level)
            timestamp: Flight time (uses forecast if future, else historical)
            
        Returns:
            Wind data dict with U/V components for interpolation
        """
        try:
            if timestamp is None:
                timestamp = datetime.utcnow()
            
            # Convert altitude to pressure level
            pressure_level = self._altitude_to_pressure(altitude_ft)
            
            # Get wind data from Open-Meteo
            wind_data = await self._fetch_wind_data(
                latitude=route[0]["latitude"],
                longitude=route[0]["longitude"],
                timestamp=timestamp,
                pressure_level=pressure_level,
            )
            
            logger.info(f"Fetched wind data at {pressure_level}hPa")
            return wind_data
            
        except Exception as e:
            logger.warning(f"Wind data fetch failed: {str(e)}; continuing without wind optimization")
            return {"u_component": 0, "v_component": 0}  # Neutral wind
    
    async def _fetch_wind_data(
        self,
        latitude: float,
        longitude: float,
        timestamp: datetime,
        pressure_level: int,
    ) -> Dict:
        """Fetch wind data from Open-Meteo API."""
        # Format timestamp for API
        forecast_date = timestamp.strftime("%Y-%m-%d")
        forecast_hour = timestamp.strftime("%H")
        
        # Build request URL
        url = f"{self.base_url}/forecast"
        params = {
            "latitude": latitude,
            "longitude": longitude,
            "hourly": f"wind_u_component_{pressure_level}hPa,wind_v_component_{pressure_level}hPa",
            "timezone": "UTC",
        }
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(url, params=params) as response:
                    if response.status == 200:
                        data = await response.json()
                        
                        # Extract wind components for requested time
                        hourly_data = data.get("hourly", {})
                        times = hourly_data.get("time", [])
                        u_component = hourly_data.get(f"wind_u_component_{pressure_level}hPa", [])
                        v_component = hourly_data.get(f"wind_v_component_{pressure_level}hPa", [])
                        
                        if times and u_component and v_component:
                            # Find closest time
                            target_time = timestamp.isoformat()
                            if target_time in times:
                                idx = times.index(target_time)
                                return {
                                    "u_component": u_component[idx],  # East-West (m/s)
                                    "v_component": v_component[idx],  # North-South (m/s)
                                    "timestamp": timestamp,
                                    "pressure_level": pressure_level,
                                }
                        
                        logger.warning("No wind data found for requested time")
                        return {"u_component": 0, "v_component": 0}
                    
                    else:
                        logger.error(f"Open-Meteo API error: {response.status}")
                        return {"u_component": 0, "v_component": 0}
        
        except aiohttp.ClientError as e:
            logger.error(f"API request failed: {str(e)}")
            return {"u_component": 0, "v_component": 0}
    
    def apply_wind_correction(
        self,
        route_segments: List,
        wind_data: Dict,
    ) -> List:
        """
        Apply wind-corrected distance calculation to route segments.
        
        Wind correction formula:
        - Effective GS = TAS ± wind_component (along track)
        - Distance remains same, but time/fuel efficiency varies
        
        For navigation fees (distance-based), the effect is minimal
        unless we're optimizing for time-cost trade-off.
        """
        # For most distance-based formulas, distance doesn't change
        # Wind affects fuel burn and time, not the base navigation fee
        
        # If we wanted to optimize by true airspeed and time:
        # - Calculate wind component along each segment
        # - Recalculate ETA
        # - This could affect en-route vs terminal time split
        
        u = wind_data.get("u_component", 0)
        v = wind_data.get("v_component", 0)
        
        # Wind magnitude (m/s)
        wind_magnitude_ms = (u**2 + v**2) ** 0.5
        wind_magnitude_kt = wind_magnitude_ms * 1.94384
        
        logger.info(f"Wind correction: {wind_magnitude_kt:.1f} knots")
        
        # For nav fees, distance-based formulas don't change
        # Return segments as-is (wind data logged for optimization)
        return route_segments
    
    @staticmethod
    def _altitude_to_pressure(altitude_ft: int) -> int:
        """
        Convert altitude to standard atmospheric pressure level.
        
        Standard flight levels:
        - FL250 ≈ 700 hPa
        - FL350 ≈ 580 hPa
        - FL450 ≈ 440 hPa
        """
        # Simplified approximation
        pressure_hpa = 1013.25 * (1 - 0.0065 * (altitude_ft * 0.3048) / 288.15) ** 5.255
        
        # Round to standard levels (25 hPa increments)
        standard_levels = [250, 300, 350, 400, 450, 500, 550, 600, 650, 700, 750, 800, 850, 900, 950, 1000]
        closest = min(standard_levels, key=lambda x: abs(x - pressure_hpa))
        
        return closest
