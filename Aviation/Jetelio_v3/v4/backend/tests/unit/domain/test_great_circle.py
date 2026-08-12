import math

import pytest

from app.domain.great_circle import (
    EARTH_RADIUS_NM,
    compute_eet_hours,
    destination_point,
    great_circle_distance_nm,
    initial_bearing_deg,
    offset_point_lateral,
    sample_great_circle_track,
)

QUARTER_CIRCUMFERENCE_NM = (math.pi / 2) * EARTH_RADIUS_NM


class TestGreatCircleDistanceNm:
    def test_same_point_is_zero(self):
        assert great_circle_distance_nm(51.47, -0.4543, 51.47, -0.4543) == pytest.approx(0.0, abs=1e-9)

    def test_equatorial_quarter_circumference(self):
        assert great_circle_distance_nm(0, 0, 0, 90) == pytest.approx(QUARTER_CIRCUMFERENCE_NM, rel=1e-6)

    def test_pole_to_equator_quarter_circumference(self):
        assert great_circle_distance_nm(0, 0, 90, 0) == pytest.approx(QUARTER_CIRCUMFERENCE_NM, rel=1e-6)

    def test_jfk_to_lhr_matches_known_great_circle_distance(self):
        # JFK 40.6413N 73.7781W, LHR 51.4700N 0.4543W — published GC distance ~3005 NM.
        distance = great_circle_distance_nm(40.6413, -73.7781, 51.4700, -0.4543)
        assert distance == pytest.approx(3005, abs=25)

    def test_is_symmetric(self):
        a = great_circle_distance_nm(-1.3, 36.8, -25.9, 28.2)
        b = great_circle_distance_nm(-25.9, 28.2, -1.3, 36.8)
        assert a == pytest.approx(b, rel=1e-9)


class TestInitialBearingDeg:
    def test_due_east_along_equator(self):
        assert initial_bearing_deg(0, 0, 0, 90) == pytest.approx(90.0, abs=1e-6)

    def test_due_north_to_pole(self):
        assert initial_bearing_deg(0, 0, 90, 0) == pytest.approx(0.0, abs=1e-6)

    def test_due_south(self):
        assert initial_bearing_deg(10, 20, 0, 20) == pytest.approx(180.0, abs=1e-6)

    def test_always_in_0_360_range(self):
        bearing = initial_bearing_deg(10, 170, -10, -170)
        assert 0.0 <= bearing < 360.0


class TestDestinationPoint:
    def test_travelling_east_along_equator(self):
        lat, lon = destination_point(0, 0, 90, QUARTER_CIRCUMFERENCE_NM)
        assert lat == pytest.approx(0.0, abs=1e-6)
        assert lon == pytest.approx(90.0, abs=1e-6)

    def test_travelling_north_to_pole(self):
        lat, lon = destination_point(0, 0, 0, QUARTER_CIRCUMFERENCE_NM)
        assert lat == pytest.approx(90.0, abs=1e-6)

    def test_zero_distance_returns_same_point(self):
        lat, lon = destination_point(12.3, 45.6, 200, 0)
        assert lat == pytest.approx(12.3, abs=1e-9)
        assert lon == pytest.approx(45.6, abs=1e-9)

    def test_roundtrip_distance_matches(self):
        lat, lon = destination_point(-1.3, 36.8, 45, 500)
        assert great_circle_distance_nm(-1.3, 36.8, lat, lon) == pytest.approx(500, abs=0.5)


class TestOffsetPointLateral:
    def test_zero_offset_returns_same_point(self):
        lat, lon = offset_point_lateral(0, 0, 45, 0)
        assert (lat, lon) == (0, 0)

    def test_positive_offset_is_to_the_right_of_track(self):
        # Heading due north (bearing 0), a positive (right) offset goes east.
        lat, lon = offset_point_lateral(0, 0, 0, 100)
        assert lon > 0
        assert lat == pytest.approx(0.0, abs=0.1)

    def test_negative_offset_is_to_the_left_of_track(self):
        lat, lon = offset_point_lateral(0, 0, 0, -100)
        assert lon < 0

    def test_offset_magnitude_matches_distance(self):
        lat, lon = offset_point_lateral(10, 20, 90, 150)
        assert great_circle_distance_nm(10, 20, lat, lon) == pytest.approx(150, abs=0.5)


class TestSampleGreatCircleTrack:
    def test_enforces_min_points_floor_on_short_leg(self):
        points = sample_great_circle_track(0, 0, 0, 1, interval_nm=10, min_points=50)
        assert len(points) == 50

    def test_interval_driven_count_on_long_leg(self):
        points = sample_great_circle_track(0, 0, 0, 20, interval_nm=10, min_points=5)
        # ~1200 NM leg / 10 NM interval => ~120 intervals => 121 points, well above the floor.
        assert len(points) > 100

    def test_first_and_last_points_match_endpoints(self):
        points = sample_great_circle_track(10, 20, 30, 40, interval_nm=10, min_points=50)
        assert points[0].lat == pytest.approx(10, abs=1e-6)
        assert points[0].lon == pytest.approx(20, abs=1e-6)
        assert points[-1].lat == pytest.approx(30, abs=1e-6)
        assert points[-1].lon == pytest.approx(40, abs=1e-6)

    def test_cumulative_distance_is_monotonic_and_ends_at_total(self):
        total = great_circle_distance_nm(10, 20, 30, 40)
        points = sample_great_circle_track(10, 20, 30, 40, interval_nm=10, min_points=50)
        cumulative = [p.cumulative_nm for p in points]
        assert cumulative == sorted(cumulative)
        assert cumulative[-1] == pytest.approx(total, rel=1e-6)

    def test_identical_endpoints_returns_single_point(self):
        points = sample_great_circle_track(5, 5, 5, 5, interval_nm=10, min_points=50)
        assert len(points) == 1
        assert points[0].cumulative_nm == 0.0


class TestComputeEetHours:
    def test_default_settings(self):
        assert compute_eet_hours(2000, 470, 0.4) == pytest.approx(2000 / 470 + 0.4)

    def test_zero_distance_is_just_taxi_allowance(self):
        assert compute_eet_hours(0, 470, 0.4) == pytest.approx(0.4)
