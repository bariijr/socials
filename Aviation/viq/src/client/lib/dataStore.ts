// @ts-nocheck
// ═══════════════════════════════════════════════════════════════════════════════
// VIQ Data Store — JSON Reference + localStorage Transactional
// ═══════════════════════════════════════════════════════════════════════════════

import type {
  Airport, Country, CountryRule, Aircraft, Provider, ServiceTypeDef, LegPurposeDef,
  Trip, Leg, Stop, Service, Comm, Task, AuditEntry, Person, PersonRating, PersonRole, TripStatus,
  TripPersonView, TripLegPersonView, LegWithPersons, DocAttachment, AppUser, ContactChannel
} from '@/data/types';

import airportsJson from '@/data/json/airports.json';
import countriesJson from '@/data/json/countries.json';
import citiesJson from '@/data/json/cities.json';
import aircraftTypesJson from '@/data/json/aircraft-types.json';
import aircraftJson from '@/data/json/aircraft.json';
import operatorsJson from '@/data/json/operators.json';
import providersJson from '@/data/json/providers.json';
import countryRulesJson from '@/data/json/country-rules.json';
import icaoRulesJson from '@/data/json/icao-rules.json';
import docTemplatesJson from '@/data/json/doc-templates.json';
import pricelistJson from '@/data/json/pricelist.json';

import { apiFetch } from './apiClient';
import { personExpiryStatus, type PersonExpiryStatus } from './expiry';

// ─── Reference Data Types ───────────────────────────────────────────────────

export interface AircraftType {
  ICAOType: string;
  Manufacturer: string;
  Model: string;
  Category: string;
  MTOW_kg: number;
  MaxRangeNM: number;
  MaxPax: number;
  TypicalPax: number;
  CrewRequired: number;
  MaxCrew: number;
  CruiseSpeedKts: number;
  CeilingFt: number;
  FuelBurnKgPerHour: number;
  NoiseCert: string;
  WakeCategory: string;
  ApproachCategory: string;
  LandingDistanceFt: number;
  TakeoffDistanceFt: number;
  WingspanFt: number;
  LengthFt: number;
  Description: string;
}

export interface Operator {
  OperatorID: string;
  Name: string;
  Type: string;
  Address: string;
  Fleet: string[];
  PrimaryContact: string;
  BillingAddress: string;
  PaymentTerms: string;
  Status: string;
  Notes: string;
  Channels: ContactChannel[];
}

export type AuthorizationType = 'Blanket' | 'Block' | 'Seasonal';
export type AuthorizationStatus = 'Draft' | 'Verified' | 'Revoked';

export interface PermitAuthorization {
  ID: string;
  OperatorID: string;
  CountryISO2: string;
  ServiceType: string;
  AuthorizationType: AuthorizationType;
  ReferenceNumber: string;
  ValidFrom: string;
  ValidUntil: string;
  Status: AuthorizationStatus;
  DocID?: string;
  Notes?: string;
  CreatedAt: string;
  CreatedBy: string;
  VerifiedBy?: string;
  VerifiedAt?: string;
}

export interface AuthorizationCandidate {
  Authorization: PermitAuthorization;
  Eligible: boolean;
  Reason?: string;
}

export interface Client {
  ClientID: string;
  Name: string;
  IsOperator: boolean;
  LinkedOperatorID?: string;
  BillingAddressLine1?: string;
  BillingAddressLine2?: string;
  BillingCity?: string;
  BillingState?: string;
  BillingPostalCode?: string;
  BillingCountry?: string;
  Notes?: string;
  Channels: ContactChannel[];
}

export interface UserDirectoryEntry {
  ID: string;
  Username: string;
  FirstName?: string;
  LastName?: string;
  Team?: string;
}

export interface AppSettings {
  AppName: string;
  Tagline?: string;
  SeoTitle?: string;
  SeoDescription?: string;
  SeoKeywords?: string;
  Domain?: string;
  Subdomains: string[];
  HasLogo: boolean;
  HasFavicon: boolean;
}

export interface City {
  Name: string;
  CountryISO2: string;
  TZ: string;
}

export interface ICAORule {
  ICAO: string;
  InheritedCountryISO2: string;
  Rules: Array<{
    ServiceType: string;
    LeadTimeHours: number;
    WorkingDaysOnly: boolean;
    Required: boolean;
    Notes: string;
  }>;
  Exceptions: string[];
  PreferredProviders: string[];
}

export interface DocTemplate {
  DocType: string;
  Category: string;
  Description: string;
  RequiredFor: string[];
  ValidityRequired: boolean;
  DefaultValidityMonths: number | null;
  IssuedBy: string;
  Format: string;
}

export interface PriceItem {
  ProviderID: string;
  ServiceType: string;
  Unit: string;
  Price: number;
  Currency: string;
  Notes: string;
}

// ─── Reference Data (immutable, loaded from JSON) ────────────────────────────

export const refAirports: Airport[] = airportsJson as Airport[];
export const refCountries: Country[] = countriesJson as Country[];
export const refCities: City[] = citiesJson as City[];
export const refAircraftTypes: AircraftType[] = aircraftTypesJson as AircraftType[];

// aircraft.json stores per-tail instance data (overrides + ownership); the
// Manufacturer/MTOW_kg/NoiseCert fields on Aircraft resolve from the matching
// aircraft-types.json record, with instance overrides taking precedence.
function resolveAircraftInstance(inst: Record<string, unknown>): Aircraft {
  const type = refAircraftTypes.find((t) => t.ICAOType === inst.ICAOType);
  return {
    Registration: inst.Registration as string,
    ICAOType: inst.ICAOType as string,
    Manufacturer: (inst.ManufacturerOverride as string) || type?.Manufacturer || 'Unknown',
    MTOW_kg: (inst.MTOWOverride_kg as number) || type?.MTOW_kg || 0,
    NoiseCert: (inst.NoiseCertOverride as string) || type?.NoiseCert || 'Unknown',
    SerialNumber: inst.SerialNumber as string | undefined,
    CurrentOperatorID: inst.CurrentOperatorID as string | undefined,
  };
}
export const refAircraft: Aircraft[] = (aircraftJson as Record<string, unknown>[]).map(resolveAircraftInstance);
export const refOperators: Operator[] = operatorsJson as Operator[];
export const refProviders: Provider[] = providersJson as Provider[];
export const refCountryRules: CountryRule[] = countryRulesJson as CountryRule[];
export const refICaoRules: ICAORule[] = icaoRulesJson as ICAORule[];
export const refDocTemplates: DocTemplate[] = docTemplatesJson as DocTemplate[];
export const refPricelist: PriceItem[] = pricelistJson as PriceItem[];

// ─── API <-> Frontend field mappers ────────────────────────────────────────
// Trip/Leg/Stop/Service only — the four resources this rewire covers. API
// responses are camelCase (Prisma/NestJS convention); frontend types in
// data/types.ts are PascalCase. These are mechanical field renames, no logic.

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

async function apiJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await apiFetch(path, options);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let body: unknown = text;
    try {
      body = text ? JSON.parse(text) : undefined;
    } catch {
      // Not JSON -- keep the raw text as the body.
    }
    throw new ApiError(`${options.method ?? 'GET'} ${path} failed: ${res.status} ${text}`, res.status, body);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// Reads the currently logged-in user's username, written by authContext.tsx's
// AuthProvider on login (`viq_auth_user`). Falls back to 'SYSTEM' if nothing
// is stored — shouldn't happen in practice since every page that calls a
// mutation function sits behind RequireAuth, but keeps this function total.
function currentUser(): string {
  try {
    const raw = localStorage.getItem('viq_auth_user');
    return raw ? (JSON.parse(raw).username as string) : 'SYSTEM';
  } catch {
    return 'SYSTEM';
  }
}

function mapChannelsFromApi(channels: any[] | undefined): ContactChannel[] {
  return (channels ?? []).map((c) => ({
    ID: c.id,
    ChannelType: c.channelType,
    Value: c.value,
    Label: c.label ?? undefined,
    Preferred: c.preferred,
    ForBilling: c.forBilling,
  }));
}

// Used everywhere a UI needs a single display/autofill value rather than
// the full list (e.g. "what email do we send this trip's invoice to").
// Preferred entries of the requested type win; falls back to the first
// entry of that type if none is marked preferred; undefined if there are
// none at all.
export function getPreferredContact(channels: ContactChannel[] | undefined, type: ContactChannel['ChannelType']): string | undefined {
  const matches = (channels ?? []).filter((c) => c.ChannelType === type);
  return matches.find((c) => c.Preferred)?.Value ?? matches[0]?.Value;
}

// Used by the New Trip wizard's single-value Phone/Email quick-entry
// inputs — upserts a single preferred entry of the given type into a
// channels array without disturbing any other channel types already
// present (e.g. setting Phone doesn't wipe an existing Email).
export function setPreferredChannelValue(channels: ContactChannel[], type: ContactChannel['ChannelType'], value: string): ContactChannel[] {
  const others = channels.filter((c) => c.ChannelType !== type);
  if (!value.trim()) return others;
  return [...others, { ID: 0, ChannelType: type, Value: value, Preferred: true, ForBilling: false }];
}

export function mapTripFromApi(t: any): Trip {
  return {
    TripID: t.tripId,
    Client: t.client,
    ClientID: t.clientId ?? undefined,
    Operator: t.operator ?? '',
    Registration: t.registration ?? '',
    Status: t.status,
    Version: t.version,
    StatusChangedAt: t.statusChangedAt ?? undefined,
    StatusChangedBy: t.statusChangedBy ?? undefined,
    AllowedTransitions: t.allowedTransitions ?? undefined,
    Owner: t.owner ?? '',
    OwnerUserID: t.ownerUserId ?? undefined,
    Team: t.team ?? undefined,
    CreatedZ: t.createdZ,
    SupportRef: t.supportRef ?? undefined,
    BillToAddress: t.billToAddress ?? undefined,
    BillToAddressLine1: t.billToAddressLine1 ?? undefined,
    BillToAddressLine2: t.billToAddressLine2 ?? undefined,
    BillToCity: t.billToCity ?? undefined,
    BillToState: t.billToState ?? undefined,
    BillToPostalCode: t.billToPostalCode ?? undefined,
    BillToCountry: t.billToCountry ?? undefined,
    BillToEmails: t.billToEmails ?? undefined,
    OperationType: t.operationType ?? undefined,
    MissionType: t.missionType ?? undefined,
    AircraftICAOType: t.aircraftIcaoType ?? undefined,
    AircraftMTOWKg: t.aircraftMtowKg ?? undefined,
    AircraftSerialNumber: t.aircraftSerialNumber ?? undefined,
    Notes: t.notes ?? undefined,
  };
}

function mapTripToApi(trip: Trip): Record<string, unknown> {
  return {
    tripId: trip.TripID,
    client: trip.Client,
    clientId: trip.ClientID,
    operator: trip.Operator,
    registration: trip.Registration,
    status: trip.Status,
    version: trip.Version,
    owner: trip.Owner,
    ownerUserId: trip.OwnerUserID,
    team: trip.Team,
    supportRef: trip.SupportRef,
    billToAddress: trip.BillToAddress,
    billToAddressLine1: trip.BillToAddressLine1,
    billToAddressLine2: trip.BillToAddressLine2,
    billToCity: trip.BillToCity,
    billToState: trip.BillToState,
    billToPostalCode: trip.BillToPostalCode,
    billToCountry: trip.BillToCountry,
    billToEmails: trip.BillToEmails,
    operationType: trip.OperationType,
    missionType: trip.MissionType,
    aircraftIcaoType: trip.AircraftICAOType,
    aircraftMtowKg: trip.AircraftMTOWKg,
    aircraftSerialNumber: trip.AircraftSerialNumber,
    notes: trip.Notes,
  };
}

