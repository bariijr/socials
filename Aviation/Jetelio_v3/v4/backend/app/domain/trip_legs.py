"""Pure trip-leg sequencing rules — no FastAPI/SQLAlchemy imports."""

from dataclasses import dataclass
from datetime import datetime


@dataclass(frozen=True)
class LegOrderingCheck:
    leg_index: int
    departure: datetime
    arrival: datetime
    is_primary: bool


def validate_primary_leg_ordering(legs: list[LegOrderingCheck]) -> list[str]:
    """Primary legs must depart no earlier than the previous primary leg's
    arrival — an aircraft can't leave before it lands from the prior leg.
    Alternate legs (built to hold services in case of change, still billed)
    are exempt and never compared against.
    """
    violations: list[str] = []
    previous_primary: LegOrderingCheck | None = None
    for leg in sorted((leg for leg in legs if leg.is_primary), key=lambda leg: leg.leg_index):
        if previous_primary is not None and leg.departure < previous_primary.arrival:
            violations.append(
                f"Leg {leg.leg_index + 1} departs before leg {previous_primary.leg_index + 1} arrives — "
                "primary legs must be in chronological order (use an alternate leg instead)."
            )
        previous_primary = leg
    return violations
