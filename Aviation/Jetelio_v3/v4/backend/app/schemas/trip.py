from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.trip import (
    ServiceAssignmentStatus,
    TripFlightPurpose,
    TripLegStatus,
    TripLegType,
    TripOpsType,
    TripStatus,
)
from app.schemas.feasibility import LegCheckIn, LegResultOut, PersonPublicIn


class TripLegIn(LegCheckIn):
    """LegCheckIn plus admin-only fields never exposed on the public
    Feasibility IQ door: client_id (which of an operator's billing
    entities this leg is for), a per-leg registration override, leg
    type/status, and an arrival-time display override.
    """

    client_id: str | None = None
    # Overrides Trip.aircraft_registration for this leg only — common on
    # alternates flown on a different, not-yet-confirmed tail.
    registration: str | None = None
    leg_type: TripLegType = TripLegType.PRIMARY
    leg_status: TripLegStatus = TripLegStatus.PENDING
    # Cosmetic only — never fed back into permit/deadline computation,
    # which always uses the engine-computed arrival. Lets crew pad/adjust
    # the displayed arrival after the fact. Defaults to the computed value
    # when not given.
    arrival_datetime_override: datetime | None = None


class TripCreateIn(BaseModel):
    aircraft_icao_type: str
    aircraft_registration: str | None = None
    # Always stored in kg — a kg/lb toggle is a display-only frontend
    # concern. Reference/display only for now: capability and nav-fee
    # computation still use AircraftPerformance.mtow_kg for the type: this
    # doesn't override that (see app.services.leg_feasibility_service).
    entered_mtow_kg: float | None = None
    serial_number: str | None = None
    colors: str | None = None
    operator_airline_name: str | None = None
    ops_type: TripOpsType | None = None
    flight_purpose: TripFlightPurpose | None = None
    persons: list[PersonPublicIn] = Field(default_factory=list)
    legs: list[TripLegIn] = Field(min_length=1)  # no leg cap for internal trips
    requested_by_name: str | None = None
    requested_by_email: str | None = None
    requested_by_phone: str | None = None
    notes: str | None = None
    owner_team: str | None = None


class TripUpdateIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version: int
    status: TripStatus | None = None
    notes: str | None = None
    requested_by_name: str | None = None
    requested_by_email: str | None = None
    requested_by_phone: str | None = None
    aircraft_registration: str | None = None
    entered_mtow_kg: float | None = None
    operator_airline_name: str | None = None
    serial_number: str | None = None
    colors: str | None = None
    ops_type: TripOpsType | None = None
    flight_purpose: TripFlightPurpose | None = None
    owner_team: str | None = None


class NavFeeLineItemOut(BaseModel):
    fir_code: str
    fir_name: str | None
    provider_name: str | None
    formula: str | None
    distance_nm: float
    chargeable_distance_nm: float | None
    fee_usd: float | None
    status: str
    currency: str | None


class NavFeesDetailOut(BaseModel):
    """Trip-Manager-only: the itemized per-FIR breakdown behind the total
    already shown on the public Feasibility IQ door (LegResultOut.nav_fees)
    — this is the client-shareable quote/estimate. A FIR with no configured
    NavFeeProvider gets fee_usd=None, never a guessed number; subtotal/
    margin/total stay None until fully_priced is true.
    """

    fully_priced: bool
    items: list[NavFeeLineItemOut]
    subtotal_usd: float | None
    margin_percent: float
    margin_usd: float | None
    total_usd: float | None


class PermitFeeLineItemOut(BaseModel):
    country_iso3: str
    country_name: str
    permit_type: str
    caa_fee_usd: float | None
    caa_status: str
    nafisat_fee_usd: float | None
    nafisat_status: str
    jtl_fee_usd: float
    line_total_usd: float | None