export function mapLegFromApi(l: any): Leg {
  return {
    LegID: l.legId,
    TripID: l.tripId,
    Seq: l.seq,
    DepICAO: l.depIcao,
    ArrICAO: l.arrIcao,
    ETDZ: l.etdZ,
    ETAZ: l.etaZ,
    BlockHours: l.blockHours,
    PaxCount: l.paxCount,
    CrewCount: l.crewCount,
    CountriesOverflown: l.countriesOverflown ?? [],
    Revision: l.revision,
    Version: l.version,
    CallSign: l.callSign ?? undefined,
    Purpose: l.purpose ?? undefined,
    AvoidFIRs: l.avoidFirs ?? undefined,
    IncludeFIRs: l.includeFirs ?? undefined,
    Routing: l.routing ?? undefined,
  };
}

function mapLegToApi(leg: Leg): Record<string, unknown> {
  return {
    legId: leg.LegID,
    tripId: leg.TripID,
    seq: leg.Seq,
    depIcao: leg.DepICAO,
    arrIcao: leg.ArrICAO,
    etdZ: leg.ETDZ,
    etaZ: leg.ETAZ,
    blockHours: leg.BlockHours,
    paxCount: leg.PaxCount,
    crewCount: leg.CrewCount,
    countriesOverflown: leg.CountriesOverflown,
    revision: leg.Revision,
    version: leg.Version,
    callSign: leg.CallSign,
    purpose: leg.Purpose,
    avoidFirs: leg.AvoidFIRs,
    includeFirs: leg.IncludeFIRs,
    routing: leg.Routing,
  };
}

function mapStopFromApi(s: any): Stop {
  return {
    StopID: s.stopId,
    TripID: s.tripId,
    ICAO: s.icao,
    ArrZ: s.arrZ,
    DepZ: s.depZ,
    GroundTimeHours: s.groundTimeHours,
    Purpose: s.purpose,
  };
}

function mapStopToApi(stop: Stop): Record<string, unknown> {
  return {
    stopId: stop.StopID,
    tripId: stop.TripID,
    icao: stop.ICAO,
    arrZ: stop.ArrZ,
    depZ: stop.DepZ,
    groundTimeHours: stop.GroundTimeHours,
    purpose: stop.Purpose,
  };
}

export function mapServiceFromApi(s: any): Service {
  return {
    SVCID: s.svcId,
    TripID: s.tripId,
    ScopeType: s.scopeType,
    ScopeID: s.scopeId,
    ServiceType: s.serviceType,
    ProviderID: s.providerId ?? null,
    Status: s.status,
    Version: s.version,
    StatusChangedAt: s.statusChangedAt ?? undefined,
    StatusChangedBy: s.statusChangedBy ?? undefined,
    AllowedTransitions: s.allowedTransitions ?? undefined,
    AuthorizationID: s.authorizationId ?? undefined,
    Responsibility: s.responsibility,
    RefNumber: s.refNumber,
    BasedOnETDZ: s.basedOnEtdZ,
    RequiredByZ: s.requiredByZ,
    Urgency: s.urgency,
    AssignedTo: s.assignedTo,
    Notes: s.notes,
    SubItems: s.subItems ?? undefined,
    ConfirmedBy: s.confirmedBy ?? undefined,
    ConfirmedAtZ: s.confirmedAtZ ?? undefined,
    ValidityZ: s.validityZ ?? undefined,
    SentToCaptain: s.sentToCaptain ?? undefined,
    Attachments: s.attachments ?? undefined,
    CountryISO2: s.countryIso2 ?? undefined,
    ICAO: s.icao ?? undefined,
    Variant: s.variant ?? undefined,
  };
}

function mapServiceToApi(service: Service): Record<string, unknown> {
  return {
    svcId: service.SVCID,
    tripId: service.TripID,
    scopeType: service.ScopeType,
    scopeId: service.ScopeID,
    serviceType: service.ServiceType,
    providerId: service.ProviderID,
    status: service.Status,
    version: service.Version,
    responsibility: service.Responsibility,
    refNumber: service.RefNumber,
    basedOnEtdZ: service.BasedOnETDZ,
    requiredByZ: service.RequiredByZ,
    urgency: service.Urgency,
    assignedTo: service.AssignedTo,
    notes: service.Notes,
    subItems: service.SubItems,
    confirmedBy: service.ConfirmedBy,
    confirmedAtZ: service.ConfirmedAtZ,
    validityZ: service.ValidityZ,
    sentToCaptain: service.SentToCaptain,
    attachments: service.Attachments,
    countryIso2: service.CountryISO2,
    icao: service.ICAO,
    variant: service.Variant,
  };
}

export function mapTaskFromApi(t: any): Task {
  return {
    TaskID: t.id,
    Title: t.title,
    Description: t.description ?? undefined,
    TripID: t.tripId ?? undefined,
    LegID: t.legId ?? undefined,
    ServiceID: t.serviceId ?? undefined,
    ClientID: t.clientId ?? undefined,
    OwnerUserID: t.ownerUserId ?? undefined,
    Priority: t.priority,
    NoLaterThanZ: t.noLaterThanZ ?? undefined,
    Status: t.status,
    StatusChangedAt: t.statusChangedAt ?? undefined,
    StatusChangedBy: t.statusChangedBy ?? undefined,
    AllowedTransitions: t.allowedTransitions ?? undefined,
    Version: t.version,
    Source: t.source,
    SourceKey: t.sourceKey ?? undefined,
    EscalationTier: t.escalationTier ?? undefined,
    EscalatedAtZ: t.escalatedAtZ ?? undefined,
    CreatedBy: t.createdBy ?? undefined,
    CreatedAtZ: t.createdAtZ,
    CompletedAtZ: t.completedAtZ ?? undefined,
  };
}

function mapTaskToApi(task: Partial<Task>): Record<string, unknown> {
  return {
    title: task.Title,
    description: task.Description,
    tripId: task.TripID,
    legId: task.LegID,
    serviceId: task.ServiceID,
    clientId: task.ClientID,
    ownerUserId: task.OwnerUserID,
    priority: task.Priority,
    noLaterThanZ: task.NoLaterThanZ,
    status: task.Status,
    version: task.Version,
    escalationTier: task.EscalationTier,
  };
}

function mapCommFromApi(c: any): Comm {
  return {
    CommID: c.commId,
    Direction: c.direction,
    TripID: c.tripId,
    SVCID: c.svcId ?? null,
    Token: c.token ?? '',
    From: c.from,
    To: c.to,
    Subject: c.subject,
    Body: c.body,
    TimestampZ: c.timestampZ,
    Status: c.status,
    SentAtZ: c.sentAtZ ?? undefined,
    ErrorMessage: c.errorMessage ?? undefined,
  };
}

function mapCommToApi(comm: Comm): Record<string, unknown> {
  return {
    commId: comm.CommID,
    direction: comm.Direction,
    tripId: comm.TripID,
    svcId: comm.SVCID,
    token: comm.Token,
    from: comm.From,
    to: comm.To,
    subject: comm.Subject,
    body: comm.Body,
    status: comm.Status,
  };
}

function mapInvoiceFromApi(i: any): Invoice {
  return {
    InvoiceID: i.invoiceId,
    TripID: i.tripId,
    Status: i.status,
    IssueDateZ: i.issueDateZ,
    DueDateZ: i.dueDateZ,
    LineItems: i.lineItems ?? [],
    Subtotal: i.subtotal,
    TaxRate: i.taxRate,
    TaxAmount: i.taxAmount,
    Total: i.total,
    Currency: i.currency,
    SentTo: i.sentTo ?? '',
    SentAtZ: i.sentAtZ ?? undefined,
    PaidAtZ: i.paidAtZ ?? undefined,
    PaymentMethod: i.paymentMethod ?? undefined,
    QRCode: i.qrCode ?? undefined,
    Notes: i.notes ?? '',
    Attachments: i.attachments ?? [],
    ChangeLog: i.changeLog ?? [],
  };
}

function mapInvoiceToApi(invoice: Invoice): Record<string, unknown> {
  return {
    invoiceId: invoice.InvoiceID,
    tripId: invoice.TripID,
    status: invoice.Status,
    issueDateZ: invoice.IssueDateZ,
    dueDateZ: invoice.DueDateZ,
    lineItems: invoice.LineItems,
    subtotal: invoice.Subtotal,
    taxRate: invoice.TaxRate,
    taxAmount: invoice.TaxAmount,
    total: invoice.Total,
    currency: invoice.Currency,
    sentTo: invoice.SentTo,
    sentAtZ: invoice.SentAtZ,
    paidAtZ: invoice.PaidAtZ,
    paymentMethod: invoice.PaymentMethod,
    qrCode: invoice.QRCode,
    notes: invoice.Notes,
    attachments: invoice.Attachments,
    changeLog: invoice.ChangeLog,
  };
}

// ─── Trip CRUD ────────────────────────────────────────────────────────────────

export async function getTrips(): Promise<Trip[]> {
  const rows = await apiJson<any[]>('/trips');
  return rows.map(mapTripFromApi);
}

export async function getTripsPaginated(
  page: number,
  limit: number,
  search?: string,
  opts: { upcomingHours?: number; enquiriesOnly?: boolean } = {},
): Promise<{
  data: (Trip & { Legs: Leg[]; Counts: { Stops: number; Services: number; Comms: number } })[];
  page: number; limit: number; total: number; totalPages: number;
}> {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (search) params.set('search', search);
  if (opts.upcomingHours) params.set('upcoming', String(opts.upcomingHours));
  if (opts.enquiriesOnly) params.set('enquiriesOnly', 'true');
  const res = await apiJson<any>(`/trips?${params.toString()}`);
  return {
    data: res.data.map((row: any) => ({
      ...mapTripFromApi(row),
      Legs: row.legs.map(mapLegFromApi),
      // "N Stops" means arrival events (one per leg, destination included),
      // not the Stop table's row count -- that table tracks a different
      // concept (connecting/technical layovers between two legs). A
      // single-leg trip (e.g. HTDA -> FALA) has zero connecting Stop rows
      // but is legitimately "1 stop: FALA" from a coordinator's point of
      // view. See docs/superpowers/specs/2026-09-02-viq-test-foundation-leg-stop-correction-design.md.
      Counts: { Stops: row.legs.length, Services: row._count.services, Comms: row._count.comms },
    })),
    page: res.page, limit: res.limit, total: res.total, totalPages: res.totalPages,
  };
}

export async function getTrip(tripId: string): Promise<Trip | undefined> {
  try {
    const row = await apiJson<any>(`/trips/${tripId}`);
    return mapTripFromApi(row);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return undefined;
    throw e;
  }
}

export async function nextTripId(): Promise<string> {
  const { tripId } = await apiJson<{ tripId: string }>('/trips/next-id');
  return tripId;
}

export async function saveTrip(trip: Trip, user = currentUser()): Promise<Trip> {
  const existing = await getTrip(trip.TripID);
  const body = JSON.stringify({ ...mapTripToApi(trip), user });
  const row = existing
    ? await apiJson<any>(`/trips/${trip.TripID}`, { method: 'PATCH', body })
    : await apiJson<any>('/trips', { method: 'POST', body });
  return mapTripFromApi(row);
}

export async function deleteTrip(tripId: string, user = currentUser()): Promise<void> {
  await apiJson(`/trips/${tripId}?user=${encodeURIComponent(user)}`, { method: 'DELETE' });
}

// ─── Leg CRUD ─────────────────────────────────────────────────────────────────

export async function getLegs(): Promise<Leg[]> {
  const rows = await apiJson<any[]>('/legs');
  return rows.map(mapLegFromApi);
}

export async function getLegsForTrip(tripId: string): Promise<Leg[]> {
  const rows = await apiJson<any[]>(`/legs?tripId=${encodeURIComponent(tripId)}`);
  return rows.map(mapLegFromApi).sort((a, b) => a.Seq - b.Seq);
}

