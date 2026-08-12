export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export interface GateStatus {
  key: string;
  label: string;
  verified: number;
  required: number;
  status: string;
  evidence_columns: string;
}

export interface PilotExitReport {
  gates: GateStatus[];
  blocked_gate_count: number;
  total_gate_count: number;
  verdict: "PILOT" | "LIVE";
  allow_unverified_for_planning: boolean;
}

export interface ImportSheetResult {
  sheet: string;
  rows_seen: number;
  rows_loaded: number;
  rows_skipped: number;
  rows_quarantined: number;
  notes: string[];
}

export interface ImportReport {
  started_at: string;
  finished_at: string;
  source_file: string;
  sheets: ImportSheetResult[];
  readiness: ReadinessRow[];
  overall_percent_complete: number;
  pilot_exit: PilotExitReport;
}

export interface ReadinessRow {
  dataset: string;
  populated: number;
  total: number;
  percent_complete: number;
  criticality: string;
  blocks: string;
}

export interface Country {
  iso3: string;
  iso2: string;
  name: string;
  region: string | null;
  reference_status: string;
  // Raw stored value — null unless an admin has actually entered one. Never
  // conflate with effective_lead_time_hours below, which is the *computed*
  // value (falls back to a named setting when this is null) — editing must
  // always read/write this raw field, not the fallback-blended one.
  standard_lead_time_hours: number | null;
  effective_lead_time_hours: number;
  effective_lead_time_is_fallback: boolean;
  // Distinct from lead time above: how long a GRANTED permit stays valid,
  // not how far in advance it must be filed. Same raw-vs-effective split.
  permit_validity_amount: number | null;
  permit_validity_unit: "HOURS" | "DAYS" | "WEEKS" | "MONTHS" | null;
  effective_permit_validity_amount: number;
  effective_permit_validity_unit: "HOURS" | "DAYS" | "WEEKS" | "MONTHS";
  effective_permit_validity_is_fallback: boolean;
  overflight_permit_required: boolean;
  landing_permit_required: boolean;
  ground_handling_policy: string;
  version: number;
}

export interface Airport {
  icao: string;
  iata: string | null;
  name: string;
  city: string | null;
  country_iso3: string;
  lat: number;
  lon: number;
  tech_stop_readiness: string;
  version: number;
}

export interface Operator {
  id: string;
  name: string | null;
  status: string;
  quarantined: boolean;
  quarantine_reason: string | null;
  assignable_status: string;
  version: number;
}

export interface OperatorDetail extends Operator {
  aoc_number: string | null;
  icao_designator: string | null;
  iata_designator: string | null;
  home_base_icao: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  occ_email: string | null;
  billing_email: string | null;
  currency: string | null;
  tax_id: string | null;
  credit_limit_minor_units: number | null;
  source_ref: string | null;
  created_at: string;
  updated_at: string;
}

export type AircraftStatus = "ACTIVE" | "GROUNDED" | "ARCHIVED";

export interface AircraftRecord {
  id: string;
  registration: string;
  icao_type: string;
  manufacturer: string | null;
  model_series: string | null;
  serial_number: string | null;
  colors: string | null;
  nationality_iso3: string | null;
  default_callsign: string | null;
  home_base_icao: string | null;
  mtow_kg: number | null;
  max_pax: number | null;
  operator_id: string;
  cofa_expiry: string | null;
  insurance_expiry: string | null;
  total_hours: number | null;
  total_landings: number | null;
  status: AircraftStatus;
  version: number;
  created_at: string;
  updated_at: string;
  quarantined: boolean;
  quarantine_reason: string | null;
}

export interface AircraftCreateRequest {
  registration: string;
  icao_type: string;
  manufacturer?: string | null;
  model_series?: string | null;
  serial_number?: string | null;
  colors?: string | null;
  nationality_iso3?: string | null;
  default_callsign?: string | null;
  home_base_icao?: string | null;
  mtow_kg?: number | null;
  max_pax?: number | null;
  operator_id: string;
  cofa_expiry?: string | null;
  insurance_expiry?: string | null;
  total_hours?: number | null;
  total_landings?: number | null;
  status?: AircraftStatus;
}

