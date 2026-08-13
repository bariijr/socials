from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, model_validator


class AirportLookupOut(BaseModel):
    icao: str
    iata: str | None
    name: str
    city: str | None
    country_name: str | None


class AircraftTypeLookupOut(BaseModel):
    model_config = {"protected_namespaces": ()}

    icao_type: str
    manufacturer: str | None
    model_series: str | None


class PublicAircraftLookupOut(BaseModel):
    """Public-safe registration autofill for the VIQ door — deliberately a
    much narrower projection than app.schemas.trip.AircraftLookupOut
    (admin-only), which additionally exposes operator_id/operator_name and
    that operator's billing clients. Registration + type + MTOW is
    performance data a requester filling in their own trip already knows;
    operator/contact/client data is not, and exposing it here would let
    anyone type a real tail number and learn who operates it — the exact
    leak AircraftLookupOut's own docstring says never to allow publicly.
    """

    model_config = {"protected_namespaces": ()}

    registration: str
    icao_type: str
    mtow_kg: float | None


class CountryLookupOut(BaseModel):
    iso3: str
    name: str


class FirLookupOut(BaseModel):
    icao_fir_code: str
    name: str


class PersonPublicIn(BaseModel):
    # Task #120: role is validated against real, admin-editable
    # person_role_definitions rows at the service layer (see
    # app.services.person_role_service.validate_active_code /
    # get_crew_bucket_map) rather than a fixed Pydantic regex — an admin
    # can add a new role (e.g. "Loadmaster") without a code change. Was
    # "^(PIC|FO|FA|MECHANIC|ENGINEER|CREW|PAX|VIP|PRINCIPAL|OTHER)$" (task
    # #107) before this.
    role: str = Field(max_length=30)
    nationality_iso3: str = Field(min_length=3, max_length=3)
    # Optional — when given, lets a permit/handling-request message name
    # the PIC ("CAPTAIN NICHOLAS FREEMAN") instead of a bare headcount.
    # Never fabricated when absent.
    name: str | None = None


class LegCheckIn(BaseModel):
    dep_icao: str = Field(min_length=3, max_length=4)
    arr_icao: str = Field(min_length=3, max_length=4)
    call_sign: str | None = Field(default=None, max_length=20)
    # Exactly one of these two drives the plan. reference_datetime
    # (departure) is used directly if given; otherwise it's back-calculated
    # from required_arrival_datetime once the route's EET is known (see
    # app.services.leg_feasibility_service.compute_leg_feasibility) — a
    # dispatcher who knows "must land by X" rather than "departing at Y".
    reference_datetime: datetime | None = None
    required_arrival_datetime: datetime | None = None
    # Cosmetic only (task #116) — never fed back into permit/deadline
    # computation, which always uses the engine-computed arrival
    # (reference_datetime + EET). Lets a dispatcher/crew pad or adjust the
    # displayed arrival after the fact, on both the public Viability IQ
    # form and the admin Trip Manager (this field lives on the shared base
    # so both get it identically — was admin-only before task #116).
    arrival_datetime_override: datetime | None = None
    avoid_states: list[str] = Field(default_factory=list)
    include_states: list[str] = Field(default_factory=list)
    avoid_firs: list[str] = Field(default_factory=list)
    include_firs: list[str] = Field(default_factory=list)
    # As typed by the dispatcher, e.g. "FAKN PKV UT915 VHA UL432 TUPIR B527
    # BJA L432 GAVDA GAVDA1B HRYR" — stored and shown as-is on permit
    # paperwork. Never parsed or geometrically resolved (no licensed
    # waypoint/airway database); overflown countries/FIRs still come from
    # the great-circle approximation below, not from this string.
    filed_route: str | None = Field(default=None, max_length=2000)

    @model_validator(mode="after")
    def _exactly_one_time_driver(self) -> "LegCheckIn":
        has_dep = self.reference_datetime is not None
        has_arr = self.required_arrival_datetime is not None
        if has_dep == has_arr:
            raise ValueError("Provide exactly one of reference_datetime or required_arrival_datetime, not both/neither.")
        return self


