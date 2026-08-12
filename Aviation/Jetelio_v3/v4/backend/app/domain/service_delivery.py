"""Scope-precedence resolution for service delivery / confirmation routing
configs (task #86) — pure functions, no FastAPI/SQLAlchemy imports, same
convention as every other domain module here. Precedence is leg > trip >
operator, exactly as specified by the user: a config scoped to the
specific leg being planned always wins over one scoped to the whole trip,
which always wins over one scoped to the whole operator.

Callers (app.services.service_delivery_service) are expected to have
already fetched every candidate row that could plausibly apply (same
leg_id, or same trip_id, or same operator_id) — this module only picks the
single best match out of whatever candidates it's handed; it does no
database work and knows nothing about SQLAlchemy models.
"""

from dataclasses import dataclass
from typing import Protocol, TypeVar


class _ScopedLike(Protocol):
    leg_id: str | None
    trip_id: str | None
    operator_id: str | None


T = TypeVar("T", bound=_ScopedLike)


@dataclass(frozen=True)
class ServiceDeliveryCandidate:
    id: str
    leg_id: str | None
    trip_id: str | None
    operator_id: str | None
    service_code: str | None  # None = applies to every service at this scope


@dataclass(frozen=True)
class ConfirmationRoutingCandidate:
    id: str
    leg_id: str | None
    trip_id: str | None
    operator_id: str | None


def _scope_rank(candidate: _ScopedLike) -> int:
    """0 = leg-scoped (most specific), 1 = trip-scoped, 2 = operator-scoped
    (least specific). A candidate with none of the three set is a caller
    bug, not something this function should silently accept — every config
    row must be scoped to exactly one of leg/trip/operator.
    """
    if candidate.leg_id is not None:
        return 0
    if candidate.trip_id is not None:
        return 1
    if candidate.operator_id is not None:
        return 2
    raise ValueError(f"Candidate {candidate!r} is scoped to none of leg/trip/operator")


def resolve_service_delivery_config(
    candidates: list[ServiceDeliveryCandidate], *, requested_service_code: str | None
) -> ServiceDeliveryCandidate | None:
    """Best match for a specific service on a specific leg. A row whose
    own service_code doesn't match the one being requested (and isn't the
    None/wildcard case) never applies, regardless of how specific its
    scope is — an operator-wide GROUND-HANDLING config should never beat a
    leg-specific FUEL config when resolving delivery for FUEL.
    """
    applicable = [c for c in candidates if c.service_code is None or c.service_code == requested_service_code]
    if not applicable:
        return None

    def _rank(c: ServiceDeliveryCandidate) -> tuple[int, int]:
        exact_service_match = 0 if c.service_code == requested_service_code else 1
        return (_scope_rank(c), exact_service_match)

    return min(applicable, key=_rank)


def resolve_confirmation_routing_config(candidates: list[ConfirmationRoutingCandidate]) -> ConfirmationRoutingCandidate | None:
    """Best match among candidates already filtered to one target_role by
    the caller (target_role is a hard match, not a specificity dimension —
    a CREW config and a DISPATCH config are never competing for the same
    slot, so it's resolved before this function is ever called).
    """
    if not candidates:
        return None
    return min(candidates, key=_scope_rank)