export interface AircraftUpdateRequest {
  version: number;
  registration?: string;
  icao_type?: string;
  manufacturer?: string | null;
  model_series?: string | null;
  serial_number?: string | null;
  colors?: string | null;
  nationality_iso3?: string | null;
  default_callsign?: string | null;
  home_base_icao?: string | null;
  mtow_kg?: number | null;
  max_pax?: number | null;
  cofa_expiry?: string | null;
  insurance_expiry?: string | null;
  total_hours?: number | null;
  total_landings?: number | null;
  status?: AircraftStatus;
}

export type AircraftDocumentType =
  | "REGISTRATION"
  | "COFA"
  | "INSURANCE"
  | "AIRWORTHINESS"
  | "NOISE_CERTIFICATE"
  | "OTHER";

export interface AircraftDocumentRecord {
  id: string;
  aircraft_id: string;
  doc_type: AircraftDocumentType;
  filename: string;
  content_type: string | null;
  file_size_bytes: number | null;
  expiry_date: string | null;
  uploaded_by: string | null;
  created_at: string;
}

export interface AircraftPerformanceItem {
  icao_type: string;
  manufacturer: string | null;
  model_series: string | null;
  max_range_nm: number | null;
  planning_status: string;
  practical_range_nm: number | null;
  verified: boolean;
  version: number;
}

export interface Vendor {
  id: string;
  name: string;
  billing_ref: string;
  source_ref: string | null;
  service_scope: string[] | null;
  capability_status: string;
  preference_rank: number | null;
  approved_by: string | null;
  approved_on: string | null;
  questionnaire_sent_on: string | null;
  questionnaire_returned_on: string | null;
  version: number;
}

// --- Feasibility IQ (public) ---

export interface AirportLookup {
  icao: string;
  iata: string | null;
  name: string;
  city: string | null;
  country_name: string | null;
}

export interface AircraftTypeLookup {
  icao_type: string;
  manufacturer: string | null;
  model_series: string | null;
}

export interface CountryLookup {
  iso3: string;
  name: string;
}

export interface FirLookup {
  icao_fir_code: string;
  name: string;
}

export type PersonRole = "PIC" | "FO" | "FA" | "MECHANIC" | "ENGINEER" | "CREW" | "PAX" | "VIP" | "PRINCIPAL" | "OTHER";

export interface PersonPublicInput {
  role: PersonRole;
  nationality_iso3: string;
}

export type TripLegType = "PRIMARY" | "ALTERNATE";
export type TripLegStatus = "PENDING" | "CONFIRMED" | "CANCELLED" | "COMPLETED";
export type TripOpsType = "PRIVATE" | "MILITARY" | "CHARTER" | "CARGO" | "MEDEVAC" | "OTHER";
export type TripFlightPurpose = "BUSINESS" | "TOURISM" | "FERRY" | "REPOSITION" | "OTHER";
export type TripStatus = "LEAD" | "ACTIVE" | "COMPLETED" | "CLOSED" | "BILLED" | "CANCELLED";
export const TRIP_STATUSES: TripStatus[] = ["LEAD", "ACTIVE", "COMPLETED", "CLOSED", "BILLED", "CANCELLED"];

export interface LegInput {
  dep_icao: string;
  arr_icao: string;
  call_sign?: string | null;
  // Exactly one of these two must be set — the other is back-calculated
  // server-side once the route's EET is known. See LegEditor's time-driver
  // toggle.
  reference_datetime?: string | null;
  required_arrival_datetime?: string | null;
  avoid_states: string[];
  include_states: string[];
  avoid_firs: string[];
  include_firs: string[];
  // As typed by the dispatcher, e.g. "FAKN PKV UT915 VHA UL432 TUPIR B527
  // BJA L432 GAVDA GAVDA1B HRYR" — stored and shown as-is on permit
  // paperwork. Never parsed/resolved geometrically.
  filed_route?: string | null;
  // Admin (Trip Manager) only — never sent from the public form.
  client_id?: string | null;
  // Overrides the trip-level default registration for this leg only.
  registration?: string | null;
  leg_type?: TripLegType;
  leg_status?: TripLegStatus;
  // Cosmetic override of the computed arrival display only — never fed
  // back into permit/deadline computation.
  arrival_datetime_override?: string | null;
}

