// ─────────────────────────────────────────────────────────────────────────────
// VIQ Trip Management — Data Model
// Based on 8-table architecture: Trips → Legs → Stops → Services
// ─────────────────────────────────────────────────────────────────────────────

export type ServiceScope = 'TRIP' | 'LEG' | 'STOP' | 'SEGMENT';

// Was a closed union; the valid set now lives in the admin-editable
// ServiceTypeDef catalog (see below), not a compile-time list.
export type ServiceType = string;

export type ServiceStatus =
  | 'Not Required'
  | 'Not Started'
  | 'Requested'
  | 'Chasing'
  | 'Confirmed'
  | 'Re-confirm Required'
  | 'Cancelled'
  | 'Submission Pending'
  | 'Submission Failed';

export type ServiceResponsibility = 'VIQ Arrangement' | 'Client Own' | 'Operator Own' | 'Other';

export type Urgency = 'OK' | 'DUE' | 'URGENT' | 'BREACH';

export type TripStatus = 'Planning' | 'Active' | 'Complete' | 'Cancelled';

export type CommDirection = 'OUTBOUND' | 'INBOUND';

export type CommStatus = 'Draft' | 'Queued' | 'Sent' | 'Failed' | 'Received';

export type PersonRole =
  | 'PIC'
  | 'SIC'
  | 'FA'
  | 'Mechanic'
  | 'Engineer'
  | 'Medical Staff'
  | 'Other'
  | 'Pax'
  | 'VIP'
  | 'Principal';

export type DocType =
  | 'Registration Certificate'
  | 'Airworthiness Certificate'
  | 'Insurance Certificate'
  | 'Permit Application Form'
  | 'AOC'
  | 'Noise Certificate'
  | 'PAX List'
  | 'Crew Licence'
  | 'Medical Certificate'
  | 'Other';

// ─── Reference Tables ───────────────────────────────────────────────────────

export interface ContactChannel {
  ID: number;
  ChannelType: 'Email' | 'Phone' | 'SMS' | 'WhatsApp';
  Value: string;
  Label?: string;
  Preferred: boolean;
  ForBilling: boolean;
}

export interface Airport {
  ICAO: string;
  IATA: string;
  Name: string;
  City: string;
  CountryISO2: string;
  TZ: string;
  Latitude: number;
  Longitude: number;
  ElevationFt: number;
  RunwayLengthFt: number;
  Category: string;
  FBOCount: number;
}

export interface Country {
  Name: string;
  ISO2: string;
  Region: string;
  OverflightPermitRequired: boolean;
  LandingPermitRequired: boolean;
  AOCDocsRequired: boolean;
  EscalationContact: string;
  // Approximate geographic centroid, used to attribute great-circle route
  // points to a country when no boundary/polygon data is available.
  CentroidLat: number;
  CentroidLng: number;
}

export interface CountryRule {
  ID: number;
  CountryISO2: string;
  ServiceType: ServiceType;
  LeadTimeHours: number;
  WorkingDaysOnly: boolean;
  ToleranceHours: number;
  ExceptionAirports?: string[];
  DocsRequired?: string[];
  Notes?: string;
}

export interface Aircraft {
  Registration: string;
  ICAOType: string;
  Manufacturer: string;
  MTOW_kg: number;
  NoiseCert: string;
  SerialNumber?: string;
  CurrentOperatorID: string;
  Colors?: string;
  OperationType?: string;
  MaxRangeOverrideNm?: number;
  FuelBurnOverrideKgPerHour?: number;
}

export interface Provider {
  ProviderID: string;
  Name: string;
  ServiceTypes: ServiceType[];
  ScopeType: 'ICAO' | 'Country' | 'Global';
  Scope: string; // ICAO code, country ISO2, or "Global"
  WorkingHoursZ: string;
  Channels: ContactChannel[];
}

export interface ServiceTypeDef {
  code: string;
  label: string;
  category: 'Permit' | 'Handling' | 'Other';
  variants?: { code: string; label: string }[];
  active: boolean;
  sortOrder: number;
}

