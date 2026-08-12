import enum
from datetime import datetime

from sqlalchemy import DateTime, Enum, Float, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import StandardMixin


class TripStatus(str, enum.Enum):
    """The trip lifecycle. Cancelled is a terminal state reachable from
    Lead or Active, not a step in the happy path. Previously a 3-value
    ENQUIRY/CONFIRMED/CANCELLED enum — migrated ENQUIRY->LEAD,
    CONFIRMED->ACTIVE, CANCELLED->CANCELLED (see migration
    c3f8a1e5b9d2_trip_status_lifecycle.py)."""

    LEAD = "LEAD"
    ACTIVE = "ACTIVE"
    COMPLETED = "COMPLETED"
    CLOSED = "CLOSED"
    BILLED = "BILLED"
    CANCELLED = "CANCELLED"


class TripSource(str, enum.Enum):
    PUBLIC_FEASIBILITY_IQ = "PUBLIC_FEASIBILITY_IQ"
    INTERNAL = "INTERNAL"


class ServiceProvider(str, enum.Enum):
    JETELIO = "JETELIO"
    OWN = "OWN"
    THIRD_PARTY = "THIRD_PARTY"


class ServiceAssignmentStatus(str, enum.Enum):
    """Lives inside the service_assignments JSONB dict, same as
    ServiceProvider above — not a real DB column/Postgres enum, just a
    typed vocabulary for the schema layer. CONFIRMED is what populates
    granted_at (task #101) — see trip_service.update_service_assignment."""

    PENDING = "PENDING"
    SENT = "SENT"
    ACKNOWLEDGED = "ACKNOWLEDGED"
    CONFIRMED = "CONFIRMED"


class TripOpsType(str, enum.Enum):
    PRIVATE = "PRIVATE"
    MILITARY = "MILITARY"
    CHARTER = "CHARTER"
    CARGO = "CARGO"
    MEDEVAC = "MEDEVAC"
    OTHER = "OTHER"


class TripFlightPurpose(str, enum.Enum):
    BUSINESS = "BUSINESS"
    TOURISM = "TOURISM"
    FERRY = "FERRY"
    REPOSITION = "REPOSITION"
    OTHER = "OTHER"


class TripLegType(str, enum.Enum):
    PRIMARY = "PRIMARY"
    ALTERNATE = "ALTERNATE"


class TripLegStatus(str, enum.Enum):
    PENDING = "PENDING"
    CONFIRMED = "CONFIRMED"
    CANCELLED = "CANCELLED"
    COMPLETED = "COMPLETED"