export interface FeasibilityCheckRequest {
  aircraft_icao_type: string;
  aircraft_registration?: string;
  entered_mtow_kg?: number;
  operator_airline_name?: string;
  persons: PersonPublicInput[];
  legs: LegInput[];
}

export interface StateName {
  iso3: string;
  name: string;
}

export interface FirName {
  icao_fir_code: string;
  name: string | null;
}

export interface RouteResult {
  distance_nm: number;
  eet_hours: number;
  states: StateName[];
  firs: FirName[];
}

export interface PermitDeadline {
  file_by: string;
  deadline_status: string;
  lead_time_hours: number;
  lead_time_is_fallback: boolean;
}

export interface OverflightPermit {
  country_iso3: string;
  country_name: string;
  entry_datetime: string;
  exit_datetime: string;
  deadline: PermitDeadline;
}

export interface LandingPermit {
  country_iso3: string;
  country_name: string;
  entry_datetime: string;
  exit_datetime: string;
  deadline: PermitDeadline;
}

export interface GroundHandlingOrder {
  country_iso3: string;
  country_name: string;
  earliest_icao: string;
  earliest_event_at: string;
  deadline: PermitDeadline;
}

export interface ServiceRequirement {
  service_code: string;
  service_name: string;
  scope: string;
  icao: string;
  country_iso3: string;
}

export interface AvoidIncludeResult {
  violated: boolean;
  avoided_transited: string[];
  required_missed: string[];
}

export interface PermitsResult {
  overflight_permits: OverflightPermit[];
  landing_permits: LandingPermit[];
  ground_handling_orders: GroundHandlingOrder[];
  service_requirements: ServiceRequirement[];
  state_avoid_include: AvoidIncludeResult;
  fir_avoid_include: AvoidIncludeResult;
}

export interface TechStopSuggestion {
  icao: string;
  name: string | null;
  leg1_distance_nm: number;
  leg2_distance_nm: number;
  added_distance_nm: number;
}

export interface CapabilityResult {
  planning_status: string;
  max_range_nm: number | null;
  practical_range_nm: number | null;
  exceeds: boolean | null;
  margin_nm: number | null;
  margin_tight: boolean;
  tech_stop_suggestions: TechStopSuggestion[];
}

export interface PersonVisaResult {
  person_id: string;
  role: PersonRole;
  nationality_iso3: string;
  visa_requirement: string;
  visa_answered_by_layer: string;
}

export interface CredentialsResult {
  persons: PersonVisaResult[];
  souls_on_board_total: number;
  souls_on_board_exceeds_max_pax: boolean;
}

export interface RerouteResult {
  found: boolean;
  extra_distance_nm: number | null;
  extra_time_hours: number | null;
  extra_fuel_kg: number | null;
}

// Total only — no per-FIR/provider breakdown. Shown on both the public
// Feasibility IQ door and Trip Manager; the itemized quote (NavFeesDetail)
// is Trip-Manager-only, see below. Numeric fields are null (never a
// guessed number) until fully_priced — every crossed FIR needs a real,
// admin-entered rate.
export interface NavFeesSummary {
  fully_priced: boolean;
  subtotal_usd: number | null;
  margin_percent: number;
  margin_usd: number | null;
  total_usd: number | null;
}

// Total only — no per-country/category breakdown. CAA permit-filing fees +
// nafisat + the flat JTL service fee — a separate cost dimension from
// NavFeesSummary above (nav fees are keyed by FIR/distance; these are keyed
// by country + permit type, billed per permit line item). Numeric fields
// are null until fully_priced — every permit line item needs real,
// admin-entered CAA_FEE and NAFISAT provider rates.
export interface PermitFeesSummary {
  fully_priced: boolean;
  caa_subtotal_usd: number | null;
  nafisat_subtotal_usd: number | null;
  jtl_subtotal_usd: number;
  total_usd: number | null;
}

export interface LegResult {
  dep_icao: string;
  arr_icao: string;
  call_sign: string | null;
  // Always the resolved instants, regardless of which one drove the plan.
  reference_datetime: string;
  arrival_datetime: string;
  filed_route: string | null;
  route: RouteResult;
  permits: PermitsResult;
  capability: CapabilityResult;
  credentials: CredentialsResult;
  reroute: RerouteResult | null;
  nav_fees: NavFeesSummary | null;
  permit_fees: PermitFeesSummary | null;
  verdict: string;
  // Plain-English explanation of `verdict` — never empty, a clean leg gets
  // one affirmative "no issues" reason. Same list drives both the public
  // Viability IQ result card and the Trip Manager leg view.
  reasons: string[];
}

