import pytest
from pydantic import ValidationError

from app.schemas.feasibility import LegCheckIn

_BASE = dict(dep_icao="KJFK", arr_icao="EGLL")


class TestLegCheckInTimeDriver:
    def test_reference_datetime_only_is_valid(self):
        LegCheckIn(**_BASE, reference_datetime="2026-09-01T08:00:00Z")

    def test_required_arrival_datetime_only_is_valid(self):
        LegCheckIn(**_BASE, required_arrival_datetime="2026-09-01T08:00:00Z")

    def test_neither_given_is_rejected(self):
        with pytest.raises(ValidationError):
            LegCheckIn(**_BASE)

    def test_both_given_is_rejected(self):
        with pytest.raises(ValidationError):
            LegCheckIn(
                **_BASE, reference_datetime="2026-09-01T08:00:00Z", required_arrival_datetime="2026-09-01T12:00:00Z"
            )