class Trip(Base, StandardMixin):
    """Minimal pull-forward of the Trip Manager (Phase 4) data model — just
    enough to record a REQUEST QUOTE enquiry from the public Feasibility IQ
    form. Phase 4 builds the full console/register (tabs, no leg cap,
    RBAC, billing) on top of these same tables rather than a throwaway
    'enquiries' table.
    """

    __tablename__ = "trips"

    status: Mapped[TripStatus] = mapped_column(Enum(TripStatus, name="trip_status"), nullable=False, default=TripStatus.LEAD)
    source: Mapped[TripSource] = mapped_column(Enum(TripSource, name="trip_source"), nullable=False)
    # Free-text snapshot, not a FK — no Team/User-group model exists in this
    # schema yet. Same "display value, not a live reference" pattern as
    # operator_airline_name below.
    owner_team: Mapped[str | None] = mapped_column(String(200), nullable=True)

    requested_by_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    requested_by_email: Mapped[str | None] = mapped_column(String(300), nullable=True)
    requested_by_phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    notes: Mapped[str | None] = mapped_column(String(2000), nullable=True)

    # Every field below is a SNAPSHOT taken at trip-creation time, never a
    # live FK to Aircraft/Operator — if the real aircraft later changes
    # hands or its specs are corrected, an old trip must not silently
    # change with it. Per-leg TripLeg.registration can override this
    # default for a specific leg (e.g. an alternate flown on a different
    # tail); when neither resolves, TripLeg.call_sign is the authoritative
    # identifier for that leg.
    aircraft_registration: Mapped[str | None] = mapped_column(String(20), nullable=True)
    entered_mtow_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    serial_number: Mapped[str | None] = mapped_column(String(100), nullable=True)
    colors: Mapped[str | None] = mapped_column(String(200), nullable=True)
    # As typed on the public form or autofilled from the admin registration
    # lookup at creation time — never a live Operator FK, same snapshot
    # rationale as the rest of this block.
    operator_airline_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    ops_type: Mapped[TripOpsType | None] = mapped_column(Enum(TripOpsType, name="trip_ops_type"), nullable=True)
    flight_purpose: Mapped[TripFlightPurpose | None] = mapped_column(
        Enum(TripFlightPurpose, name="trip_flight_purpose"), nullable=True
    )

    # No FK to users.id — matches AuditLog.actor_user_id's existing pattern.
    created_by: Mapped[UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    updated_by: Mapped[UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)


class TripLeg(Base, StandardMixin):
    """The register (spec: "one row per leg, stored normalised"). persons
    is a JSONB snapshot ([{role, nationality_iso3}]) rather than a
    normalized table — Phase 5 (documents/crew records) formalizes person
    records once actual document data is collected; the public form never
    collects passport data at all, so there is nothing to normalize yet.
    computed_snapshot preserves the full engine output at request time so
    a permit list filed via an enquiry today reproduces exactly later,
    mirroring the reproducibility guarantee already established for
    route_cache (see rule_engine_version).
    """

    __tablename__ = "trip_legs"

    trip_id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("trips.id", ondelete="CASCADE"), nullable=False, index=True)
    leg_index: Mapped[int] = mapped_column(Integer, nullable=False)

    dep_icao: Mapped[str] = mapped_column(String(4), ForeignKey("airports.icao"), nullable=False)
    arr_icao: Mapped[str] = mapped_column(String(4), ForeignKey("airports.icao"), nullable=False)
    aircraft_icao_type: Mapped[str] = mapped_column(String(10), ForeignKey("aircraft_performance.icao_type"), nullable=False)
    # The resolved departure instant — always populated, even for a leg
    # driven off a required arrival time (see leg_feasibility_service).
    reference_datetime: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    # The resolved arrival instant (reference_datetime + EET) at compute
    # time — stored as a real, independently-editable column so crew can
    # pad/adjust it afterward (e.g. buffer time) without that override
    # feeding back into permit-deadline math, which always uses the
    # engine-computed instant, not this display value.
    arrival_datetime: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    call_sign: Mapped[str | None] = mapped_column(String(20), nullable=True)
    # Overrides Trip.aircraft_registration for this leg only (e.g. an
    # alternate flown on a different tail). When neither this nor the
    # trip-level default is set, call_sign is the authoritative identifier
    # — common on alternates where a tail hasn't been assigned yet.
    registration: Mapped[str | None] = mapped_column(String(20), nullable=True)
    leg_type: Mapped[TripLegType] = mapped_column(
        Enum(TripLegType, name="trip_leg_type"), nullable=False, default=TripLegType.PRIMARY
    )
    leg_status: Mapped[TripLegStatus] = mapped_column(
        Enum(TripLegStatus, name="trip_leg_status"), nullable=False, default=TripLegStatus.PENDING
    )
    # The bill-to account this specific leg is for — an operator has many
    # billing entities (see app.models.client.Client's docstring); a trip
    # and each individual leg may point at a different one.
    client_id: Mapped[UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("clients.id"), nullable=True)
    updated_by: Mapped[UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    # As typed by the dispatcher (e.g. "FAKN PKV UT915 VHA UL432 TUPIR B527
    # BJA L432 GAVDA GAVDA1B HRYR") — stored and displayed as-is on permit
    # paperwork/trip brief. Never parsed or geometrically resolved: there is
    # no licensed waypoint/airway database in this system, so overflown
    # countries/FIRs still come from Engine 1's great-circle approximation,
    # not from this string.
    filed_route: Mapped[str | None] = mapped_column(String(2000), nullable=True)

    persons: Mapped[list[dict]] = mapped_column(JSONB, nullable=False, default=list)
    # {avoid_states, include_states, avoid_firs, include_firs} as submitted —
    # computed_snapshot captures the violation *outcome*, this captures the
    # original request, so a re-verified enquiry reproduces the same ask.
    constraints: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    verdict: Mapped[str] = mapped_column(String(30), nullable=False)
    rule_engine_version: Mapped[str] = mapped_column(String(20), nullable=False)
    computed_snapshot: Mapped[dict] = mapped_column(JSONB, nullable=False)
    # {"{service_code}:{icao}": {"provider": "JETELIO"|"OWN"|"THIRD_PARTY",
    #  "vendor_id": str|None, "notes": str|None, "status":
    #  "PENDING"|"SENT"|"ACKNOWLEDGED"|"CONFIRMED", "confirmation_number":
    #  str|None, "granted_at": iso-datetime-str|None, "valid_until":
    #  iso-datetime-str|None}} — one entry per service line item in
    # computed_snapshot's service_requirements. JSONB rather than a new
    # table, matching this schema's minimal-pull-forward philosophy (see
    # the module docstring). status/confirmation_number/granted_at/
    # valid_until added task #101 — granted_at is set once, the first time
    # status transitions to CONFIRMED (never reset by later edits);
    # valid_until is computed from granted_at + the icao's country's
    # permit validity setting (app.domain.permits.compute_valid_until,
    # task #95) at that same moment, not recomputed live afterward.
    service_assignments: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