export interface FeasibilityCheckResult {
  check_id: string;
  legs: LegResult[];
  overall_verdict: string;
}

export interface RequestQuoteRequest {
  check_id: string;
  contact_name: string;
  contact_email: string;
  contact_phone?: string;
  notes?: string;
}

export interface RequestQuoteResult {
  trip_id: string;
  status: string;
}

// --- Route preview (live, Engine 1 only — great-circle, no airway data) ---

export interface GeoJsonGeometry {
  type: "Polygon" | "MultiPolygon";
  coordinates: unknown;
}

export interface RoutePreview {
  distance_nm: number;
  eet_hours: number;
  states: StateName[];
  firs: FirName[];
  track_points: [number, number][];
  state_geometry: Record<string, GeoJsonGeometry>;
  fir_geometry: Record<string, GeoJsonGeometry>;
}

// --- Trip Manager (admin) ---

export type ServiceAssignmentStatus = "PENDING" | "SENT" | "ACKNOWLEDGED" | "CONFIRMED";

export interface ServiceAssignment {
  service_code: string;
  icao: string;
  service_name: string | null;
  provider: string | null;
  vendor_id: string | null;
  notes: string | null;
  status: ServiceAssignmentStatus;
  confirmation_number: string | null;
  // Server-computed (granted_at set once on first CONFIRMED transition,
  // valid_until derived from it + the icao's country's permit validity
  // setting) — never client-editable directly. See task #101/§4.12.
  granted_at: string | null;
  valid_until: string | null;
  // True for a line item an admin added beyond what the engine generated
  // (task #105 "add more sub-services") — e.g. a GH sub-service.
  manual: boolean;
}

export type ServiceMessageDirection = "OUTBOUND" | "INBOUND" | "MANUAL_NOTE";
export type DeliveryChannel = "EMAIL" | "PHONE" | "FAX" | "SMS" | "WHATSAPP" | "PORTAL" | "SITA" | "ARINC" | "AFTN";

export interface ServiceMessage {
  id: string;
  leg_id: string;
  service_code: string;
  icao: string;
  direction: ServiceMessageDirection;
  channel: DeliveryChannel | null;
  subject: string | null;
  body: string;
  sent_by_user_id: string | null;
  sent_by_name: string | null;
  version: number;
  created_at: string;
}

export interface ServiceMessageCreateRequest {
  direction: ServiceMessageDirection;
  channel?: DeliveryChannel | null;
  subject?: string | null;
  body: string;
  sent_by_name?: string | null;
}

export interface SendServiceRequestOut {
  service_code: string;
  icao: string;
  sent: boolean;
  error: string | null;
  message: ServiceMessage | null;
}

export interface CustomServiceAssignmentRequest {
  service_code: string;
  icao: string;
}

export interface ServiceCatalogueEntry {
  id: string;
  code: string;
  name: string;
  category: "PERMIT" | "GROUND";
  level: "SERVICE" | "SUB-SERVICE";
  parent_service_id: string | null;
}

export interface ServiceDeliveryResolved {
  config: {
    id: string;
    vendor_id: string;
    delivery_channels: DeliveryChannel[];
    message_template_id: string | null;
  } | null;
  matched_scope: "LEG" | "TRIP" | "OPERATOR" | null;
}

export interface NavFeeLineItem {
  fir_code: string;
  fir_name: string | null;
  provider_name: string | null;
  formula: string | null;
  distance_nm: number;
  chargeable_distance_nm: number | null;
  fee_usd: number | null;
  status: string;
  currency: string | null;
}

// Trip-Manager-only itemized breakdown behind LegResult.nav_fees' total —
// the client-shareable quote/estimate. See NavFeesSummary re: nulls.
export interface NavFeesDetail {
  fully_priced: boolean;
  items: NavFeeLineItem[];
  subtotal_usd: number | null;
  margin_percent: number;
  margin_usd: number | null;
  total_usd: number | null;
}