export async function getUpcomingLegs(limit: number, search?: string): Promise<(Leg & { Trip: { TripID: string; Registration: string; Status: string } })[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (search) params.set('search', search);
  const rows = await apiJson<any[]>(`/legs/upcoming?${params.toString()}`);
  return rows.map((r) => ({
    ...mapLegFromApi(r),
    Trip: { TripID: r.trip.tripId, Registration: r.trip.registration ?? '', Status: r.trip.status },
  }));
}

export async function saveLeg(leg: Leg, user = currentUser()): Promise<Leg> {
  const legs = await getLegsForTrip(leg.TripID);
  const exists = legs.some((l) => l.LegID === leg.LegID);
  const body = JSON.stringify({ ...mapLegToApi(leg), user });
  const row = exists
    ? await apiJson<any>(`/legs/${leg.LegID}`, { method: 'PATCH', body })
    : await apiJson<any>('/legs', { method: 'POST', body });
  return mapLegFromApi(row);
}

export async function deleteLeg(legId: string, user = currentUser()): Promise<void> {
  await apiJson(`/legs/${legId}?user=${encodeURIComponent(user)}`, { method: 'DELETE' });
}

// ─── Stop CRUD ────────────────────────────────────────────────────────────────

export async function getStops(): Promise<Stop[]> {
  const rows = await apiJson<any[]>('/stops');
  return rows.map(mapStopFromApi);
}

export async function getStopsForTrip(tripId: string): Promise<Stop[]> {
  const rows = await apiJson<any[]>(`/stops?tripId=${encodeURIComponent(tripId)}`);
  return rows.map(mapStopFromApi);
}

export async function saveStop(stop: Stop, user = currentUser()): Promise<Stop> {
  const stops = await getStopsForTrip(stop.TripID);
  const exists = stops.some((s) => s.StopID === stop.StopID);
  const body = JSON.stringify({ ...mapStopToApi(stop), user });
  const row = exists
    ? await apiJson<any>(`/stops/${stop.StopID}`, { method: 'PATCH', body })
    : await apiJson<any>('/stops', { method: 'POST', body });
  return mapStopFromApi(row);
}

export async function deleteStop(stopId: string, user = currentUser()): Promise<void> {
  await apiJson(`/stops/${stopId}?user=${encodeURIComponent(user)}`, { method: 'DELETE' });
}

// ─── Service CRUD ─────────────────────────────────────────────────────────────

export async function getServices(): Promise<Service[]> {
  const rows = await apiJson<any[]>('/services');
  return rows.map(mapServiceFromApi);
}

export async function getServicesForTrip(tripId: string): Promise<Service[]> {
  const rows = await apiJson<any[]>(`/services?tripId=${encodeURIComponent(tripId)}`);
  return rows.map(mapServiceFromApi);
}

export async function getOpenServicesWidget(limit: number, search?: string): Promise<(Service & { Trip: { TripID: string; Registration: string } })[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (search) params.set('search', search);
  const rows = await apiJson<any[]>(`/services/open?${params.toString()}`);
  return rows.map((r) => ({
    ...mapServiceFromApi(r),
    Trip: { TripID: r.trip.tripId, Registration: r.trip.registration ?? '' },
  }));
}

export async function closeService(svcId: string, version: number, user = currentUser()): Promise<void> {
  await apiJson(`/services/${svcId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'Not Required', version, user }),
  });
}

export async function saveService(service: Service, user = currentUser()): Promise<Service> {
  const services = await getServicesForTrip(service.TripID);
  const exists = services.some((s) => s.SVCID === service.SVCID);
  const body = JSON.stringify({ ...mapServiceToApi(service), user });
  const row = exists
    ? await apiJson<any>(`/services/${service.SVCID}`, { method: 'PATCH', body })
    : await apiJson<any>('/services', { method: 'POST', body });
  return mapServiceFromApi(row);
}

export async function deleteService(svcId: string, user = currentUser()): Promise<void> {
  await apiJson(`/services/${svcId}?user=${encodeURIComponent(user)}`, { method: 'DELETE' });
}

// ─── Task CRUD ──────────────────────────────────────────────────────────────

export async function getTasks(params: { scope?: 'mine' | 'team' | 'unassigned' | 'escalated'; tripId?: string } = {}): Promise<Task[]> {
  const search = new URLSearchParams();
  if (params.scope) search.set('scope', params.scope);
  if (params.tripId) search.set('tripId', params.tripId);
  const qs = search.toString();
  const rows = await apiJson<any[]>(`/tasks${qs ? `?${qs}` : ''}`);
  return rows.map(mapTaskFromApi);
}

export async function createTask(task: Partial<Task>, user = currentUser()): Promise<Task> {
  const row = await apiJson<any>('/tasks', {
    method: 'POST',
    body: JSON.stringify(mapTaskToApi(task)),
  });
  return mapTaskFromApi(row);
}

export async function updateTask(id: string, patch: Partial<Task> & { Version: number }, user = currentUser()): Promise<Task> {
  const row = await apiJson<any>(`/tasks/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(mapTaskToApi(patch)),
  });
  return mapTaskFromApi(row);
}

export async function getFailedMessagesWidget(limit: number, search?: string): Promise<(Comm & { Trip: { TripID: string; Registration: string } })[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (search) params.set('search', search);
  const rows = await apiJson<any[]>(`/comms/failed?${params.toString()}`);
  return rows.map((r) => ({
    ...mapCommFromApi(r),
    Trip: { TripID: r.trip.tripId, Registration: r.trip.registration ?? '' },
  }));
}

// ─── Service Type Catalog CRUD ─────────────────────────────────────────────────

export async function getServiceTypes(): Promise<ServiceTypeDef[]> {
  return apiJson<ServiceTypeDef[]>('/service-types');
}

export async function saveServiceType(def: ServiceTypeDef, user = currentUser()): Promise<ServiceTypeDef> {
  const existing = await getServiceTypes();
  const exists = existing.some((d) => d.code === def.code);
  const body = JSON.stringify(def);
  const row = exists
    ? await apiJson<ServiceTypeDef>(`/service-types/${def.code}?user=${encodeURIComponent(user)}`, { method: 'PATCH', body })
    : await apiJson<ServiceTypeDef>(`/service-types?user=${encodeURIComponent(user)}`, { method: 'POST', body });
  return row;
}

export async function getLegPurposes(): Promise<LegPurposeDef[]> {
  return apiJson<LegPurposeDef[]>('/leg-purposes');
}

export async function saveLegPurpose(def: LegPurposeDef, user = currentUser()): Promise<LegPurposeDef> {
  const existing = await getLegPurposes();
  const exists = existing.some((d) => d.code === def.code);
  const body = JSON.stringify(def);
  const row = exists
    ? await apiJson<LegPurposeDef>(`/leg-purposes/${def.code}?user=${encodeURIComponent(user)}`, { method: 'PATCH', body })
    : await apiJson<LegPurposeDef>(`/leg-purposes?user=${encodeURIComponent(user)}`, { method: 'POST', body });
  return row;
}

// Server-side great-circle route computation (see backend src/common/geo.util.ts).
export async function computeCountriesOverflown(depICAO: string, arrICAO: string): Promise<string[]> {
  const { countriesOverflown } = await apiJson<{ countriesOverflown: string[] }>(
    `/legs/compute-overflight?dep=${encodeURIComponent(depICAO)}&arr=${encodeURIComponent(arrICAO)}`
  );
  return countriesOverflown;
}

// Thin wrappers around the backend's idempotent service-generation endpoints.
// Takes legId (not a Leg object) — callers that had a Leg object pass leg.LegID.
export async function generateOverflightServices(legId: string, user = currentUser()): Promise<Service[]> {
  const rows = await apiJson<any[]>(
    `/services/legs/${legId}/generate-overflight?user=${encodeURIComponent(user)}`,
    { method: 'POST' }
  );
  return rows.map(mapServiceFromApi);
}

export async function generateArrivalServices(
  legId: string,
  opts: { departureGroundHandling?: boolean } = {},
  user = currentUser()
): Promise<Service[]> {
  const params = new URLSearchParams({ user });
  if (opts.departureGroundHandling) params.set('departureGroundHandling', 'true');
  const rows = await apiJson<any[]>(`/services/legs/${legId}/generate-arrival?${params}`, { method: 'POST' });
  return rows.map(mapServiceFromApi);
}

// ─── Person CRUD ──────────────────────────────────────────────────────────────

function mapPersonFromApi(p: any): Person {
  return {
    PersonID: p.personId,
    Name: p.name,
    DefaultRole: p.defaultRole ?? undefined,
    LicenceNumber: p.licenceNumber ?? undefined,
    MedicalValidUntil: p.medicalValidUntil ?? undefined,
    MedicalClass: p.medicalClass ?? undefined,
    MedicalExaminer: p.medicalExaminer ?? undefined,
    PassportNumber: p.passportNumber ?? undefined,
    PassportNationality: p.passportNationality ?? undefined,
    PassportIssuingCountry: p.passportIssuingCountry ?? undefined,
    PassportExpiryDate: p.passportExpiryDate ?? undefined,
    PassportDateOfBirth: p.passportDateOfBirth ?? undefined,
    PassportSex: p.passportSex ?? undefined,
    Channels: mapChannelsFromApi(p.channels),
  };
}

function mapTripPersonFromApi(p: any): TripPersonView {
  return { ...mapPersonFromApi(p), Role: p.role, CommercialFlightETA: p.commercialFlightEta ?? undefined, Hotel: p.hotel ?? undefined };
}

function mapTripLegPersonFromApi(p: any): TripLegPersonView {
  return {
    ...mapTripPersonFromApi(p),
    LegID: p.legId,
    LegSeq: p.legSeq,
    LegDepICAO: p.legDepIcao,
    LegArrICAO: p.legArrIcao,
  };
}

export async function getPersonRoster(): Promise<Person[]> {
  const rows = await apiJson<any[]>('/persons');
  return rows.map(mapPersonFromApi);
}

export async function getPersonsForLeg(legId: string): Promise<TripPersonView[]> {
  const rows = await apiJson<any[]>(`/persons?legId=${encodeURIComponent(legId)}`);
  return rows.map(mapTripPersonFromApi);
}

export async function getPersonsForTrip(tripId: string): Promise<TripLegPersonView[]> {
  const rows = await apiJson<any[]>(`/persons?tripId=${encodeURIComponent(tripId)}`);
  return rows.map(mapTripLegPersonFromApi);
}

// Dedupe a trip-wide (person, leg) register down to one row per person —
// used only where a single leg isn't selected (ComposerPage's "Leg
// (optional)" = None). First-leg-wins for role/hotel/ETA display.
export function dedupeToTripPersonView(rows: TripLegPersonView[]): TripPersonView[] {
  const seen = new Set<string>();
  const result: TripPersonView[] = [];
  for (const row of rows) {
    if (seen.has(row.PersonID)) continue;
    seen.add(row.PersonID);
    result.push(row);
  }
  return result;
}

export async function getPerson(personId: string): Promise<Person> {
  const row = await apiJson<any>(`/persons/${personId}`);
  return mapPersonFromApi(row);
}

export async function assignPersonToLeg(
  personId: string,
  data: { legId: string; role: string; hotel?: string; commercialFlightEta?: string },
  user = currentUser()
): Promise<void> {
  await apiJson(`/persons/${personId}/assign`, { method: 'POST', body: JSON.stringify({ ...data, user }) });
}

export async function unassignPersonFromLeg(personId: string, legId: string, user = currentUser()): Promise<void> {
  await apiJson(`/persons/${personId}/assign/${legId}?user=${encodeURIComponent(user)}`, { method: 'DELETE' });
}