class FeasibilityCheckIn(BaseModel):
    aircraft_icao_type: str
    # Free text on the public door — never DB-linked here (only the admin
    # Trip Manager autofills from a registration; see AircraftLookupOut).
    aircraft_registration: str | None = None
    entered_mtow_kg: float | None = None
    operator_airline_name: str | None = None
    persons: list[PersonPublicIn] = Field(default_factory=list)
    legs: list[LegCheckIn] = Field(min_length=1, max_length=8)


class StateOut(BaseModel):
    iso3: str
    name: str


class FirOut(BaseModel):
    icao_fir_code: str
    name: str | None


class RouteOut(BaseModel):
    distance_nm: float
    eet_hours: float
    states: list[StateOut]
    firs: list[FirOut]


class ReroutePreviewOut(BaseModel):
    found: bool
    extra_distance_nm: float | None
    extra_time_hours: float | None
    track_points: list[tuple[float, float]]
    states: list[StateOut]
    firs: list[FirOut]


class WorldOutlineOut(BaseModel):
    countries: dict[str, dict]


class RoutePreviewOut(BaseModel):
    distance_nm: float
    eet_hours: float
    states: list[StateOut]
    firs: list[FirOut]
    track_points: list[tuple[float, float]]
    state_geometry: dict[str, dict]
    fir_geometry: dict[str, dict]
    # Only populated when the caller supplied avoid/include constraints AND
    # the direct route above actually violates one of them — the map's
    # "does the trajectory change" question, answered with a real alternate
    # track rather than just a distance/time delta (see RerouteOut in this
    # same module, which stays delta-only for the frozen trip snapshot).
    avoid_include_violated: bool = False
    reroute: ReroutePreviewOut | None = None


class PermitDeadlineOut(BaseModel):
    file_by: datetime
    deadline_status: str
    lead_time_hours: float
    lead_time_is_fallback: bool


class OverflightPermitOut(BaseModel):
    country_iso3: str
    country_name: str
    entry_datetime: datetime
    exit_datetime: datetime
    deadline: PermitDeadlineOut
    # Added task #115 (permit filing). Default None, not required — old
    # computed_snapshot rows predating this field must still validate (see
    # Prompt.md §10.2's forward-compatibility pattern); a historical leg
    # just won't show a send action for this permit line.
    service_code: str | None = None


class LandingPermitOut(BaseModel):
    country_iso3: str
    country_name: str
    entry_datetime: datetime
    exit_datetime: datetime
    deadline: PermitDeadlineOut
    service_code: str | None = None


class GroundHandlingOrderOut(BaseModel):
    country_iso3: str
    country_name: str
    earliest_icao: str
    earliest_event_at: datetime
    deadline: PermitDeadlineOut


class ServiceRequirementOut(BaseModel):
    service_code: str
    service_name: str
    scope: str
    icao: str
    country_iso3: str


class AvoidIncludeOut(BaseModel):
    violated: bool
    avoided_transited: list[str]
    required_missed: list[str]


class PermitsOut(BaseModel):
    overflight_permits: list[OverflightPermitOut]
    landing_permits: list[LandingPermitOut]
    ground_handling_orders: list[GroundHandlingOrderOut]
    service_requirements: list[ServiceRequirementOut]
    state_avoid_include: AvoidIncludeOut
    fir_avoid_include: AvoidIncludeOut


class TechStopSuggestionOut(BaseModel):
    icao: str
    name: str | None
    leg1_distance_nm: float
    leg2_distance_nm: float
    added_distance_nm: float


class CapabilityOut(BaseModel):
    planning_status: str
    max_range_nm: float | None
    practical_range_nm: float | None
    exceeds: bool | None
    margin_nm: float | None
    margin_tight: bool
    tech_stop_suggestions: list[TechStopSuggestionOut]


class PersonVisaOut(BaseModel):
    person_id: str
    role: str
    nationality_iso3: str
    visa_requirement: str
    visa_answered_by_layer: str


class CredentialsOut(BaseModel):
    persons: list[PersonVisaOut]
    souls_on_board_total: int
    souls_on_board_exceeds_max_pax: bool


class RerouteOut(BaseModel):
    found: bool
    extra_distance_nm: float | None
    extra_time_hours: float | None
    extra_fuel_kg: float | None