export interface PermitFeeLineItem {
  country_iso3: string;
  country_name: string;
  permit_type: "OVERFLIGHT" | "LANDING" | "GROUND_HANDLING";
  caa_fee_usd: number | null;
  caa_status: string;
  nafisat_fee_usd: number | null;
  nafisat_status: string;
  jtl_fee_usd: number;
  line_total_usd: number | null;
}

// Trip-Manager-only itemized breakdown behind LegResult.permit_fees' total —
// see PermitFeesSummary re: nulls.
export interface PermitFeesDetail {
  fully_priced: boolean;
  items: PermitFeeLineItem[];
  caa_subtotal_usd: number | null;
  nafisat_subtotal_usd: number | null;
  jtl_subtotal_usd: number;
  total_usd: number | null;
}

export interface ClientLookup {
  id: string;
  source_ref: string | null;
  bill_to_legal_name: string;
}

// Admin-only (Trip Manager) — never available on the public FIQ form,
// which would otherwise leak one operator's fleet/contact details to
// anyone who types their tail number.
export interface AircraftLookup {
  registration: string;
  icao_type: string;
  mtow_kg: number | null;
  operator_id: string;
  operator_name: string | null;
  clients: ClientLookup[];
}

export interface TripLegDetail {
  id: string;
  leg_index: number;
  reference_datetime: string;
  arrival_datetime: string;
  call_sign: string | null;
  registration: string | null;
  aircraft_icao_type: string;
  leg_type: TripLegType;
  leg_status: TripLegStatus;
  client: ClientLookup | null;
  updated_by: string | null;
  result: LegResult;
  nav_fees: NavFeesDetail | null;
  permit_fees: PermitFeesDetail | null;
  service_assignments: ServiceAssignment[];
}

export interface Trip {
  id: string;
  status: TripStatus;
  source: string;
  aircraft_registration: string | null;
  operator_airline_name: string | null;
  ops_type: TripOpsType | null;
  flight_purpose: TripFlightPurpose | null;
  requested_by_name: string | null;
  requested_by_email: string | null;
  owner_team: string | null;
  created_at: string;
  start_date: string | null;
  end_date: string | null;
  leg_count: number;
  overall_verdict: string;
  version: number;
}

export interface TripDetail {
  id: string;
  status: TripStatus;
  source: string;
  aircraft_registration: string | null;
  entered_mtow_kg: number | null;
  serial_number: string | null;
  colors: string | null;
  operator_airline_name: string | null;
  ops_type: TripOpsType | null;
  flight_purpose: TripFlightPurpose | null;
  requested_by_name: string | null;
  requested_by_email: string | null;
  requested_by_phone: string | null;
  notes: string | null;
  owner_team: string | null;
  created_at: string;
  version: number;
  overall_verdict: string;
  next_deadline: string | null;
  created_by: string | null;
  updated_by: string | null;
  legs: TripLegDetail[];
}

export interface TripCreateRequest {
  aircraft_icao_type: string;
  aircraft_registration?: string | null;
  entered_mtow_kg?: number | null;
  serial_number?: string | null;
  colors?: string | null;
  operator_airline_name?: string | null;
  ops_type?: TripOpsType | null;
  flight_purpose?: TripFlightPurpose | null;
  persons: PersonPublicInput[];
  legs: LegInput[];
  requested_by_name?: string;
  requested_by_email?: string;
  requested_by_phone?: string;
  notes?: string;
}

export interface TripUpdateRequest {
  version: number;
  status?: string;
  notes?: string;
  requested_by_name?: string;
  requested_by_email?: string;
  requested_by_phone?: string;
  aircraft_registration?: string | null;
  entered_mtow_kg?: number | null;
  serial_number?: string | null;
  colors?: string | null;
  operator_airline_name?: string | null;
  ops_type?: TripOpsType | null;
  flight_purpose?: TripFlightPurpose | null;
  owner_team?: string | null;
}

export interface ServiceAssignmentRequest {
  provider: string;
  vendor_id?: string;
  notes?: string;
  status?: ServiceAssignmentStatus;
  confirmation_number?: string;
}

export interface Notification {
  id: string;
  entity_type: string;
  entity_id: string;
  kind: string;
  message: string;
  seen_at: string | null;
  version: number;
  created_at: string;
}