class PermitFeesDetailOut(BaseModel):
    """Trip-Manager-only: the itemized per-(country, permit type) breakdown
    behind the total already shown on the public Viability IQ door
    (LegResultOut.permit_fees) — CAA fees + nafisat + the flat JTL service
    fee, per permit line item. A line item with no configured CAA_FEE or
    NAFISAT provider gets that component as None, never a guessed number;
    subtotal/total stay None until fully_priced is true.
    """

    fully_priced: bool
    items: list[PermitFeeLineItemOut]
    caa_subtotal_usd: float | None
    nafisat_subtotal_usd: float | None
    jtl_subtotal_usd: float
    total_usd: float | None


class ClientLookupOut(BaseModel):
    id: str
    source_ref: str | None
    bill_to_legal_name: str


class AircraftLookupOut(BaseModel):
    """Admin-only (Trip Manager) — never exposed on the public Feasibility
    IQ door, which would otherwise leak one operator's fleet/contact
    details to anyone who types their tail number. See
    app.api.routers.trips.lookup_aircraft.
    """

    registration: str
    icao_type: str
    mtow_kg: float | None
    operator_id: str
    operator_name: str | None
    clients: list[ClientLookupOut]


class ServiceAssignmentIn(BaseModel):
    provider: str = Field(pattern="^(JETELIO|OWN|THIRD_PARTY)$")
    vendor_id: str | None = None
    notes: str | None = None
    status: ServiceAssignmentStatus = ServiceAssignmentStatus.PENDING
    # Typed by the admin once a vendor/CAA replies with one — never
    # fabricated. granted_at/valid_until are server-computed, not
    # accepted here (see trip_service.update_service_assignment).
    confirmation_number: str | None = None


class ServiceAssignmentOut(BaseModel):
    service_code: str
    icao: str
    service_name: str | None = None
    provider: str | None
    vendor_id: str | None
    notes: str | None
    status: str
    confirmation_number: str | None
    granted_at: datetime | None
    valid_until: datetime | None
    # True for a line item an admin added beyond what the engine generated
    # from service_requirements — task #105's "choose to add more
    # sub-services" (e.g. a GH sub-service like crew/pax transport, GPU,
    # or any other catalogue entry) alongside every auto-generated one.
    manual: bool = False


class CustomServiceAssignmentIn(BaseModel):
    service_code: str
    icao: str


class TripLegDetailOut(BaseModel):
    id: str
    leg_index: int
    reference_datetime: datetime
    arrival_datetime: datetime
    call_sign: str | None
    registration: str | None
    aircraft_icao_type: str
    leg_type: str
    leg_status: str
    client: ClientLookupOut | None
    updated_by: str | None
    result: LegResultOut
    nav_fees: NavFeesDetailOut | None
    permit_fees: PermitFeesDetailOut | None
    service_assignments: list[ServiceAssignmentOut]


class TripOut(BaseModel):
    id: str
    status: str
    source: str
    aircraft_registration: str | None
    operator_airline_name: str | None
    ops_type: str | None
    flight_purpose: str | None
    requested_by_name: str | None
    requested_by_email: str | None
    owner_team: str | None
    created_at: datetime
    # First leg's departure / last leg's arrival (by leg_index) — the
    # trip's overall span, not individual leg times. None when a trip
    # somehow has no legs.
    start_date: datetime | None
    end_date: datetime | None
    leg_count: int
    overall_verdict: str
    version: int


class TripDetailOut(BaseModel):
    id: str
    status: str
    source: str
    aircraft_registration: str | None
    entered_mtow_kg: float | None
    serial_number: str | None
    colors: str | None
    operator_airline_name: str | None
    ops_type: str | None
    flight_purpose: str | None
    requested_by_name: str | None
    requested_by_email: str | None
    requested_by_phone: str | None
    notes: str | None
    owner_team: str | None
    created_at: datetime
    version: int
    overall_verdict: str
    next_deadline: datetime | None
    created_by: str | None
    updated_by: str | None
    legs: list[TripLegDetailOut]