class NavFeesSummaryOut(BaseModel):
    """Total only — no per-FIR/provider breakdown. That itemization is
    Trip-Manager-only (app.schemas.trip.NavFeesDetailOut); this shared
    shape is what the public Feasibility IQ door is allowed to show.

    Numeric fields are None (never a guessed number) until fully_priced —
    every crossed FIR needs a real, admin-entered NavFeeProvider rate.
    """

    fully_priced: bool
    subtotal_usd: float | None
    margin_percent: float
    margin_usd: float | None
    total_usd: float | None


class PermitFeesSummaryOut(BaseModel):
    """Total only — no per-country/category breakdown. That itemization is
    Trip-Manager-only (app.schemas.trip.PermitFeesDetailOut); this shared
    shape is what the public Viability IQ door is allowed to show. Covers
    CAA permit-filing fees + nafisat + the flat JTL service fee — a
    separate cost dimension from nav_fees above (see
    app.services.permit_fee_service's module docstring for why the two
    aren't merged into one number).

    Numeric fields are None (never a guessed number) until fully_priced —
    every permit line item needs real, admin-entered CAA_FEE and NAFISAT
    provider rates.
    """

    fully_priced: bool
    caa_subtotal_usd: float | None
    nafisat_subtotal_usd: float | None
    jtl_subtotal_usd: float
    total_usd: float | None


class LegResultOut(BaseModel):
    dep_icao: str
    arr_icao: str
    call_sign: str | None = None
    # Always the resolved departure/arrival instants, regardless of which
    # one the caller originally drove the plan off (see LegCheckIn).
    reference_datetime: datetime
    arrival_datetime: datetime
    filed_route: str | None
    route: RouteOut
    permits: PermitsOut
    capability: CapabilityOut
    credentials: CredentialsOut
    reroute: RerouteOut | None
    nav_fees: NavFeesSummaryOut | None
    # Both default so a Trip's frozen computed_snapshot (see
    # trip_service._leg_out) — taken before this field existed — still
    # validates on read instead of 500ing forever; a fresh computation
    # always populates them for real.
    permit_fees: PermitFeesSummaryOut | None = None
    verdict: str
    # Plain-English explanations behind `verdict` — capability shortfalls,
    # avoid/include conflicts, urgent permit deadlines — so an operator
    # (public or Trip Manager) sees *why*, not just the verdict word. Never
    # empty on a fresh computation: a clean leg gets one affirmative "no
    # issues" reason. Defaults to [] only for pre-existing frozen snapshots
    # that predate this field.
    reasons: list[str] = Field(default_factory=list)


class FeasibilityCheckOut(BaseModel):
    check_id: str
    legs: list[LegResultOut]
    overall_verdict: str


class RequestQuoteIn(BaseModel):
    check_id: str
    contact_name: str
    contact_email: EmailStr
    contact_phone: str | None = None
    notes: str | None = None


class RequestQuoteOut(BaseModel):
    trip_id: str
    status: str


class ChatParseIn(BaseModel):
    message: str = Field(min_length=1, max_length=4000)


class ResolvedAirportOut(BaseModel):
    query: str
    icao: str | None
    name: str | None


class ResolvedCountryOut(BaseModel):
    query: str
    iso3: str | None
    name: str | None


class ResolvedAircraftTypeOut(BaseModel):
    model_config = {"protected_namespaces": ()}

    query: str
    icao_type: str | None
    name: str | None


class ChatLegDraftOut(BaseModel):
    departure: ResolvedAirportOut
    arrival: ResolvedAirportOut
    departure_date: str | None
    departure_time_utc: str | None
    avoid_countries: list[ResolvedCountryOut]
    include_countries: list[ResolvedCountryOut]


class ChatTripDraftOut(BaseModel):
    aircraft_registration: str | None
    aircraft_type: ResolvedAircraftTypeOut | None
    operator_name: str | None
    crew_count: int | None
    pax_count: int | None
    legs: list[ChatLegDraftOut]
    # Human-readable notes about anything that didn't confidently resolve —
    # the frontend surfaces these so the user knows exactly what to
    # double-check before submitting.
    warnings: list[str]
