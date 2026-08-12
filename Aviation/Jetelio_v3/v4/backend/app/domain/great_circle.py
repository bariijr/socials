"""Great-circle geometry — pure functions, no FastAPI/SQLAlchemy imports.

Engine 1 (routing). distance uses the spherical law of cosines exactly as
specified: d = acos(sin phi1 sin phi2 + cos phi1 cos phi2 cos delta-lambda),
nm = d * EARTH_RADIUS_NM. Sampling uses great-circle slerp interpolation
(numerically stable for the short/medium legs this platform plans, unlike
naive repeated destination_point stepping which accumulates drift).
"""

import math
from dataclasses import dataclass

EARTH_RADIUS_NM = 3440.065


def _to_rad(deg: float) -> float:
    return math.radians(deg)


def great_circle_distance_nm(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """d = acos(sin phi1 sin phi2 + cos phi1 cos phi2 cos delta-lambda), nm = d * 3440.065."""
    phi1, phi2 = _to_rad(lat1), _to_rad(lat2)
    delta_lambda = _to_rad(lon2 - lon1)
    cos_d = math.sin(phi1) * math.sin(phi2) + math.cos(phi1) * math.cos(phi2) * math.cos(delta_lambda)
    # Clamp for float error at identical/antipodal points (acos domain is [-1, 1]).
    cos_d = max(-1.0, min(1.0, cos_d))
    return math.acos(cos_d) * EARTH_RADIUS_NM


def initial_bearing_deg(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Initial bearing (0-360, true) from point 1 to point 2."""
    phi1, phi2 = _to_rad(lat1), _to_rad(lat2)
    delta_lambda = _to_rad(lon2 - lon1)
    x = math.sin(delta_lambda) * math.cos(phi2)
    y = math.cos(phi1) * math.sin(phi2) - math.sin(phi1) * math.cos(phi2) * math.cos(delta_lambda)
    return math.degrees(math.atan2(x, y)) % 360.0


def destination_point(lat: float, lon: float, bearing_deg: float, distance_nm: float) -> tuple[float, float]:
    """Point reached travelling `distance_nm` along `bearing_deg` from (lat, lon)."""
    delta = distance_nm / EARTH_RADIUS_NM
    theta = _to_rad(bearing_deg)
    phi1, lambda1 = _to_rad(lat), _to_rad(lon)

    phi2 = math.asin(math.sin(phi1) * math.cos(delta) + math.cos(phi1) * math.sin(delta) * math.cos(theta))
    lambda2 = lambda1 + math.atan2(
        math.sin(theta) * math.sin(delta) * math.cos(phi1),
        math.cos(delta) - math.sin(phi1) * math.sin(phi2),
    )
    return math.degrees(phi2), (math.degrees(lambda2) + 540.0) % 360.0 - 180.0


def offset_point_lateral(lat: float, lon: float, track_bearing_deg: float, offset_nm: float) -> tuple[float, float]:
    """Point offset perpendicular to `track_bearing_deg` by `offset_nm`.

    Positive offset = right of track (bearing + 90), negative = left
    (bearing - 90). Used to build the re-route search corridor.
    """
    if offset_nm == 0:
        return lat, lon
    perpendicular = (track_bearing_deg + 90.0) % 360.0 if offset_nm > 0 else (track_bearing_deg - 90.0) % 360.0
    return destination_point(lat, lon, perpendicular, abs(offset_nm))


@dataclass(frozen=True)
class TrackPoint:
    lat: float
    lon: float
    cumulative_nm: float


def _intermediate_point(lat1: float, lon1: float, lat2: float, lon2: float, angular_delta: float, fraction: float) -> tuple[float, float]:
    """Great-circle slerp: the point a `fraction` of the way from 1 to 2,
    given the total angular distance `angular_delta` (radians) between them.
    """
    phi1, lambda1 = _to_rad(lat1), _to_rad(lon1)
    phi2, lambda2 = _to_rad(lat2), _to_rad(lon2)

    a = math.sin((1 - fraction) * angular_delta) / math.sin(angular_delta)
    b = math.sin(fraction * angular_delta) / math.sin(angular_delta)
    x = a * math.cos(phi1) * math.cos(lambda1) + b * math.cos(phi2) * math.cos(lambda2)
    y = a * math.cos(phi1) * math.sin(lambda1) + b * math.cos(phi2) * math.sin(lambda2)
    z = a * math.sin(phi1) + b * math.sin(phi2)

    phi_i = math.atan2(z, math.sqrt(x * x + y * y))
    lambda_i = math.atan2(y, x)
    return math.degrees(phi_i), math.degrees(lambda_i)


def sample_great_circle_track(
    dep_lat: float,
    dep_lon: float,
    arr_lat: float,
    arr_lon: float,
    *,
    interval_nm: float,
    min_points: int,
) -> list[TrackPoint]:
    """Adaptive sampling every `interval_nm`, with a floor of `min_points`
    total points (including departure and arrival) regardless of distance.
    """
    total_nm = great_circle_distance_nm(dep_lat, dep_lon, arr_lat, arr_lon)

    if total_nm == 0:
        return [TrackPoint(dep_lat, dep_lon, 0.0)]

    n_intervals = max(math.ceil(total_nm / interval_nm), min_points - 1, 1)
    angular_delta = total_nm / EARTH_RADIUS_NM

    points: list[TrackPoint] = []
    for i in range(n_intervals + 1):
        fraction = i / n_intervals
        if i == 0:
            lat, lon = dep_lat, dep_lon
        elif i == n_intervals:
            lat, lon = arr_lat, arr_lon
        else:
            lat, lon = _intermediate_point(dep_lat, dep_lon, arr_lat, arr_lon, angular_delta, fraction)
        points.append(TrackPoint(lat=lat, lon=lon, cumulative_nm=fraction * total_nm))
    return points


def compute_eet_hours(distance_nm: float, block_speed_kts: float, taxi_allowance_hours: float) -> float:
    """EET = nm / block_speed + taxi allowance (defaults 470 kts, 0.4h — both named settings)."""
    return distance_nm / block_speed_kts + taxi_allowance_hours