export async function assignPersonToAllLegs(
  personId: string,
  data: { tripId: string; role: string; hotel?: string; commercialFlightEta?: string },
  user = currentUser()
): Promise<void> {
  await apiJson(`/persons/${personId}/assign-all-legs`, { method: 'POST', body: JSON.stringify({ ...data, user }) });
}

export interface PersonAssignment {
  LegID: string;
  LegSeq: number;
  DepICAO: string;
  ArrICAO: string;
  TripID: string;
  Role: PersonRole;
  CommercialFlightETA?: string;
  Hotel?: string;
  TripClient: string;
  TripRegistration?: string;
  TripStatus: TripStatus;
  TripCreatedZ: string;
}

export async function getPersonAssignments(personId: string): Promise<PersonAssignment[]> {
  const rows = await apiJson<any[]>(`/persons/${personId}/assignments`);
  return rows.map((a: any) => ({
    LegID: a.legId,
    LegSeq: a.legSeq,
    DepICAO: a.depIcao,
    ArrICAO: a.arrIcao,
    TripID: a.trip.tripId,
    Role: a.role,
    CommercialFlightETA: a.commercialFlightEta ?? undefined,
    Hotel: a.hotel ?? undefined,
    TripClient: a.trip.client,
    TripRegistration: a.trip.registration ?? undefined,
    TripStatus: a.trip.status,
    TripCreatedZ: a.trip.createdZ,
  }));
}

export async function savePerson(person: Person, user = currentUser()): Promise<Person> {
  const roster = await getPersonRoster();
  const exists = roster.some((p) => p.PersonID === person.PersonID);
  const body = JSON.stringify({
    personId: person.PersonID, name: person.Name, defaultRole: person.DefaultRole,
    licenceNumber: person.LicenceNumber, medicalValidUntil: person.MedicalValidUntil,
    medicalClass: person.MedicalClass, medicalExaminer: person.MedicalExaminer,
    passportNumber: person.PassportNumber, passportNationality: person.PassportNationality,
    passportIssuingCountry: person.PassportIssuingCountry, passportExpiryDate: person.PassportExpiryDate,
    passportDateOfBirth: person.PassportDateOfBirth, passportSex: person.PassportSex,
    channels: (person.Channels ?? []).map((c) => ({ channelType: c.ChannelType, value: c.Value, label: c.Label, preferred: c.Preferred, forBilling: c.ForBilling })),
    user,
  });
  const row = exists
    ? await apiJson<any>(`/persons/${person.PersonID}`, { method: 'PATCH', body })
    : await apiJson<any>('/persons', { method: 'POST', body });
  return mapPersonFromApi(row);
}

export async function deletePerson(personId: string, user = currentUser()): Promise<void> {
  await apiJson(`/persons/${personId}?user=${encodeURIComponent(user)}`, { method: 'DELETE' });
}

export async function getPersonRatings(personId: string): Promise<PersonRating[]> {
  const rows = await apiJson<any[]>(`/persons/${personId}/ratings`);
  return rows.map((r: any) => ({
    ID: r.id, PersonID: r.personId, RatingType: r.ratingType, IssuingAuthority: r.issuingAuthority ?? undefined,
    IssueDate: r.issueDate ?? undefined, ExpiryDate: r.expiryDate ?? undefined, Notes: r.notes ?? undefined,
  }));
}

export async function savePersonRating(rating: Omit<PersonRating, 'ID'> & { ID?: number }): Promise<PersonRating> {
  const body = JSON.stringify({
    personId: rating.PersonID, ratingType: rating.RatingType, issuingAuthority: rating.IssuingAuthority,
    issueDate: rating.IssueDate, expiryDate: rating.ExpiryDate, notes: rating.Notes,
  });
  const row = rating.ID
    ? await apiJson<any>(`/ratings/${rating.ID}`, { method: 'PATCH', body })
    : await apiJson<any>('/ratings', { method: 'POST', body });
  return { ID: row.id, PersonID: row.personId, RatingType: row.ratingType, IssuingAuthority: row.issuingAuthority ?? undefined, IssueDate: row.issueDate ?? undefined, ExpiryDate: row.expiryDate ?? undefined, Notes: row.notes ?? undefined };
}

export async function deletePersonRating(id: number): Promise<void> {
  await apiJson(`/ratings/${id}`, { method: 'DELETE' });
}

export interface RosterExpiryEntry {
  person: Person;
  status: PersonExpiryStatus;
}

export async function getRosterExpiryStatuses(): Promise<RosterExpiryEntry[]> {
  const roster = await getPersonRoster();
  const ratingsLists = await Promise.all(roster.map((p) => getPersonRatings(p.PersonID)));
  return roster.map((person, i) => ({ person, status: personExpiryStatus(person, ratingsLists[i]) }));
}

// ─── Comm CRUD ────────────────────────────────────────────────────────────────

export async function getComms(): Promise<Comm[]> {
  const rows = await apiJson<any[]>('/comms');
  return rows.map(mapCommFromApi);
}

export async function getCommsForTrip(tripId: string): Promise<Comm[]> {
  const rows = await apiJson<any[]>(`/comms?tripId=${encodeURIComponent(tripId)}`);
  return rows.map(mapCommFromApi);
}

export async function saveComm(comm: Comm, user = currentUser()): Promise<Comm> {
  const comms = await getCommsForTrip(comm.TripID);
  const exists = comms.some((c) => c.CommID === comm.CommID);
  const body = JSON.stringify({ ...mapCommToApi(comm), user });
  const row = exists
    ? await apiJson<any>(`/comms/${comm.CommID}`, { method: 'PATCH', body })
    : await apiJson<any>('/comms', { method: 'POST', body });
  return mapCommFromApi(row);
}

export async function sendComm(commId: string): Promise<Comm> {
  const row = await apiJson<any>(`/comms/${commId}/send`, { method: 'POST' });
  return mapCommFromApi(row);
}

// ─── Doc CRUD ─────────────────────────────────────────────────────────────────

function mapDocFromApi(d: any): DocAttachment {
  return {
    DocID: d.docId,
    TripID: d.tripId ?? undefined,
    SVCID: d.svcId ?? null,
    PersonID: d.personId ?? undefined,
    AircraftRegistration: d.aircraftRegistration ?? undefined,
    DocType: d.docType,
    FileName: d.fileName,
    MimeType: d.mimeType,
    FileSizeBytes: d.fileSizeBytes,
    UploadedZ: d.uploadedZ,
    UploadedBy: d.uploadedBy,
    ValidUntil: d.validUntil ?? undefined,
    OcrStatus: d.ocrStatus ?? undefined,
    OcrText: d.ocrText ?? undefined,
    OcrStructuredFields: d.ocrStructuredFields ?? undefined,
    OcrError: d.ocrError ?? undefined,
    OcrProcessedAt: d.ocrProcessedAt ?? undefined,
    VerifiedFields: d.verifiedFields ?? undefined,
    VerifiedBy: d.verifiedBy ?? undefined,
    VerifiedAt: d.verifiedAt ?? undefined,
  };
}

export async function getDocs(): Promise<DocAttachment[]> {
  const rows = await apiJson<any[]>('/docs');
  return rows.map(mapDocFromApi);
}

export async function getDocsForTrip(tripId: string): Promise<DocAttachment[]> {
  const rows = await apiJson<any[]>(`/docs?tripId=${encodeURIComponent(tripId)}`);
  return rows.map(mapDocFromApi);
}

export async function getDocsForPerson(personId: string): Promise<DocAttachment[]> {
  const rows = await apiJson<any[]>(`/docs?personId=${encodeURIComponent(personId)}`);
  return rows.map(mapDocFromApi);
}

export async function uploadDoc(
  file: File,
  meta: { docType: string; tripId?: string; personId?: string; aircraftRegistration?: string; svcId?: string; uploadedBy?: string; validUntil?: string }
): Promise<DocAttachment> {
  const form = new FormData();
  form.append('file', file);
  form.append('docType', meta.docType);
  form.append('uploadedBy', meta.uploadedBy || currentUser());
  if (meta.tripId) form.append('tripId', meta.tripId);
  if (meta.personId) form.append('personId', meta.personId);
  if (meta.aircraftRegistration) form.append('aircraftRegistration', meta.aircraftRegistration);
  if (meta.svcId) form.append('svcId', meta.svcId);
  if (meta.validUntil) form.append('validUntil', meta.validUntil);

  const res = await apiFetch('/docs/upload', { method: 'POST', body: form });
  if (!res.ok) throw new Error(`Upload failed: ${res.status} ${await res.text().catch(() => '')}`);
  return mapDocFromApi(await res.json());
}