export interface LegPurposeDef {
  code: string;
  label: string;
  active: boolean;
  sortOrder: number;
}

// ─── Transactional Spine ────────────────────────────────────────────────────

export interface Trip {
  TripID: string;
  Client: string;
  ClientID?: string;
  Operator: string;
  Registration: string;
  Status: TripStatus;
  Version: number;
  StatusChangedAt?: string;
  StatusChangedBy?: string;
  AllowedTransitions?: string[];
  Owner: string;
  OwnerUserID?: string;
  Team?: string;
  CreatedZ: string;
  // Trip support provider reference (e.g. Universal Weather ref number)
  SupportRef?: string;
  BillToAddress?: string;
  BillToAddressLine1?: string;
  BillToAddressLine2?: string;
  BillToCity?: string;
  BillToState?: string;
  BillToPostalCode?: string;
  BillToCountry?: string;
  BillToEmails?: string[];
  // Set on trips submitted via the public quote tool (LandingPage)
  OperationType?: string;
  MissionType?: string;
  AircraftICAOType?: string;
  AircraftMTOWKg?: number;
  AircraftSerialNumber?: string;
  Notes?: string;
}

export interface Leg {
  LegID: string;
  TripID: string;
  Seq: number;
  DepICAO: string;
  ArrICAO: string;
  ETDZ: string;
  ETAZ: string;
  BlockHours: number;
  PaxCount: number;
  CrewCount: number;
  CountriesOverflown: string[];
  Revision: number;
  Version: number;
  CallSign?: string; // e.g. ACW169 per leg
  Purpose?: string;
  AvoidFIRs?: string[];
  IncludeFIRs?: string[];
  Routing?: string;
}

export interface Stop {
  StopID: string;
  TripID: string;
  ICAO: string;
  ArrZ: string;
  DepZ: string;
  GroundTimeHours: number;
  Purpose: 'Tech' | 'Night' | 'CrewChange' | 'Passenger';
}

export interface Service {
  SVCID: string;
  TripID: string;
  ScopeType: ServiceScope;
  ScopeID: string; // LegID or StopID
  ServiceType: ServiceType;
  ProviderID: string | null;
  Status: ServiceStatus;
  Version: number;
  StatusChangedAt?: string;
  StatusChangedBy?: string;
  AllowedTransitions?: string[];
  AuthorizationID?: string;
  Responsibility: ServiceResponsibility;
  RefNumber: string;
  BasedOnETDZ: string;
  RequiredByZ: string;
  Urgency: Urgency;
  AssignedTo: string;
  Notes: string;
  // Sub-items for complex services (e.g. driver details, O2 service)
  SubItems?: ServiceSubItem[];
  // Permit confirmation workflow
  ConfirmedBy?: string;      // Who confirmed the permit/service
  ConfirmedAtZ?: string;     // ISO timestamp of confirmation
  ValidityZ?: string;        // Permit validity until
  SentToCaptain?: boolean;   // Flag to send confirmation to captain
  Attachments?: string[];    // Simulated attachment filenames
  // Country-specific permit/overflight — one service per country
  CountryISO2?: string;
  // Which airport within the leg this service is for (dep/arr/stop) — the
  // admin-editable service-type catalog's ICAO-grouped display uses this.
  ICAO?: string;
  // Selected variant code from the service type's ServiceTypeDef.variants.
  Variant?: string;
  VendorSelectionSource?: string;
  VendorAssignmentID?: string;
  VendorSelectedAtZ?: string;
}

export interface ServiceSubItem {
  label: string;
  value: string;
  status: 'Pending' | 'Confirmed' | 'Cancelled' | 'NA';
}

export type TaskStatus = 'Open' | 'In Progress' | 'Waiting' | 'Complete' | 'Cancelled';
export type TaskPriority = 'Low' | 'Normal' | 'High' | 'Urgent';
export type TaskEscalationTier = 'Amber' | 'Red';