export async function downloadDocFile(docId: string, fileName: string): Promise<void> {
  const res = await apiFetch(`/docs/${docId}/file`, { method: 'GET' });
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

// Returns a blob: URL for <img>/<iframe> preview use — separate from
// downloadDocFile since /docs/:id/file requires an Authorization header a
// plain <img src>/<iframe src> can never send; the caller must revoke the
// returned URL (URL.revokeObjectURL) once done with it.
export async function getDocPreviewUrl(docId: string): Promise<string> {
  const res = await apiFetch(`/docs/${docId}/file`, { method: 'GET' });
  if (!res.ok) throw new Error(`Preview fetch failed: ${res.status}`);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export async function deleteDoc(docId: string, user = currentUser()): Promise<void> {
  await apiJson(`/docs/${docId}?user=${encodeURIComponent(user)}`, { method: 'DELETE' });
}

export async function runDocOcr(docId: string, password?: string): Promise<DocAttachment> {
  const row = await apiJson<any>(`/docs/${docId}/ocr`, {
    method: 'POST',
    body: JSON.stringify({ password: password || undefined }),
  });
  return mapDocFromApi(row);
}

export async function verifyDoc(
  docId: string,
  data: { verifiedFields: { label: string; value: string }[]; validUntil?: string; verifiedBy?: string }
): Promise<DocAttachment> {
  const row = await apiJson<any>(`/docs/${docId}/verify`, {
    method: 'PATCH',
    body: JSON.stringify({ ...data, verifiedBy: data.verifiedBy || currentUser() }),
  });
  return mapDocFromApi(row);
}

// ─── Audit Read ───────────────────────────────────────────────────────────────
// Was localStorage/static-seed-only — never migrated when every module's
// writes moved to the real API-backed audit_log table. Fetches real data now.

function mapAuditEntryFromApi(a: any): AuditEntry {
  return {
    TimestampZ: a.timestampZ,
    User: a.user,
    Table: a.table,
    RecordID: a.recordId,
    Field: a.field,
    OldValue: a.oldValue,
    NewValue: a.newValue,
  };
}

export async function getAudit(): Promise<AuditEntry[]> {
  const rows = await apiJson<any[]>('/audit?limit=1000');
  return rows.map(mapAuditEntryFromApi);
}

export async function getAuditForRecord(table: string, recordId: string): Promise<AuditEntry[]> {
  const rows = await apiJson<any[]>(`/audit/${encodeURIComponent(table)}/${encodeURIComponent(recordId)}`);
  return rows.map(mapAuditEntryFromApi);
}

// Real "what did the itinerary used to say" for a revision email, sourced
// from the leg's own audit trail (every Leg update is logged field-by-field
// via the server's AuditService.logDiff) rather than a fabricated offset.
// AuditEntry.OldValue is a String(Date)-coerced value (see AuditService),
// which `new Date(...)` round-trips correctly back into a real Date. Returns
// null only when the leg has no logged etdZ/etaZ change at all -- e.g. a
// Revision template picked on a leg that was never actually edited.
export async function getPreviousLegItinerary(legId: string): Promise<{ etdZ: string; etaZ: string } | null> {
  const entries = await getAuditForRecord('Leg', legId);
  const prevEtdEntry = entries.find((e) => e.Field === 'etdZ');
  const prevEtaEntry = entries.find((e) => e.Field === 'etaZ');
  if (!prevEtdEntry && !prevEtaEntry) return null;
  return {
    etdZ: prevEtdEntry ? new Date(prevEtdEntry.OldValue).toISOString() : '',
    etaZ: prevEtaEntry ? new Date(prevEtaEntry.OldValue).toISOString() : '',
  };
}

// ─── Invoices ─────────────────────────────────────────────────────────────────

export interface Invoice {
  InvoiceID: string;
  TripID: string;
  Status: 'Draft' | 'Sent' | 'Viewed' | 'Paid' | 'Overdue' | 'Cancelled';
  IssueDateZ: string;
  DueDateZ: string;
  LineItems: InvoiceLineItem[];
  Subtotal: number;
  TaxRate: number;
  TaxAmount: number;
  Total: number;
  Currency: string;
  SentTo: string;
  SentAtZ?: string;
  PaidAtZ?: string;
  PaymentMethod?: string;
  QRCode?: string;
  Notes: string;
  Attachments: string[];
  ChangeLog: InvoiceChange[];
}

export interface InvoiceLineItem {
  LineID: string;
  SVCID: string | null;
  Description: string;
  Quantity: number;
  Unit: string;
  UnitPrice: number;
  Total: number;
  ProviderID: string | null;
}

export interface InvoiceChange {
  TimestampZ: string;
  User: string;
  Field: string;
  OldValue: string;
  NewValue: string;
  Reason: string;
}

export async function getInvoices(tripId?: string): Promise<Invoice[]> {
  const rows = await apiJson<any[]>(tripId ? `/invoices?tripId=${encodeURIComponent(tripId)}` : '/invoices');
  return rows.map(mapInvoiceFromApi);
}

export async function saveInvoice(invoice: Invoice, user = currentUser()): Promise<Invoice> {
  const invoices = await getInvoices(invoice.TripID);
  const exists = invoices.some((i) => i.InvoiceID === invoice.InvoiceID);
  const body = JSON.stringify({ ...mapInvoiceToApi(invoice), user });
  const row = exists
    ? await apiJson<any>(`/invoices/${invoice.InvoiceID}`, { method: 'PATCH', body })
    : await apiJson<any>('/invoices', { method: 'POST', body });
  return mapInvoiceFromApi(row);
}

// ─── Backup / Export / Import ─────────────────────────────────────────────────

export interface BackupData {
  version: string;
  exportedAt: string;
  transactions: {
    trips: Trip[];
    legs: Leg[];
    stops: Stop[];
    services: Service[];
    comms: Comm[];
    audit: AuditEntry[];
    persons: Person[];
    docs: DocAttachment[];
    invoices: Invoice[];
  };
  referenceMeta: {
    airportsCount: number;
    countriesCount: number;
    citiesCount: number;
    aircraftTypesCount: number;
    aircraftCount: number;
    operatorsCount: number;
    providersCount: number;
    countryRulesCount: number;
    icaoRulesCount: number;
    docTemplatesCount: number;
    pricelistCount: number;
  };
}

export async function exportBackup(): Promise<BackupData> {
  const [trips, legs, stops, services, comms, persons, docs, audit, invoices] = await Promise.all([
    getTrips(), getLegs(), getStops(), getServices(), getComms(), getPersonRoster(), getDocs(), getAudit(), getInvoices(),
  ]);
  return {
    version: '2.0.0',
    exportedAt: new Date().toISOString(),
    transactions: {
      trips,
      legs,
      stops,
      services,
      comms,
      audit,
      persons,
      docs,
      invoices,
    },
    referenceMeta: {
      airportsCount: refAirports.length,
      countriesCount: refCountries.length,
      citiesCount: refCities.length,
      aircraftTypesCount: refAircraftTypes.length,
      aircraftCount: refAircraft.length,
      operatorsCount: refOperators.length,
      providersCount: refProviders.length,
      countryRulesCount: refCountryRules.length,
      icaoRulesCount: refICaoRules.length,
      docTemplatesCount: refDocTemplates.length,
      pricelistCount: refPricelist.length,
    },
  };
}

export async function downloadBackup(): Promise<void> {
  const data = await exportBackup();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `viq-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Reference Data Cache (API-backed, populated once at app boot) ──────────
// getAircraftList/getProviderList/getAirportList/getCountryList below stay
// synchronous — every existing caller (TripDetail, NewTripWizard, AdminTrips,
// ComposerPage, ComposeDrawer, emailTemplates, TripsPage, LandingPage,
// AdminAssets, and this file's own getAircraft/getCountry/getProvider/
// getAirport lookups) calls them inline/in JSX and none of that changes.
// Layout.tsx awaits preloadReferenceData() once before rendering any route,
// so by the time a page can render, the cache is populated. If a caller
// somehow runs before that (shouldn't happen in normal use), the getters
// fall back to the static JSON baseline rather than returning nothing.
let _aircraftCache: Aircraft[] | null = null;
let _providerCache: Provider[] | null = null;
let _airportCache: Airport[] | null = null;
let _countryCache: Country[] | null = null;
let _operatorCache: Operator[] | null = null;
let _clientCache: Client[] | null = null;
let _messageTemplateCache: MessageTemplateOverride[] | null = null;
let _countryFeeCache: CountryFee[] | null = null;
let _countryRuleCache: CountryRule[] | null = null;

export interface MessageTemplateOverride {
  ID: number;
  CountryISO2: string;
  TemplateType: string;
  Subject: string;
  Body: string;
  UpdatedBy?: string;
  UpdatedAtZ: string;
}

// Government/regulatory fee schedule (overfly permit fee, landing permit
// fee, VSAT, NAFISAT, ASECNA, nav fees, CAA fees, etc.) — parallel to
// PriceItem (a provider's price list) but scoped to a country instead of a
// provider. Feeds generateInvoiceFromTrip as additional line items.
export interface CountryFee {
  ID: number;
  CountryISO2: string;
  FeeType: string;
  Amount: number;
  Currency: string;
  Unit?: string;
  Notes?: string;
}

function mapAircraftFromApi(a: any): Aircraft {
  // Mirrors resolveAircraftInstance's override-then-type-default-then-fallback
  // logic (above) — same rule, API shape instead of JSON shape.
  return {
    Registration: a.registration,
    ICAOType: a.icaoType,
    Manufacturer: a.manufacturerOverride || a.type?.manufacturer || 'Unknown',
    MTOW_kg: a.mtowOverrideKg || a.type?.mtowKg || 0,
    NoiseCert: a.noiseCertOverride || a.type?.noiseCert || 'Unknown',
    SerialNumber: a.serialNumber ?? undefined,
    CurrentOperatorID: a.currentOperatorId,
    Colors: a.colors ?? undefined,
    OperationType: a.operationType ?? undefined,
    MaxRangeOverrideNm: a.maxRangeOverrideNm ?? undefined,
    FuelBurnOverrideKgPerHour: a.fuelBurnOverrideKgPerHour ?? undefined,
  };
}

function mapOperatorFromApi(o: any): Operator {
  return {
    OperatorID: o.operatorId,
    Name: o.name,
    Type: o.type ?? '',
    Address: o.address ?? '',
    Fleet: o.fleet ?? [],
    PrimaryContact: o.primaryContact ?? '',
    BillingAddress: o.billingAddress ?? '',
    PaymentTerms: o.paymentTerms ?? '',
    Status: o.status ?? 'Active',
    Notes: o.notes ?? '',
    Channels: mapChannelsFromApi(o.channels),
  };
}

function mapMessageTemplateFromApi(m: any): MessageTemplateOverride {
  return {
    ID: m.id,
    CountryISO2: m.countryIso2,
    TemplateType: m.templateType,
    Subject: m.subject,
    Body: m.body,
    UpdatedBy: m.updatedBy ?? undefined,
    UpdatedAtZ: m.updatedAtZ,
  };
}

function mapCountryFeeFromApi(f: any): CountryFee {
  return {
    ID: f.id,
    CountryISO2: f.countryIso2,
    FeeType: f.feeType,
    Amount: f.amount,
    Currency: f.currency ?? 'USD',
    Unit: f.unit ?? undefined,
    Notes: f.notes ?? undefined,
  };
}

function mapCountryRuleFromApi(r: any): CountryRule {
  return {
    ID: r.id,
    CountryISO2: r.countryIso2,
    ServiceType: r.serviceType,
    LeadTimeHours: r.leadTimeHours,
    WorkingDaysOnly: r.workingDaysOnly,
    ToleranceHours: r.toleranceHours,
    ExceptionAirports: r.exceptionAirports ?? [],
    DocsRequired: r.docsRequired ?? [],
    Notes: r.notes ?? undefined,
  };
}

function mapProviderFromApi(p: any): Provider {
  return {
    ProviderID: p.providerId,
    Name: p.name,
    ServiceTypes: p.serviceTypes,
    ScopeType: p.scopeType,
    Scope: p.scope,
    WorkingHoursZ: p.workingHoursZ ?? '',
    Channels: mapChannelsFromApi(p.channels),
  };
}

function mapAirportFromApi(a: any): Airport {
  return {
    ICAO: a.icao,
    IATA: a.iata ?? '',
    Name: a.name,
    City: a.city ?? '',
    CountryISO2: a.countryIso2,
    TZ: a.tz ?? '',
    Latitude: a.latitude,
    Longitude: a.longitude,
    ElevationFt: a.elevationFt ?? 0,
    RunwayLengthFt: a.runwayLengthFt ?? 0,
    Category: a.category ?? 'Unclassified',
    FBOCount: a.fboCount ?? 0,
  };
}

function mapCountryFromApi(c: any): Country {
  return {
    Name: c.name,
    ISO2: c.iso2,
    Region: c.region ?? '',
    OverflightPermitRequired: c.overflightPermitRequired,
    LandingPermitRequired: c.landingPermitRequired,
    AOCDocsRequired: c.aocDocsRequired,
    EscalationContact: c.escalationContact ?? '',
    CentroidLat: c.centroidLat,
    CentroidLng: c.centroidLng,
  };
}

export async function preloadReferenceData(): Promise<void> {
  const [aircraft, providers, airports, countries, operators, messageTemplates, countryFees, countryRules, clients, permitAuthorizations] = await Promise.all([
    apiJson<any[]>('/reference/aircraft'),
    apiJson<any[]>('/reference/providers'),
    apiJson<any[]>('/reference/airports'),
    apiJson<any[]>('/reference/countries'),
    apiJson<any[]>('/reference/operators'),
    apiJson<any[]>('/message-templates'),
    apiJson<any[]>('/reference/country-fees'),
    apiJson<any[]>('/reference/country-rules'),
    apiJson<any[]>('/clients'),
    apiJson<any[]>('/permit-authorizations'),
  ]);
  _aircraftCache = aircraft.map(mapAircraftFromApi);
  _providerCache = providers.map(mapProviderFromApi);
  _airportCache = airports.map(mapAirportFromApi);
  _countryCache = countries.map(mapCountryFromApi);
  _operatorCache = operators.map(mapOperatorFromApi);
  _messageTemplateCache = messageTemplates.map(mapMessageTemplateFromApi);
  _countryFeeCache = countryFees.map(mapCountryFeeFromApi);
  _countryRuleCache = countryRules.map(mapCountryRuleFromApi);
  _clientCache = clients.map(mapClientFromApi);
  _permitAuthorizationCache = permitAuthorizations.map(mapPermitAuthorizationFromApi);
}

// ─── Reference Data CRUD (editable via Admin > Assets) ───────────────────────
// Static refAircraft/refProviders/refAirports/refCountries above remain the
// JSON baseline; these functions overlay user edits in localStorage on top of
// that baseline, the same getTx/setTx pattern used for transactional data.

export function getAircraftList(): Aircraft[] {
  return _aircraftCache ?? refAircraft;
}

export async function saveAircraft(ac: Aircraft, user = currentUser()): Promise<Aircraft> {
  const exists = getAircraftList().some((a) => a.Registration === ac.Registration);
  // Manufacturer/MTOW_kg/NoiseCert are edited as plain fields in the dialog
  // but must be written as per-tail overrides — never mutate the shared
  // AircraftType row.
  const body = JSON.stringify({
    registration: ac.Registration,
    icaoType: ac.ICAOType,
    manufacturerOverride: ac.Manufacturer,
    mtowOverrideKg: ac.MTOW_kg,
    noiseCertOverride: ac.NoiseCert,
    serialNumber: ac.SerialNumber,
    currentOperatorId: ac.CurrentOperatorID,
    colors: ac.Colors,
    operationType: ac.OperationType,
    maxRangeOverrideNm: ac.MaxRangeOverrideNm,
    fuelBurnOverrideKgPerHour: ac.FuelBurnOverrideKgPerHour,
    user,
  });
  const row = exists
    ? await apiJson<any>(`/reference/aircraft/${ac.Registration}`, { method: 'PATCH', body })
    : await apiJson<any>('/reference/aircraft', { method: 'POST', body });
  const mapped = mapAircraftFromApi(row);
  const list = getAircraftList();
  const idx = list.findIndex((a) => a.Registration === mapped.Registration);
  _aircraftCache = idx >= 0
    ? list.map((a, i) => (i === idx ? mapped : a))
    : [...list, mapped];
  return mapped;
}

export async function deleteAircraft(registration: string, user = currentUser()): Promise<void> {
  await apiJson(`/reference/aircraft/${registration}?user=${encodeURIComponent(user)}`, { method: 'DELETE' });
  _aircraftCache = getAircraftList().filter((a) => a.Registration !== registration);
}

export function getProviderList(): Provider[] {
  return _providerCache ?? refProviders;
}

export async function saveProvider(p: Provider, user = currentUser()): Promise<Provider> {
  const exists = getProviderList().some((x) => x.ProviderID === p.ProviderID);
  const body = JSON.stringify({
    providerId: p.ProviderID,
    name: p.Name,
    serviceTypes: p.ServiceTypes,
    scopeType: p.ScopeType,
    scope: p.Scope,
    workingHoursZ: p.WorkingHoursZ,
    channels: (p.Channels ?? []).map((c) => ({ channelType: c.ChannelType, value: c.Value, label: c.Label, preferred: c.Preferred, forBilling: c.ForBilling })),
    user,
  });
  const row = exists
    ? await apiJson<any>(`/reference/providers/${p.ProviderID}`, { method: 'PATCH', body })
    : await apiJson<any>('/reference/providers', { method: 'POST', body });
  const mapped = mapProviderFromApi(row);
  const list = getProviderList();
  const idx = list.findIndex((x) => x.ProviderID === mapped.ProviderID);
  _providerCache = idx >= 0
    ? list.map((x, i) => (i === idx ? mapped : x))
    : [...list, mapped];
  return mapped;
}

export async function deleteProvider(providerId: string, user = currentUser()): Promise<void> {
  await apiJson(`/reference/providers/${providerId}?user=${encodeURIComponent(user)}`, { method: 'DELETE' });
  _providerCache = getProviderList().filter((p) => p.ProviderID !== providerId);
}

export function getAirportList(): Airport[] {
  return _airportCache ?? refAirports;
}

export async function saveAirport(a: Airport, user = currentUser()): Promise<Airport> {
  const exists = getAirportList().some((x) => x.ICAO === a.ICAO);
  const body = JSON.stringify({
    icao: a.ICAO,
    iata: a.IATA,
    name: a.Name,
    city: a.City,
    countryIso2: a.CountryISO2,
    tz: a.TZ,
    latitude: a.Latitude,
    longitude: a.Longitude,
    elevationFt: a.ElevationFt,
    runwayLengthFt: a.RunwayLengthFt,
    category: a.Category,
    fboCount: a.FBOCount,
    user,
  });
  const row = exists
    ? await apiJson<any>(`/reference/airports/${a.ICAO}`, { method: 'PATCH', body })
    : await apiJson<any>('/reference/airports', { method: 'POST', body });
  const mapped = mapAirportFromApi(row);
  const list = getAirportList();
  const idx = list.findIndex((x) => x.ICAO === mapped.ICAO);
  _airportCache = idx >= 0
    ? list.map((x, i) => (i === idx ? mapped : x))
    : [...list, mapped];
  return mapped;
}

export async function deleteAirport(icao: string, user = currentUser()): Promise<void> {
  await apiJson(`/reference/airports/${icao}?user=${encodeURIComponent(user)}`, { method: 'DELETE' });
  _airportCache = getAirportList().filter((a) => a.ICAO !== icao);
}

export function getCountryList(): Country[] {
  return _countryCache ?? refCountries;
}

export function getOperatorList(): Operator[] {
  return _operatorCache ?? refOperators;
}

export async function saveCountry(c: Country, user = currentUser()): Promise<Country> {
  const exists = getCountryList().some((x) => x.ISO2 === c.ISO2);
  // CountryDialog only edits these 8 fields — ciqRequired/subRegion/
  // caaWebsite/iso3/notes are deliberately omitted from this payload so
  // PATCH's partial-update semantics leave them untouched on the server.
  const body = JSON.stringify({
    iso2: c.ISO2,
    name: c.Name,
    region: c.Region,
    centroidLat: c.CentroidLat,
    centroidLng: c.CentroidLng,
    overflightPermitRequired: c.OverflightPermitRequired,
    landingPermitRequired: c.LandingPermitRequired,
    aocDocsRequired: c.AOCDocsRequired,
    escalationContact: c.EscalationContact,
    user,
  });
  const row = exists
    ? await apiJson<any>(`/reference/countries/${c.ISO2}`, { method: 'PATCH', body })
    : await apiJson<any>('/reference/countries', { method: 'POST', body });
  const mapped = mapCountryFromApi(row);
  const list = getCountryList();
  const idx = list.findIndex((x) => x.ISO2 === mapped.ISO2);
  _countryCache = idx >= 0
    ? list.map((x, i) => (i === idx ? mapped : x))
    : [...list, mapped];
  return mapped;
}

export async function deleteCountry(iso2: string, user = currentUser()): Promise<void> {
  await apiJson(`/reference/countries/${iso2}?user=${encodeURIComponent(user)}`, { method: 'DELETE' });
  _countryCache = getCountryList().filter((c) => c.ISO2 !== iso2);
}

// ─── Reference Lookups ────────────────────────────────────────────────────────

export function getAirport(icao: string): Airport | undefined {
  return getAirportList().find((a) => a.ICAO === icao);
}

export function getCountry(iso2: string): Country | undefined {
  return getCountryList().find((c) => c.ISO2 === iso2);
}

export function getAircraftType(icaoType: string): AircraftType | undefined {
  return refAircraftTypes.find((t) => t.ICAOType === icaoType);
}

export function getAircraft(reg: string): (Aircraft & { TypeInfo?: AircraftType }) | undefined {
  const ac = getAircraftList().find((a) => a.Registration === reg);
  if (!ac) return undefined;
  const typeInfo = getAircraftType(ac.ICAOType);
  return { ...ac, TypeInfo: typeInfo };
}

export function getOperator(id: string): Operator | undefined {
  return getOperatorList().find((o) => o.OperatorID === id);
}

export async function saveOperator(o: Operator, user = currentUser()): Promise<Operator> {
  const exists = getOperatorList().some((x) => x.OperatorID === o.OperatorID);
  const body = JSON.stringify({
    operatorId: o.OperatorID,
    name: o.Name,
    type: o.Type,
    address: o.Address,
    primaryContact: o.PrimaryContact,
    billingAddress: o.BillingAddress,
    paymentTerms: o.PaymentTerms,
    status: o.Status,
    notes: o.Notes,
    channels: (o.Channels ?? []).map((c) => ({ channelType: c.ChannelType, value: c.Value, label: c.Label, preferred: c.Preferred, forBilling: c.ForBilling })),
    user,
  });
  const row = exists
    ? await apiJson<any>(`/reference/operators/${o.OperatorID}`, { method: 'PATCH', body })
    : await apiJson<any>('/reference/operators', { method: 'POST', body });
  const mapped = mapOperatorFromApi(row);
  const list = getOperatorList();
  const idx = list.findIndex((x) => x.OperatorID === mapped.OperatorID);
  _operatorCache = idx >= 0
    ? list.map((x, i) => (i === idx ? mapped : x))
    : [...list, mapped];
  return mapped;
}

export async function deleteOperator(operatorId: string, user = currentUser()): Promise<void> {
  await apiJson(`/reference/operators/${operatorId}?user=${encodeURIComponent(user)}`, { method: 'DELETE' });
  _operatorCache = getOperatorList().filter((o) => o.OperatorID !== operatorId);
}

export function getPermitAuthorizationList(): PermitAuthorization[] {
  return _permitAuthorizationCache ?? [];
}

export async function savePermitAuthorization(
  a: Omit<PermitAuthorization, 'ID' | 'Status' | 'CreatedAt' | 'CreatedBy' | 'VerifiedBy' | 'VerifiedAt'> & { ID?: string },
  user = currentUser(),
): Promise<PermitAuthorization> {
  const body = JSON.stringify({
    operatorId: a.OperatorID,
    countryIso2: a.CountryISO2,
    serviceType: a.ServiceType,
    authorizationType: a.AuthorizationType,
    referenceNumber: a.ReferenceNumber,
    validFrom: a.ValidFrom,
    validUntil: a.ValidUntil,
    docId: a.DocID,
    notes: a.Notes,
    user,
  });
  const row = a.ID
    ? await apiJson<any>(`/permit-authorizations/${a.ID}`, { method: 'PATCH', body })
    : await apiJson<any>('/permit-authorizations', { method: 'POST', body });
  const mapped = mapPermitAuthorizationFromApi(row);
  const list = getPermitAuthorizationList();
  const idx = list.findIndex((x) => x.ID === mapped.ID);
  _permitAuthorizationCache = idx >= 0 ? list.map((x, i) => (i === idx ? mapped : x)) : [...list, mapped];
  return mapped;
}

export async function verifyPermitAuthorization(id: string, user = currentUser()): Promise<PermitAuthorization> {
  const row = await apiJson<any>(`/permit-authorizations/${id}/verify?user=${encodeURIComponent(user)}`, { method: 'POST' });
  const mapped = mapPermitAuthorizationFromApi(row);
  const list = getPermitAuthorizationList();
  _permitAuthorizationCache = list.map((x) => (x.ID === mapped.ID ? mapped : x));
  return mapped;
}

export async function revokePermitAuthorization(id: string, user = currentUser()): Promise<PermitAuthorization> {
  const row = await apiJson<any>(`/permit-authorizations/${id}/revoke?user=${encodeURIComponent(user)}`, { method: 'POST' });
  const mapped = mapPermitAuthorizationFromApi(row);
  const list = getPermitAuthorizationList();
  _permitAuthorizationCache = list.map((x) => (x.ID === mapped.ID ? mapped : x));
  return mapped;
}

export async function getServiceAuthorizationCandidates(svcId: string): Promise<AuthorizationCandidate[]> {
  const rows = await apiJson<any[]>(`/services/${svcId}/authorization-candidates`);
  return rows.map((r) => ({
    Authorization: mapPermitAuthorizationFromApi(r.authorization),
    Eligible: r.eligible,
    Reason: r.reason ?? undefined,
  }));
}

export async function linkServiceAuthorization(svcId: string, authorizationId: string, version: number, user = currentUser()): Promise<Service> {
  const row = await apiJson<any>(`/services/${svcId}/link-authorization`, {
    method: 'PATCH',
    body: JSON.stringify({ authorizationId, version, user }),
  });
  return mapServiceFromApi(row);
}

function mapClientFromApi(c: any): Client {
  return {
    ClientID: c.clientId,
    Name: c.name,
    IsOperator: c.isOperator ?? false,
    LinkedOperatorID: c.linkedOperatorId ?? undefined,
    BillingAddressLine1: c.billingAddressLine1 ?? undefined,
    BillingAddressLine2: c.billingAddressLine2 ?? undefined,
    BillingCity: c.billingCity ?? undefined,
    BillingState: c.billingState ?? undefined,
    BillingPostalCode: c.billingPostalCode ?? undefined,
    BillingCountry: c.billingCountry ?? undefined,
    Notes: c.notes ?? undefined,
    Channels: mapChannelsFromApi(c.channels),
  };
}

function mapPermitAuthorizationFromApi(a: any): PermitAuthorization {
  return {
    ID: a.id,
    OperatorID: a.operatorId,
    CountryISO2: a.countryIso2,
    ServiceType: a.serviceType,
    AuthorizationType: a.authorizationType,
    ReferenceNumber: a.referenceNumber,
    ValidFrom: a.validFrom,
    ValidUntil: a.validUntil,
    Status: a.status,
    DocID: a.docId ?? undefined,
    Notes: a.notes ?? undefined,
    CreatedAt: a.createdAt,
    CreatedBy: a.createdBy,
    VerifiedBy: a.verifiedBy ?? undefined,
    VerifiedAt: a.verifiedAt ?? undefined,
  };
}

let _permitAuthorizationCache: PermitAuthorization[] | null = null;

export function getClientList(): Client[] {
  return _clientCache ?? [];
}

export async function saveClient(c: Client, user = currentUser()): Promise<Client> {
  const exists = getClientList().some((x) => x.ClientID === c.ClientID);
  const body = JSON.stringify({
    clientId: c.ClientID,
    name: c.Name,
    isOperator: c.IsOperator,
    linkedOperatorId: c.LinkedOperatorID || undefined,
    billingAddressLine1: c.BillingAddressLine1 || undefined,
    billingAddressLine2: c.BillingAddressLine2 || undefined,
    billingCity: c.BillingCity || undefined,
    billingState: c.BillingState || undefined,
    billingPostalCode: c.BillingPostalCode || undefined,
    billingCountry: c.BillingCountry || undefined,
    notes: c.Notes || undefined,
    channels: (c.Channels ?? []).map((ch) => ({ channelType: ch.ChannelType, value: ch.Value, label: ch.Label, preferred: ch.Preferred, forBilling: ch.ForBilling })),
    user,
  });
  const row = exists
    ? await apiJson<any>(`/clients/${c.ClientID}`, { method: 'PATCH', body })
    : await apiJson<any>('/clients', { method: 'POST', body });
  const mapped = mapClientFromApi(row);
  const list = getClientList();
  const idx = list.findIndex((x) => x.ClientID === mapped.ClientID);
  _clientCache = idx >= 0
    ? list.map((x, i) => (i === idx ? mapped : x))
    : [...list, mapped];
  return mapped;
}

export async function deleteClient(clientId: string, user = currentUser()): Promise<void> {
  await apiJson(`/clients/${clientId}?user=${encodeURIComponent(user)}`, { method: 'DELETE' });
  _clientCache = getClientList().filter((c) => c.ClientID !== clientId);
}

// Live server search (not the boot cache above) — used by the New Trip
// wizard's client typeahead so it also finds clients created after boot.
export async function searchClients(query: string): Promise<Client[]> {
  if (!query.trim()) return [];
  const rows = await apiJson<any[]>(`/clients?search=${encodeURIComponent(query.trim())}`);
  return rows.map(mapClientFromApi);
}

// Users directory — minimal display-name fields, reachable by any
// authenticated role (unlike getUsers(), which is Admin-only). Powers the
// Trip Owner typeahead (Item 14). Always a fresh fetch, no cache.
export async function getUserDirectory(search?: string): Promise<UserDirectoryEntry[]> {
  const params = search ? `?search=${encodeURIComponent(search.trim())}` : '';
  const rows = await apiJson<any[]>(`/users/directory${params}`);
  return rows.map((u: any) => ({
    ID: u.id, Username: u.username, FirstName: u.firstName ?? undefined, LastName: u.lastName ?? undefined, Team: u.team ?? undefined,
  }));
}

// ─── App Branding (Item 11) — GET is public server-side (no auth header
// needed for the landing/login pages or a browser's own favicon request);
// PATCH/logo/favicon uploads are Admin-only, enforced server-side. ───────────

function mapSettingsFromApi(s: any): AppSettings {
  return {
    AppName: s.appName || 'VIQ',
    Tagline: s.tagline ?? undefined,
    SeoTitle: s.seoTitle ?? undefined,
    SeoDescription: s.seoDescription ?? undefined,
    SeoKeywords: s.seoKeywords ?? undefined,
    Domain: s.domain ?? undefined,
    Subdomains: s.subdomains ?? [],
    HasLogo: !!s.logoPath,
    HasFavicon: !!s.faviconPath,
  };
}

export async function getSettings(): Promise<AppSettings> {
  const row = await apiJson<any>('/settings');
  return mapSettingsFromApi(row);
}

export async function saveSettings(patch: {
  appName?: string; tagline?: string; seoTitle?: string; seoDescription?: string;
  seoKeywords?: string; domain?: string; subdomains?: string[];
}, user = currentUser()): Promise<AppSettings> {
  const row = await apiJson<any>('/settings', { method: 'PATCH', body: JSON.stringify({ ...patch, user }) });
  return mapSettingsFromApi(row);
}

async function uploadBrandingImage(kind: 'logo' | 'favicon', file: File, user = currentUser()): Promise<AppSettings> {
  const form = new FormData();
  form.append('file', file);
  form.append('user', user);
  const res = await apiFetch(`/settings/${kind}`, { method: 'POST', body: form });
  if (!res.ok) throw new Error(`Upload failed: ${res.status} ${await res.text().catch(() => '')}`);
  return mapSettingsFromApi(await res.json());
}

export const uploadLogo = (file: File, user = currentUser()) => uploadBrandingImage('logo', file, user);
export const uploadFavicon = (file: File, user = currentUser()) => uploadBrandingImage('favicon', file, user);

// Public routes (no auth header needed), so a direct URL works for
// <img src>/<link href> — cache-busted so a fresh upload actually replaces
// the browser's cached copy of the previous file at the same path.
export function logoUrl(): string {
  return `/api/settings/logo/file?v=${Date.now()}`;
}
export function faviconUrl(): string {
  return `/api/settings/favicon/file?v=${Date.now()}`;
}

// Applies branding to the document — title, favicon, and SEO meta tags.
// Called once at app boot (App.tsx), regardless of auth state, since the
// public landing/login pages need this before any login happens.
export async function applyBranding(): Promise<void> {
  let settings: AppSettings;
  try {
    settings = await getSettings();
  } catch {
    return; // Branding is cosmetic — never block app boot on this failing.
  }
  document.title = settings.SeoTitle || settings.AppName;
  const setMeta = (name: string, content?: string) => {
    if (!content) return;
    let tag = document.querySelector(`meta[name="${name}"]`);
    if (!tag) {
      tag = document.createElement('meta');
      tag.setAttribute('name', name);
      document.head.appendChild(tag);
    }
    tag.setAttribute('content', content);
  };
  setMeta('description', settings.SeoDescription);
  setMeta('keywords', settings.SeoKeywords);

  if (settings.HasFavicon) {
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = faviconUrl();
  }
}

export function getMessageTemplateList(): MessageTemplateOverride[] {
  return _messageTemplateCache ?? [];
}

// The one function emailTemplates.ts calls — pure/synchronous, reads the
// already-cached list (populated by preloadReferenceData at app boot).
// Returns undefined when no override exists for this country/type pair,
// meaning the caller should fall back to its own default template.
export function getMessageTemplateOverride(countryIso2: string | null | undefined, templateType: string): MessageTemplateOverride | undefined {
  if (!countryIso2) return undefined;
  return getMessageTemplateList().find((t) => t.CountryISO2 === countryIso2 && t.TemplateType === templateType);
}

export async function saveMessageTemplate(
  t: { ID?: number; CountryISO2: string; TemplateType: string; Subject: string; Body: string },
  user = currentUser()
): Promise<MessageTemplateOverride> {
  const body = JSON.stringify({
    countryIso2: t.CountryISO2,
    templateType: t.TemplateType,
    subject: t.Subject,
    body: t.Body,
    user,
  });
  const row = t.ID
    ? await apiJson<any>(`/message-templates/${t.ID}`, { method: 'PATCH', body })
    : await apiJson<any>('/message-templates', { method: 'POST', body });
  const mapped = mapMessageTemplateFromApi(row);
  const list = getMessageTemplateList();
  const idx = list.findIndex((x) => x.ID === mapped.ID);
  _messageTemplateCache = idx >= 0
    ? list.map((x, i) => (i === idx ? mapped : x))
    : [...list, mapped];
  return mapped;
}

export async function deleteMessageTemplate(id: number, user = currentUser()): Promise<void> {
  await apiJson(`/message-templates/${id}?user=${encodeURIComponent(user)}`, { method: 'DELETE' });
  _messageTemplateCache = getMessageTemplateList().filter((t) => t.ID !== id);
}

export function getCountryFeeList(): CountryFee[] {
  return _countryFeeCache ?? [];
}

export function getCountryFeesForCountry(iso2: string): CountryFee[] {
  return getCountryFeeList().filter((f) => f.CountryISO2 === iso2);
}

export async function saveCountryFee(
  f: { ID?: number; CountryISO2: string; FeeType: string; Amount: number; Currency?: string; Unit?: string; Notes?: string },
  user = currentUser()
): Promise<CountryFee> {
  const body = JSON.stringify({
    countryIso2: f.CountryISO2,
    feeType: f.FeeType,
    amount: f.Amount,
    currency: f.Currency,
    unit: f.Unit,
    notes: f.Notes,
    user,
  });
  const row = f.ID
    ? await apiJson<any>(`/reference/country-fees/${f.ID}`, { method: 'PATCH', body })
    : await apiJson<any>('/reference/country-fees', { method: 'POST', body });
  const mapped = mapCountryFeeFromApi(row);
  const list = getCountryFeeList();
  const idx = list.findIndex((x) => x.ID === mapped.ID);
  _countryFeeCache = idx >= 0
    ? list.map((x, i) => (i === idx ? mapped : x))
    : [...list, mapped];
  return mapped;
}

export async function deleteCountryFee(id: number, user = currentUser()): Promise<void> {
  await apiJson(`/reference/country-fees/${id}?user=${encodeURIComponent(user)}`, { method: 'DELETE' });
  _countryFeeCache = getCountryFeeList().filter((f) => f.ID !== id);
}

export function getCountryRuleList(): CountryRule[] {
  return _countryRuleCache ?? [];
}

export async function saveCountryRule(
  r: { ID?: number; CountryISO2: string; ServiceType: string; LeadTimeHours: number; WorkingDaysOnly?: boolean; ToleranceHours?: number; ExceptionAirports?: string[]; DocsRequired?: string[]; Notes?: string },
  user = currentUser()
): Promise<CountryRule> {
  const body = JSON.stringify({
    countryIso2: r.CountryISO2,
    serviceType: r.ServiceType,
    leadTimeHours: r.LeadTimeHours,
    workingDaysOnly: r.WorkingDaysOnly,
    toleranceHours: r.ToleranceHours,
    exceptionAirports: r.ExceptionAirports,
    docsRequired: r.DocsRequired,
    notes: r.Notes,
    user,
  });
  const row = r.ID
    ? await apiJson<any>(`/reference/country-rules/${r.ID}`, { method: 'PATCH', body })
    : await apiJson<any>('/reference/country-rules', { method: 'POST', body });
  const mapped = mapCountryRuleFromApi(row);
  const list = getCountryRuleList();
  const idx = list.findIndex((x) => x.ID === mapped.ID);
  _countryRuleCache = idx >= 0
    ? list.map((x, i) => (i === idx ? mapped : x))
    : [...list, mapped];
  return mapped;
}

export async function deleteCountryRule(id: number, user = currentUser()): Promise<void> {
  await apiJson(`/reference/country-rules/${id}?user=${encodeURIComponent(user)}`, { method: 'DELETE' });
  _countryRuleCache = getCountryRuleList().filter((r) => r.ID !== id);
}

// ─── Users (Admin only — backend enforces via RolesGuard) ──────────────────

function mapUserFromApi(u: any): AppUser {
  return {
    ID: u.id,
    Username: u.username,
    Role: u.role,
    Active: u.active,
    CreatedAt: u.createdAt,
    FirstName: u.firstName ?? undefined,
    MiddleName: u.middleName ?? undefined,
    LastName: u.lastName ?? undefined,
    Email: u.email ?? undefined,
    Phone: u.phone ?? undefined,
    Team: u.team ?? undefined,
    Company: u.company ?? undefined,
    Designation: u.designation ?? undefined,
  };
}

export async function getUsers(): Promise<AppUser[]> {
  const rows = await apiJson<any[]>('/users');
  return rows.map(mapUserFromApi);
}

export async function saveUser(user: {
  id?: string; username: string; password?: string; role: string; active?: boolean;
  firstName?: string; lastName?: string; middleName?: string; email?: string;
  phone?: string; team?: string; company?: string; designation?: string;
}): Promise<AppUser> {
  const body = JSON.stringify(user);
  const row = user.id
    ? await apiJson<any>(`/users/${user.id}`, { method: 'PATCH', body })
    : await apiJson<any>('/users', { method: 'POST', body });
  return mapUserFromApi(row);
}

// trip.BillToAddress is an explicit override; when unset, falls back to the
// billing address of the operator linked to the trip's assigned aircraft
// (billingAddress, then address, since not every operator record fills in
// a separate billing address). Pure/synchronous — both lists it reads are
// already cached by the time any page can render (see preloadReferenceData).
export function resolveBillToAddress(trip: Trip): string | undefined {
  if (trip.BillToAddress) return trip.BillToAddress;
  const aircraft = getAircraftList().find((a) => a.Registration === trip.Registration);
  if (!aircraft) return undefined;
  const operator = getOperatorList().find((o) => o.OperatorID === aircraft.CurrentOperatorID);
  if (!operator) return undefined;
  return operator.BillingAddress || operator.Address || undefined;
}

export function getProvider(id: string): Provider | undefined {
  return getProviderList().find((p) => p.ProviderID === id);
}

export function getCallSign(leg: Leg, registration: string): string {
  if (leg.CallSign && leg.CallSign.trim()) return leg.CallSign;
  return registration || 'N/A';
}

export function getICaoRule(icao: string): ICAORule | undefined {
  return refICaoRules.find((r) => r.ICAO === icao);
}

export function getPrice(providerId: string, serviceType: string): PriceItem | undefined {
  return refPricelist.find((p) => p.ProviderID === providerId && p.ServiceType === serviceType);
}

// ─── Invoice Generation ─────────────────────────────────────────────────────

export async function generateInvoiceFromTrip(tripId: string, user = currentUser()): Promise<Invoice | null> {
  const trip = await getTrip(tripId);
  if (!trip) return null;

  const allServices = await getServicesForTrip(tripId);
  const services = allServices.filter((s) => s.Status === 'Confirmed');
  if (services.length === 0) return null;

  const lineItems: InvoiceLineItem[] = [];
  let subtotal = 0;

  for (const svc of services) {
    const price = svc.ProviderID ? getPrice(svc.ProviderID, svc.ServiceType) : undefined;
    const unitPrice = price?.Price ?? 0;
    const qty = svc.ServiceType === 'Fuel' ? 1 : svc.ServiceType === 'Catering' ? 1 : 1;
    const total = unitPrice * qty;
    subtotal += total;

    lineItems.push({
      LineID: `LI-${svc.SVCID}`,
      SVCID: svc.SVCID,
      Description: `${svc.ServiceType}${svc.RefNumber ? ` (Ref: ${svc.RefNumber})` : ''} — ${svc.Notes || ''}`,
      Quantity: qty,
      Unit: price?.Unit || 'each',
      UnitPrice: unitPrice,
      Total: total,
      ProviderID: svc.ProviderID,
    });

    // Government/regulatory fees (overfly, landing, VSAT, NAFISAT, ASECNA,
    // nav, CAA, etc.) compliment the vendor-price line above — one country
    // fee schedule can produce several additional line items per service.
    if (svc.CountryISO2) {
      for (const fee of getCountryFeesForCountry(svc.CountryISO2)) {
        const feeTotal = fee.Amount * qty;
        subtotal += feeTotal;
        lineItems.push({
          LineID: `LI-${svc.SVCID}-FEE-${fee.ID}`,
          SVCID: svc.SVCID,
          Description: `${fee.FeeType} (${svc.CountryISO2})${fee.Notes ? ` — ${fee.Notes}` : ''}`,
          Quantity: qty,
          Unit: fee.Unit || 'each',
          UnitPrice: fee.Amount,
          Total: feeTotal,
          ProviderID: null,
        });
      }
    }
  }

  const taxRate = 0;
  const taxAmount = subtotal * taxRate;
  const total = subtotal + taxAmount;

  const invoice: Invoice = {
    InvoiceID: `INV-${tripId}-${Date.now().toString(36).toUpperCase()}`,
    TripID: tripId,
    Status: 'Draft',
    IssueDateZ: new Date().toISOString(),
    DueDateZ: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    LineItems: lineItems,
    Subtotal: subtotal,
    TaxRate: taxRate,
    TaxAmount: taxAmount,
    Total: total,
    Currency: 'USD',
    SentTo: '',
    Notes: `Auto-generated from confirmed services for trip ${tripId}`,
    Attachments: [],
    ChangeLog: [
      {
        TimestampZ: new Date().toISOString(),
        User: user,
        Field: 'Created',
        OldValue: '',
        NewValue: 'Draft',
        Reason: 'Auto-populated from confirmed services',
      },
    ],
  };

  return saveInvoice(invoice, user);
}

// ─── QR Code Generator (visual, canvas-based) ───────────────────────────────

export function generateQRCode(data: string): string {
  const size = 200;
  const cells = 25;
  const cellSize = size / cells;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Seedable pseudo-random from string
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    hash = ((hash << 5) - hash + data.charCodeAt(i)) | 0;
  }
  const rng = () => {
    hash = (hash * 16807 + 0) % 2147483647;
    return (hash & 0x7fffffff) / 0x7fffffff;
  };

  // White background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);

  // Position detection patterns (corners)
  const drawFinder = (x: number, y: number) => {
    ctx.fillStyle = '#000000';
    ctx.fillRect(x * cellSize, y * cellSize, 7 * cellSize, 7 * cellSize);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect((x + 1) * cellSize, (y + 1) * cellSize, 5 * cellSize, 5 * cellSize);
    ctx.fillStyle = '#000000';
    ctx.fillRect((x + 2) * cellSize, (y + 2) * cellSize, 3 * cellSize, 3 * cellSize);
  };
  drawFinder(0, 0);
  drawFinder(cells - 7, 0);
  drawFinder(0, cells - 7);

  // Data modules
  for (let r = 0; r < cells; r++) {
    for (let c = 0; c < cells; c++) {
      // Skip finder patterns
      if ((r < 8 && c < 8) || (r < 8 && c >= cells - 8) || (r >= cells - 8 && c < 8)) continue;
      if (rng() > 0.5) {
        ctx.fillStyle = '#000000';
        ctx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);
      }
    }
  }

  return canvas.toDataURL('image/png');
}

export function getDocsRequired(countryISO2: string, serviceType: string): string[] {
  const rule = refCountryRules.find(
    (r) => r.CountryISO2 === countryISO2 && r.ServiceType === serviceType
  );
  return rule?.DocsRequired ?? [];
}

// ─── Formatting helpers (ported from seed.ts) ─────────────────────────────────
// House style: dates as DD-Mon-YYYY, date+time as "DD-Mon-YYYY HHMMZ" — always
// UTC, never the viewer's local timezone.

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatDate(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${day}-${MONTHS_SHORT[d.getUTCMonth()]}-${d.getUTCFullYear()}`;
}

export function formatZ(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${formatDate(iso)} ${hh}${mm}Z`;
}

// Strips dashes/spaces and uppercases an aircraft registration (house style:
// N123AB, not N-123-AB).
export function normalizeRegistration(reg: string): string {
  return reg.toUpperCase().replace(/[-\s]/g, '');
}

export function urgencyColor(u: string): string {
  switch (u) {
    case 'BREACH': return 'bg-red-100 text-red-700 border-red-300';
    case 'URGENT': return 'bg-orange-100 text-orange-700 border-orange-300';
    case 'DUE': return 'bg-amber-100 text-amber-700 border-amber-300';
    case 'OK': return 'bg-emerald-100 text-emerald-700 border-emerald-300';
    default: return 'bg-slate-100 text-slate-600';
  }
}

// Higher = more important. Used to sort dashboard service lists so
// BREACH/URGENT items surface before DUE/OK ones, matching urgencyColor's
// same severity ordering.
export function urgencyRank(u: string): number {
  switch (u) {
    case 'BREACH': return 3;
    case 'URGENT': return 2;
    case 'DUE': return 1;
    default: return 0;
  }
}

// Resolves a display-ready country name for a service: country-scoped
// services (Permit/Overflight) use CountryISO2 directly; ICAO-scoped
// services (Handling) resolve their airport's country. Falls back to the
// raw ICAO, or '' if neither is set.
export function serviceCountryName(service: { CountryISO2?: string | null; ICAO?: string }): string {
  if (service.CountryISO2) return getCountry(service.CountryISO2)?.Name ?? service.CountryISO2;
  if (service.ICAO) {
    const airportCountry = getAirport(service.ICAO)?.CountryISO2;
    if (airportCountry) return getCountry(airportCountry)?.Name ?? airportCountry;
    return service.ICAO;
  }
  return '';
}

// ─── Trip Sheet builder ───────────────────────────────────────────────────────

export interface TripSheet {
  trip: Trip;
  legs: LegWithPersons[];
  stops: Stop[];
  services: Service[];
  comms: Comm[];
  persons: TripLegPersonView[];
  docs: DocAttachment[];
}

// Backed by the server's single-query GET /trips/:tripId/sheet (one nested
// Prisma `include`, not six separate fetches) — see trips.service.ts's
// sheet(). Replaces this function's old fan-out of getLegsForTrip/
// getStopsForTrip/etc., two of which (Legs/Stops) used to fetch their whole
// table and filter client-side.
export async function getTripSheet(tripId: string): Promise<TripSheet | null> {
  let raw: any;
  try {
    raw = await apiJson<any>(`/trips/${encodeURIComponent(tripId)}/sheet`);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
  const legs: LegWithPersons[] = raw.legs.map((l: any) => ({
    ...mapLegFromApi(l),
    persons: l.persons.map(mapTripPersonFromApi),
  }));
  const persons: TripLegPersonView[] = legs.flatMap((leg) =>
    leg.persons.map((p) => ({ ...p, LegID: leg.LegID, LegSeq: leg.Seq, LegDepICAO: leg.DepICAO, LegArrICAO: leg.ArrICAO }))
  );
  return {
    trip: mapTripFromApi(raw),
    legs,
    stops: raw.stops.map(mapStopFromApi),
    services: raw.services.map(mapServiceFromApi),
    comms: raw.comms.map(mapCommFromApi),
    docs: raw.docs.map(mapDocFromApi),
    persons,
  };
}