export interface Task {
  TaskID: string;
  Title: string;
  Description?: string;
  TripID?: string;
  LegID?: string;
  ServiceID?: string;
  ClientID?: string;
  OwnerUserID?: string;
  Priority: TaskPriority;
  NoLaterThanZ?: string;
  Status: TaskStatus;
  StatusChangedAt?: string;
  StatusChangedBy?: string;
  AllowedTransitions?: string[];
  Version: number;
  Source: 'Manual' | 'System';
  SourceKey?: string;
  EscalationTier?: TaskEscalationTier;
  EscalatedAtZ?: string;
  CreatedBy?: string;
  CreatedAtZ: string;
  CompletedAtZ?: string;
}

// Trip-independent roster identity — a person is no longer owned by one
// trip; see TripPersonAssignment for the per-trip specifics, and
// TripPersonView for the merged shape TripDetail.tsx actually renders.
export interface Person {
  PersonID: string;
  Name: string;
  DefaultRole?: PersonRole;
  // For crew
  LicenceNumber?: string;
  MedicalValidUntil?: string;
  MedicalClass?: string;
  MedicalExaminer?: string;
  // Passport biodata
  PassportNumber?: string;
  PassportNationality?: string;
  PassportIssuingCountry?: string;
  PassportExpiryDate?: string;
  PassportDateOfBirth?: string;
  PassportSex?: string;
  // Contact
  Channels: ContactChannel[];
}

export interface PersonRating {
  ID: number;
  PersonID: string;
  RatingType: string;
  IssuingAuthority?: string;
  IssueDate?: string;
  ExpiryDate?: string;
  Notes?: string;
}

// Roster identity + one trip's assignment specifics, merged into one
// object — this is what TripDetail.tsx actually renders, so its existing
// JSX needs no changes, only a type/data-source swap.
export interface TripPersonView extends Person {
  Role: PersonRole;
  CommercialFlightETA?: string;
  Hotel?: string;
}

// One row per (person, leg) — the trip-wide register: CREW & PAX REGISTER
// tab, the Composer's no-leg-selected fallback, and the raw shape behind
// PersonDetail's per-trip grouping.
export interface TripLegPersonView extends TripPersonView {
  LegID: string;
  LegSeq: number;
  LegDepICAO: string;
  LegArrICAO: string;
}

// Used only by TripSheet.legs — a leg plus its own roster.
export interface LegWithPersons extends Leg {
  persons: TripPersonView[];
}

export interface DocAttachment {
  DocID: string;
  TripID?: string;
  SVCID: string | null;
  PersonID?: string;
  AircraftRegistration?: string;
  DocType: DocType;
  FileName: string;
  MimeType: string;
  FileSizeBytes: number;
  UploadedZ: string;
  UploadedBy: string;
  ValidUntil?: string;
  OcrStatus?: 'Complete' | 'Failed';
  OcrText?: string;
  OcrStructuredFields?: Record<string, unknown>;
  OcrError?: string;
  OcrProcessedAt?: string;
  VerifiedFields?: { label: string; value: string }[];
  VerifiedBy?: string;
  VerifiedAt?: string;
}

// ─── Ledgers ────────────────────────────────────────────────────────────────

export interface Comm {
  CommID: string;
  Direction: CommDirection;
  TripID: string;
  SVCID: string | null;
  Token: string;
  From: string;
  To: string;
  Subject: string;
  Body: string;
  TimestampZ: string;
  Status: CommStatus;
  SentAtZ?: string;
  ErrorMessage?: string;
}

export interface AuditEntry {
  TimestampZ: string;
  User: string;
  Table: string;
  RecordID: string;
  Field: string;
  OldValue: string;
  NewValue: string;
}

export interface AppUser {
  ID: string;
  Username: string;
  Role: 'Admin' | 'Coordinator' | 'Viewer';
  Active: boolean;
  CreatedAt: string;
  FirstName?: string;
  MiddleName?: string;
  LastName?: string;
  Email?: string;
  Phone?: string;
  Team?: string;
  Company?: string;
  Designation?: string;
}

// ─── UI Helpers ─────────────────────────────────────────────────────────────

export interface TripSheet {
  trip: Trip;
  legs: Leg[];
  stops: Stop[];
  services: Service[];
  comms: Comm[];
  persons: Person[];
  docs: DocAttachment[];
}
