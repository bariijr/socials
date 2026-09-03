import { useParams, Link } from 'react-router';
import { useState, useEffect, useMemo } from 'react';
import {
  getTripSheet, getAirport, getAirportList, getProvider, getProviderList, getAircraft, getCountry,
  getCountryList, refICaoRules, getCallSign, getAircraftList, getAircraftType, getOperator, formatZ, urgencyColor, statusColor, saveLeg, saveService, deleteService,
  saveTrip, getAudit, getInvoices, computeCountriesOverflown, generateOverflightServices, generateArrivalServices, getServiceTypes, getLegPurposes,
  uploadDoc, downloadDocFile, deleteDoc, runDocOcr,
  getPersonRoster, assignPersonToLeg, assignPersonToAllLegs, unassignPersonFromLeg,
  getClientList, saveClient, getUserDirectory, getPreferredContact,
  ApiError,
} from '@/lib/dataStore';
import { haversineNM } from '@/lib/geo';
import type { Service, Leg, Trip, Comm, AuditEntry, ServiceStatus, ServiceType, ServiceTypeDef, LegPurposeDef, TripPersonView, TripStatus, Person, PersonRole, Provider, ContactChannel } from '@/data/types';
import type { Invoice, TripSheet, Client, UserDirectoryEntry } from '@/lib/dataStore';
import { Typeahead } from '@/components/ui/typeahead';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Plane, ArrowRight, Clock, Users, Briefcase, Mail, AlertTriangle,
  FileText, Radio, MapPin, DollarSign, MessageSquare,
  CheckCircle2, XCircle, HelpCircle, Timer, ChevronDown, ChevronRight,
  Edit3, Save, Plus, Trash2, Send, Building2, Phone, MessageCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Combobox } from '@/components/ui/combobox';
import { ComposeDrawer } from '@/components/ComposeDrawer';
import { DocVerifyDialog } from '@/components/DocVerifyDialog';
import { ConflictDialog } from '@/components/ConflictDialog';
import { useAuth } from '@/lib/authContext';

const SERVICE_STATUSES: ServiceStatus[] = [
  'Not Required', 'Not Started', 'Requested', 'Chasing', 'Confirmed', 'Re-confirm Required', 'Cancelled',
];
const DOC_TYPES = [
  'Registration Certificate', 'Airworthiness Certificate', 'Insurance Certificate',
  'Permit Application Form', 'AOC', 'Noise Certificate', 'PAX List',
  'Crew Licence', 'Medical Certificate', 'Other',
];

// `defs` is the fetched, admin-editable catalog — falls back to the
// pre-catalog "Permit" special case (and the raw code) when defs haven't
// loaded yet or don't contain this code, so this stays safe to call before
// the async fetch resolves.
function serviceLabel(type: string, defs: ServiceTypeDef[] = []): string {
  return defs.find((d) => d.code === type)?.label ?? (type === 'Permit' ? 'Landing Permit' : type);
}

function toInputDate(value: string): string {
  return value ? value.slice(0, 16) : '';
}

// `value` is a datetime-local input value (YYYY-MM-DDTHH:mm) — every time
// in this app is Zulu/UTC (see the "ETD Z/UTC"/"ETA Z/UTC" labels), so the
// digits the user typed ARE the UTC clock time. Appending "Z" directly (no
// `new Date(...)` round-trip) means zero conversion: what's typed is
// exactly what gets stored, regardless of the browser's local timezone.
function fromInputDate(value: string, fallback: string): string {
  return value ? `${value}:00.000Z` : fallback;
}

// A comma-separated multi-value text input (AVOID/INCLUDE FIRs) with a
// suggestion dropdown for the segment currently being typed. Stays a plain
// text field rather than a full chip/tag UI — keeps its own raw-text state
// (not just the parsed array) so an in-progress, not-yet-comma-terminated
// segment (e.g. typing "EG" toward "EGLL") isn't lost between keystrokes.
function FirTagInput({ label, value, onChange, disabled, pool, invalid }: {
  label: string;
  value: string[];
  onChange: (next: string[]) => void;
  disabled: boolean;
  pool: { code: string; label: string }[];
  invalid: boolean;
}) {
  const [text, setText] = useState(value.join(', '));
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Re-sync the raw text whenever edit mode toggles (entering edit mode,
  // or leaving it after save() normalizes the array) — the only other
  // writer of `value` is this component's own onChange below.
  useEffect(() => { setText(value.join(', ')); }, [disabled]);

  const currentSegment = text.split(',').pop()?.trim().toUpperCase() ?? '';
  const suggestions = currentSegment.length === 0 ? [] : pool
    .filter((p) => p.code.startsWith(currentSegment) || p.label.toUpperCase().includes(currentSegment))
    .slice(0, 8);

  const commit = (raw: string) => {
    setText(raw);
    onChange(raw.split(',').map((item) => item.trim().toUpperCase()).filter(Boolean));
  };

  const selectSuggestion = (code: string) => {
    const lastComma = text.lastIndexOf(',');
    const prefix = lastComma >= 0 ? `${text.slice(0, lastComma + 1)} ` : '';
    commit(`${prefix}${code}, `);
    setShowSuggestions(false);
  };

  return (
    <label className="relative text-xs font-medium text-muted-foreground">
      {label}
      <input
        className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm text-foreground"
        value={text}
        disabled={disabled}
        placeholder="ICAO FIR codes, comma separated"
        onChange={(event) => commit(event.target.value)}
        onFocus={() => setShowSuggestions(true)}
        onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
      />
      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute z-10 mt-1 w-full rounded-md border bg-popover shadow-md">
          {suggestions.map((s) => (
            <button
              key={s.code}
              type="button"
              className="block w-full px-2 py-1 text-left text-xs hover:bg-accent"
              onMouseDown={(event) => { event.preventDefault(); selectSuggestion(s.code); }}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
      {invalid && <span className="mt-1 block text-[10px] text-rose-600">Use a known FIR ICAO code, ISO2 code, or country name.</span>}
    </label>
  );
}

function AddManifestPersonDialog({ legId, tripId, existingPersonIds, open, onClose, onSaved }: {
  legId: string;
  tripId: string;
  existingPersonIds: string[];
  open: boolean;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const [roster, setRoster] = useState<Person[]>([]);
  const [personId, setPersonId] = useState('');
  const [role, setRole] = useState<PersonRole>('Pax');
  const [hotel, setHotel] = useState('');
  const [applyToAllLegs, setApplyToAllLegs] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getPersonRoster().then((all) => setRoster(all.filter((p) => !existingPersonIds.includes(p.PersonID))));
  }, [existingPersonIds]);

  const rosterOptions = useMemo(
    () => roster.map((p) => ({ value: p.PersonID, label: p.LicenceNumber ? `${p.Name} (${p.LicenceNumber})` : p.Name })),
    [roster]
  );

  const handleSave = async () => {
    if (!personId) return;
    setSaving(true);
    try {
      if (applyToAllLegs) {
        await assignPersonToAllLegs(personId, { tripId, role, hotel: hotel || undefined });
      } else {
        await assignPersonToLeg(personId, { legId, role, hotel: hotel || undefined });
      }
      await onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Add Person to Leg</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Person</Label>
            <Combobox options={rosterOptions} value={personId} onChange={setPersonId} placeholder="Search roster..." />
          </div>
          <div className="space-y-1">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as PersonRole)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(['PIC', 'SIC', 'FA', 'Mechanic', 'Engineer', 'Medical Staff', 'Other', 'Pax', 'VIP', 'Principal'] as PersonRole[]).map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Hotel (optional)</Label>
            <Input value={hotel} onChange={(e) => setHotel(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={applyToAllLegs} onChange={(e) => setApplyToAllLegs(e.target.checked)} />
            Apply to all legs of this trip
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={!personId || saving}>{saving ? 'Saving…' : 'Add'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LegEditor({
  leg,
  trip,
  legs,
  services,
  comms,
  serviceTypes,
  legPurposes,
  audit,
  invoices,
  persons,
  onSaved,
}: {
  leg: Leg;
  trip: Trip;
  legs: Leg[];
  services: Service[];
  comms: Comm[];
  serviceTypes: ServiceTypeDef[];
  legPurposes: LegPurposeDef[];
  audit: AuditEntry[];
  invoices: Invoice[];
  persons: TripPersonView[];
  onSaved: () => Promise<void> | void;
}) {
  const { canEdit } = useAuth();
  const [draft, setDraft] = useState(leg);
  const [editing, setEditing] = useState(false);
  const [newCountry, setNewCountry] = useState('');
  const [etaManuallyEdited, setEtaManuallyEdited] = useState(false);
  const airportOptions = useMemo(
    () => getAirportList().map((a) => ({ value: a.ICAO, label: `${a.ICAO} — ${a.Name}` })),
    []
  );
  // Suggestion pool for the AVOID/INCLUDE FIRs inputs — the same two
  // sources isValidFIR already validates against (known ICAO FIRs from
  // refICaoRules, plus every country's ISO2/name), just also offered as
  // you type instead of only checked after the fact.
  const firSuggestionPool = useMemo(() => {
    const icaoCodes = Array.from(new Set(refICaoRules.map((r) => r.ICAO)));
    const icaoEntries = icaoCodes.map((icao) => ({ code: icao, label: `${icao} (FIR)` }));
    const countryEntries = getCountryList().map((c) => ({ code: c.ISO2, label: `${c.ISO2} — ${c.Name}` }));
    return [...icaoEntries, ...countryEntries];
  }, []);
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [expandedIcaos, setExpandedIcaos] = useState<Set<string>>(new Set());
  // "12 REQUIREMENTS SUGGESTED" review — generate*Services() already only
  // creates services that don't exist yet (idempotent), so its return value
  // is exactly the set newly added by this save. Present them for review
  // rather than letting them silently appear with no acknowledgment.
  const [suggested, setSuggested] = useState<Service[]>([]);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [keptSuggestionIds, setKeptSuggestionIds] = useState<Set<string>>(new Set());
  const [addPersonOpen, setAddPersonOpen] = useState(false);
  const [conflict, setConflict] = useState<{ changedBy?: string; changedAt?: string; current: Record<string, unknown> } | null>(null);
  const toggleIcao = (icao: string) => {
    setExpandedIcaos((current) => {
      const next = new Set(current);
      if (next.has(icao)) next.delete(icao); else next.add(icao);
      return next;
    });
  };
  const legServices = services.filter((service) =>
    service.ScopeID === leg.LegID && (service.ScopeType === 'LEG' || service.ScopeType === 'SEGMENT')
  );
  const countries = draft.CountriesOverflown.map((iso) => getCountry(iso)).filter(Boolean);
  const legHasChanges = JSON.stringify(draft) !== JSON.stringify(leg);

  const update = <K extends keyof Leg>(field: K, value: Leg[K]) => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

  const estimateArrival = (departure: string, depIcao: string, arrIcao: string) => {
    const dep = getAirport(depIcao);
    const arr = getAirport(arrIcao);
    const aircraftType = getAircraftType(getAircraft(trip.Registration || '')?.ICAOType || '');
    if (!dep || !arr || !departure || etaManuallyEdited) return draft.ETAZ;
    const speed = aircraftType?.CruiseSpeedKts || 450;
    const hours = haversineNM(dep.Latitude, dep.Longitude, arr.Latitude, arr.Longitude) / speed;
    return new Date(new Date(departure).getTime() + hours * 60 * 60 * 1000).toISOString();
  };

  const addCountry = () => {
    if (!newCountry || draft.CountriesOverflown.includes(newCountry)) return;
    update('CountriesOverflown', [...draft.CountriesOverflown, newCountry]);
    setNewCountry('');
  };

  const removeCountry = (iso: string) => {
    update('CountriesOverflown', draft.CountriesOverflown.filter((item) => item !== iso));
  };

  const [routeCountries, setRouteCountries] = useState<string[]>([]);
  useEffect(() => {
    if (draft.DepICAO && draft.ArrICAO) {
      computeCountriesOverflown(draft.DepICAO, draft.ArrICAO).then(setRouteCountries);
    } else {
      setRouteCountries([]);
    }
  }, [draft.DepICAO, draft.ArrICAO]);
  const addSuggestedCountries = () => {
    update('CountriesOverflown', [...new Set([...draft.CountriesOverflown, ...routeCountries])]);
  };

  const isValidFIR = (value: string) => {
    const normalized = value.trim().toUpperCase();
    return refICaoRules.some((rule) => rule.ICAO === normalized) || getCountryList().some((country) => country.ISO2 === normalized || country.Name.toUpperCase() === normalized);
  };

  const normalizeFIR = (value: string) => {
    const normalized = value.trim().toUpperCase();
    const country = getCountryList().find((item) => item.ISO2 === normalized || item.Name.toUpperCase() === normalized);
    return country?.ISO2 || normalized;
  };

  // The "+ ADD" command — a single searchable type picker replaces what
  // used to be a bare "ADD SERVICE" button that always created a generic
  // FlightPlanning stub the coordinator then had to open and retype.
  // Scope (country vs airport) is still implicit in which section's
  // control was used, matching "the system determines whether the
  // resulting item is country-, airport-, leg- or trip-scoped."
  const addService = async (serviceType: ServiceType, iso?: string, icao?: string) => {
    const countrySuffix = iso || 'LEG';
    const service: Service = {
      SVCID: `${leg.LegID}-${serviceType.toUpperCase()}-${countrySuffix}-${Date.now()}`,
      TripID: leg.TripID,
      ScopeType: 'LEG',
      ScopeID: leg.LegID,
      ServiceType: serviceType,
      ProviderID: null,
      Status: 'Not Started',
      Version: 1,
      RefNumber: '',
      BasedOnETDZ: draft.ETDZ,
      RequiredByZ: draft.ETDZ,
      Urgency: 'OK',
      AssignedTo: 'Unassigned',
      Notes: '',
      CountryISO2: iso,
      ICAO: iso ? undefined : (icao || leg.ArrICAO),
    };
    await saveService(service);
    if (!iso) setExpandedIcaos((current) => new Set(current).add(icao || leg.ArrICAO));
    await onSaved();
  };

  // One control, not five buttons ("Add Permit" / "Add Handling" / "Add
  // Fuel" / ...) — same searchable type list the drawer's own type select
  // already groups by category, just used at creation time instead of
  // only after the fact.
  const renderAddServiceControl = (iso?: string, icao?: string) => (
    <select
      className="h-9 min-h-10 rounded-md border border-dashed bg-background px-2 text-xs text-muted-foreground"
      value=""
      onChange={(event) => {
        const type = event.target.value as ServiceType;
        if (type) addService(type, iso, icao);
      }}
    >
      <option value="">+ ADD SERVICE</option>
      {(['Permit', 'Handling', 'Other'] as const).map((category) => {
        const inCategory = serviceTypes.filter((d) => d.active && d.category === category).sort((a, b) => a.sortOrder - b.sortOrder);
        if (inCategory.length === 0) return null;
        return (
          <optgroup key={category} label={category.toUpperCase()}>
            {inCategory.map((d) => <option key={d.code} value={d.code}>{d.label}</option>)}
          </optgroup>
        );
      })}
    </select>
  );

  const toggleService = (serviceId: string) => {
    setSelectedServiceIds((current) => current.includes(serviceId) ? current.filter((id) => id !== serviceId) : [...current, serviceId]);
  };

  const removeSelectedServices = async () => {
    for (const serviceId of selectedServiceIds) {
      await deleteService(serviceId);
    }
    await onSaved();
    setSelectedServiceIds([]);
  };

  const save = async () => {
    try {
      const airportsChanged = draft.DepICAO !== leg.DepICAO || draft.ArrICAO !== leg.ArrICAO;
      const updated = {
        ...draft,
        Revision: draft.Revision + 1,
        CountriesOverflown: airportsChanged
          ? await computeCountriesOverflown(draft.DepICAO, draft.ArrICAO)
          : draft.CountriesOverflown,
        AvoidFIRs: (draft.AvoidFIRs || []).map(normalizeFIR),
        IncludeFIRs: (draft.IncludeFIRs || []).map(normalizeFIR),
      };
      await saveLeg(updated);
      const [overflightCreated, arrivalCreated] = await Promise.all([
        generateOverflightServices(updated.LegID),
        generateArrivalServices(updated.LegID),
      ]);
      const newlySuggested = [...overflightCreated, ...arrivalCreated];
      setDraft(updated);
      setEditing(false);
      await onSaved();
      if (newlySuggested.length > 0) {
        setSuggested(newlySuggested);
        setKeptSuggestionIds(new Set(newlySuggested.map((s) => s.SVCID)));
        setReviewOpen(false);
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const body = err.body as { current?: Record<string, unknown>; changedBy?: string; changedAt?: string };
        setConflict({ changedBy: body.changedBy, changedAt: body.changedAt, current: body.current ?? {} });
      } else {
        throw err;
      }
    }
  };

  const reloadAfterConflict = async () => {
    setConflict(null);
    await onSaved();
  };

  const dismissSuggestions = () => setSuggested([]);

  const confirmSuggestionReview = async () => {
    const toRemove = suggested.filter((s) => !keptSuggestionIds.has(s.SVCID));
    for (const s of toRemove) {
      await deleteService(s.SVCID);
    }
    if (toRemove.length > 0) await onSaved();
    setSuggested([]);
  };

  return (
    <div className="mt-4 border-t pt-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">LEG SERVICES & ROUTING</h3>
        <Button size="sm" variant={editing ? 'default' : 'outline'} disabled={!canEdit || (editing && !legHasChanges)} onClick={() => canEdit && (editing ? save() : setEditing(true))}>
          {editing ? <Save className="h-4 w-4" /> : <Edit3 className="h-4 w-4" />}
          {editing ? 'SAVE' : 'EDIT'}
        </Button>
      </div>

      {suggested.length > 0 && (
        <div className="mb-4 rounded-lg border border-primary/30 bg-primary/5 p-3 dark:shadow-glow">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold">{suggested.length} REQUIREMENT{suggested.length === 1 ? '' : 'S'} SUGGESTED</span>
            {!reviewOpen && (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setReviewOpen(true)}>REVIEW</Button>
                <Button size="sm" onClick={dismissSuggestions}>ACCEPT ALL</Button>
              </div>
            )}
          </div>
          {!reviewOpen ? (
            <div className="flex flex-wrap gap-1.5">
              {suggested.map((s) => (
                <Badge key={s.SVCID} variant="outline" className="text-[10px]">
                  {serviceLabel(s.ServiceType, serviceTypes)}{s.CountryISO2 ? ` — ${getCountry(s.CountryISO2)?.Name?.toUpperCase() || s.CountryISO2}` : s.ICAO ? ` — ${s.ICAO}` : ''}
                </Badge>
              ))}
            </div>
          ) : (
            <div className="space-y-1">
              {suggested.map((s) => {
                const kept = keptSuggestionIds.has(s.SVCID);
                return (
                  <label key={s.SVCID} className="flex cursor-pointer items-center gap-2 rounded border bg-background px-2 py-1.5 text-xs">
                    <input
                      type="checkbox"
                      checked={kept}
                      onChange={() => setKeptSuggestionIds((current) => {
                        const next = new Set(current);
                        if (next.has(s.SVCID)) next.delete(s.SVCID); else next.add(s.SVCID);
                        return next;
                      })}
                    />
                    <span className="flex-1">
                      {serviceLabel(s.ServiceType, serviceTypes)}
                      {s.CountryISO2 ? ` — ${getCountry(s.CountryISO2)?.Name?.toUpperCase() || s.CountryISO2}` : s.ICAO ? ` — ${s.ICAO}` : ''}
                    </span>
                    {!kept && <span className="text-[10px] text-muted-foreground">WILL BE REMOVED</span>}
                  </label>
                );
              })}
              <div className="flex justify-end gap-2 pt-1">
                <Button size="sm" variant="outline" onClick={() => setReviewOpen(false)}>BACK</Button>
                <Button size="sm" onClick={confirmSuggestionReview}>CONFIRM SELECTION</Button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-4">
        {(['DepICAO', 'ArrICAO'] as const).map((field) => {
          const label = field === 'DepICAO' ? 'FROM' : 'TO';
          const value = draft[field];
          const setAirport = (nextValue: string) => {
            update(field, nextValue);
            if (!etaManuallyEdited) {
              update('ETAZ', estimateArrival(draft.ETDZ, field === 'DepICAO' ? nextValue : draft.DepICAO, field === 'ArrICAO' ? nextValue : draft.ArrICAO));
            }
          };
          return (
            <label key={field} className="text-xs font-medium text-muted-foreground">
              {label}
              <div className="mt-1">
                <Combobox
                  options={airportOptions}
                  value={value}
                  onChange={setAirport}
                  placeholder="ICAO..."
                  searchPlaceholder="Search ICAO or airport name..."
                  className={!editing ? 'pointer-events-none opacity-60' : undefined}
                />
              </div>
            </label>
          );
        })}
        {[
          ['ETD Z/UTC', 'ETDZ', toInputDate(draft.ETDZ)], ['ETA Z/UTC', 'ETAZ', toInputDate(draft.ETAZ)],
        ].map(([label, field, value]) => (
          <label key={field} className="text-xs font-medium text-muted-foreground">
            {label}
            <input
              className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm text-foreground"
              type="datetime-local"
              value={value}
              disabled={!editing}
              onChange={(event) => {
                const nextValue = fromInputDate(event.target.value, value);
                if (field === 'ETAZ') setEtaManuallyEdited(true);
                if (field === 'ETDZ') {
                  setEtaManuallyEdited(false);
                  update('ETDZ', nextValue);
                  update('ETAZ', estimateArrival(nextValue, draft.DepICAO, draft.ArrICAO));
                } else {
                  update(field as keyof Leg, nextValue);
                }
              }}
            />
          </label>
        ))}
        {[
          ['BLOCK HOURS', 'BlockHours'], ['PAX', 'PaxCount'], ['CREW', 'CrewCount'], ['CALL SIGN', 'CallSign'],
        ].map(([label, field]) => (
          <label key={field} className="text-xs font-medium text-muted-foreground">
            {label}
            <input
              className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm text-foreground"
              type={field === 'CallSign' ? 'text' : 'number'}
              min={field === 'CrewCount' ? 1 : field === 'PaxCount' || field === 'BlockHours' ? 0 : undefined}
              value={(draft[field as keyof Leg] as string | number) ?? ''}
              disabled={!editing}
              onChange={(event) => {
                if (field === 'CallSign') {
                  update(field as keyof Leg, event.target.value);
                  return;
                }
                // Crew count can never drop to 0 — an aircraft flies with
                // at least one crew member even when it carries no pax.
                const minValue = field === 'CrewCount' ? 1 : 0;
                update(field as keyof Leg, Math.max(minValue, Number(event.target.value) || minValue));
              }}
            />
          </label>
        ))}
        <label className="text-xs font-medium text-muted-foreground">
          PURPOSE
          <select
            className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm text-foreground"
            value={draft.Purpose || ''}
            disabled={!editing}
            onChange={(event) => update('Purpose', event.target.value)}
          >
            <option value="">—</option>
            {/* An old free-text value not in the admin-managed catalog stays
                selectable and visible rather than silently disappearing. */}
            {draft.Purpose && !legPurposes.some((p) => p.code === draft.Purpose) && (
              <option value={draft.Purpose}>{draft.Purpose} (legacy)</option>
            )}
            {legPurposes.filter((p) => p.active).sort((a, b) => a.sortOrder - b.sortOrder).map((p) => (
              <option key={p.code} value={p.code}>{p.label}</option>
            ))}
          </select>
        </label>
      </div>

      <label className="mt-3 block text-xs font-medium text-muted-foreground">
        ROUTING
        <textarea className="mt-1 w-full rounded-md border bg-background px-2 py-2 text-xs text-foreground" rows={2} disabled={!editing} value={draft.Routing || ''} placeholder="e.g. FAOR DCT VASUR UZ21 ITROL ..." onChange={(event) => update('Routing', event.target.value)} />
      </label>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {(['AvoidFIRs', 'IncludeFIRs'] as const).map((field) => (
          <FirTagInput
            key={field}
            label={field === 'AvoidFIRs' ? 'AVOID FIRs' : 'INCLUDE FIRs'}
            value={draft[field] || []}
            onChange={(next) => update(field, next)}
            disabled={!editing}
            pool={firSuggestionPool}
            invalid={(draft[field] || []).some((item) => !isValidFIR(item))}
          />
        ))}
      </div>

      <div className="mt-4 rounded-md border bg-muted/20 p-3">
        <div className="mb-2 flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold">PERMITS</div>
            <div className="text-[11px] text-muted-foreground">Overfly and landing permit status, one row per country.</div>
          </div>
          {editing && (
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={addSuggestedCountries} disabled={!routeCountries.length}>ADD ROUTE COUNTRIES</Button>
              <select className="h-8 rounded-md border bg-background px-2 text-xs" value={newCountry} onChange={(event) => setNewCountry(event.target.value)}>
                <option value="">ADD COUNTRY</option>
                {getCountryList().filter((country) => !draft.CountriesOverflown.includes(country.ISO2)).map((country) => <option key={country.ISO2} value={country.ISO2}>{country.Name} ({country.ISO2})</option>)}
              </select>
              <Button size="icon-sm" variant="outline" onClick={addCountry} title="Add country"><Plus /></Button>
            </div>
          )}
        </div>
        {editing && selectedServiceIds.length > 0 && (
          <div className="mb-3 flex items-center justify-between rounded-md border border-rose-200 bg-rose-50 px-3 py-2">
            <span className="text-xs font-medium text-rose-800">{selectedServiceIds.length} SERVICES SELECTED</span>
            <Button size="sm" variant="destructive" onClick={removeSelectedServices}><Trash2 className="h-4 w-4" /> REMOVE SELECTED</Button>
          </div>
        )}
        {countries.length === 0 && <div className="text-xs text-muted-foreground">No countries assigned yet.</div>}
        <div className="divide-y rounded-md border bg-background">
          {countries.map((country) => {
            if (!country) return null;
            const countryServices = legServices.filter((service) => service.CountryISO2 === country.ISO2);
            return (
              <div key={country.ISO2} className="p-3">
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-sm font-semibold">{country.Name.toUpperCase()}</div>
                  {editing && <Button size="icon-sm" variant="ghost" onClick={() => removeCountry(country.ISO2)} title="Remove country"><Trash2 className="h-4 w-4 text-red-600" /></Button>}
                </div>
                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {countryServices.map((service) => (
                    <ServiceInlineEditor
                      key={service.SVCID}
                      service={service}
                      editing={editing}
                      selected={selectedServiceIds.includes(service.SVCID)}
                      onSelect={() => toggleService(service.SVCID)}
                      onDelete={async () => { await deleteService(service.SVCID); await onSaved(); }}
                      onSaved={onSaved}
                      leg={leg}
                      trip={trip}
                      legs={legs}
                      comms={comms}
                      persons={persons}
                      serviceTypes={serviceTypes}
                    />
                  ))}
                  {editing && renderAddServiceControl(country.ISO2)}
                  {countryServices.length === 0 && !editing && <div className="text-xs text-muted-foreground">No services assigned.</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-3 rounded-md border bg-muted/20 p-3">
        <div className="mb-2">
          <div className="text-xs font-semibold">HANDLING</div>
          <div className="text-[11px] text-muted-foreground">Ground handling, fuel, catering and other station services, grouped by airport. Click an airport to see what's arranged there.</div>
        </div>
        {(() => {
          const handlingServices = legServices.filter((service) => !service.CountryISO2);
          const grouped = handlingServices.reduce<Record<string, Service[]>>((groups, service) => {
            const icao = service.ICAO || leg.ArrICAO;
            groups[icao] = [...(groups[icao] || []), service];
            return groups;
          }, {});
          const icaos = Object.keys(grouped);
          return (
            <div className="space-y-2">
              {icaos.length === 0 && <div className="text-xs text-muted-foreground">No handling services assigned yet.</div>}
              {icaos.map((icao) => {
                const airport = getAirport(icao);
                const isOpen = expandedIcaos.has(icao);
                return (
                  <div key={icao} className="rounded-md border bg-background">
                    <button
                      type="button"
                      className="flex w-full items-center justify-between p-3 text-left"
                      onClick={() => toggleIcao(icao)}
                      aria-expanded={isOpen}
                    >
                      <span className="flex items-center gap-2 text-sm font-semibold">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        {icao}{airport?.Name ? ` / ${airport.Name.toUpperCase()}` : ''}
                      </span>
                      <span className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px]">{grouped[icao].length} SERVICE{grouped[icao].length === 1 ? '' : 'S'}</Badge>
                        {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </span>
                    </button>
                    {isOpen && (
                      <div className="grid gap-2 border-t p-3 md:grid-cols-2 xl:grid-cols-3">
                        {grouped[icao].map((service) => (
                          <ServiceInlineEditor
                            key={service.SVCID}
                            service={service}
                            editing={editing}
                            selected={selectedServiceIds.includes(service.SVCID)}
                            onSelect={() => toggleService(service.SVCID)}
                            onDelete={async () => { await deleteService(service.SVCID); await onSaved(); }}
                            onSaved={onSaved}
                            leg={leg}
                            trip={trip}
                            legs={legs}
                            comms={comms}
                            persons={persons}
                            serviceTypes={serviceTypes}
                          />
                        ))}
                        {editing && renderAddServiceControl(undefined, icao)}
                      </div>
                    )}
                  </div>
                );
              })}
              {editing && renderAddServiceControl(undefined, leg.ArrICAO)}
            </div>
          );
        })()}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="rounded-md border p-3">
          <div className="mb-2 text-xs font-semibold">LEG MESSAGES</div>
          {comms.filter((comm) => comm.SVCID && legServices.some((service) => service.SVCID === comm.SVCID)).length === 0 ? (
            <div className="text-xs text-muted-foreground">No messages linked to this leg.</div>
          ) : comms.filter((comm) => comm.SVCID && legServices.some((service) => service.SVCID === comm.SVCID)).map((comm) => (
            <div key={comm.CommID} className="mb-2 rounded border p-2 text-xs"><div className="font-semibold">{comm.Subject}</div><div className="text-muted-foreground">{comm.Direction} · {comm.Status}</div><div className="mt-1">{comm.Body}</div></div>
          ))}
        </div>
        <div className="rounded-md border p-3">
          <div className="mb-2 text-xs font-semibold">AUDIT TRAIL</div>
          {audit.filter((entry) => entry.RecordID === leg.LegID).slice(0, 8).map((entry, index) => (
            <div key={`${entry.TimestampZ}-${index}`} className="mb-2 text-xs"><span className="font-mono text-muted-foreground">{entry.TimestampZ.slice(0, 16)}</span> {entry.Field} saved by {entry.User}</div>
          ))}
          {!audit.some((entry) => entry.RecordID === leg.LegID) && <div className="text-xs text-muted-foreground">No audit entries for this leg.</div>}
        </div>
        <div className="rounded-md border p-3">
          <div className="mb-2 text-xs font-semibold">LEG BILLING</div>
          {invoices.flatMap((invoice) => invoice.LineItems.filter((item) => item.SVCID && legServices.some((service) => service.SVCID === item.SVCID)).map((item) => ({ invoice, item }))).map(({ invoice, item }) => (
            <div key={`${invoice.InvoiceID}-${item.LineID}`} className="mb-2 flex justify-between text-xs"><span>{item.Description}</span><span className="font-mono">{invoice.Currency} {item.Total.toFixed(2)}</span></div>
          ))}
          {!invoices.some((invoice) => invoice.LineItems.some((item) => item.SVCID && legServices.some((service) => service.SVCID === item.SVCID))) && <div className="text-xs text-muted-foreground">No billing lines linked to this leg.</div>}
        </div>
      </div>

      <div className="mt-4 rounded-md border p-3">
        <div className="mb-2 flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold">LEG CREW & PAX MANIFEST</div>
            <div className="text-[11px] text-muted-foreground">{draft.PaxCount} PAX · {draft.CrewCount} CREW · PURPOSE: {(draft.Purpose || 'Not specified').toUpperCase()}</div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">{persons.length} ON THIS LEG</Badge>
            <Button size="sm" variant="outline" disabled={!canEdit} onClick={() => canEdit && setAddPersonOpen(true)}>
              <Plus className="h-4 w-4" /> ADD PERSON
            </Button>
          </div>
        </div>
        {persons.length === 0 ? <div className="text-xs text-muted-foreground">No crew or passenger records have been added to this leg.</div> : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {persons.map((person) => (
              <div key={person.PersonID} className="rounded border p-2 text-xs">
                <div className="flex items-center justify-between">
                  <div className="font-semibold">{person.Name}</div>
                  {canEdit && (
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-red-600"
                      onClick={async () => { await unassignPersonFromLeg(person.PersonID, leg.LegID); await onSaved(); }}
                      title="Remove from this leg"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <div className="text-muted-foreground">{person.Role.toUpperCase()}</div>
                {(person.PassportNationality || person.LicenceNumber) && <div className="mt-1 text-muted-foreground">{person.PassportNationality || person.LicenceNumber}</div>}
              </div>
            ))}
          </div>
        )}
        {addPersonOpen && (
          <AddManifestPersonDialog
            legId={leg.LegID}
            tripId={leg.TripID}
            existingPersonIds={persons.map((p) => p.PersonID)}
            open={addPersonOpen}
            onClose={() => setAddPersonOpen(false)}
            onSaved={onSaved}
          />
        )}
      </div>
      {conflict && (
        <ConflictDialog
          open={!!conflict}
          onOpenChange={(open) => !open && setConflict(null)}
          entityLabel="Leg"
          changedBy={conflict.changedBy}
          changedAt={conflict.changedAt}
          draft={draft as unknown as Record<string, unknown>}
          current={conflict.current}
          onReload={reloadAfterConflict}
        />
      )}
    </div>
  );
}

// Level 1 (the row) / Level 3 (the drawer) — clicking OPEN reveals the full
// editable Service Case, but the row itself only ever shows status, not
// every field. MESSAGE is a direct shortcut so compose doesn't require
// opening the drawer first. Draft/save/provider-eligibility logic is
// unchanged from before this was split — only the render shape changed.
function digitsOnly(phone: string): string {
  return phone.replace(/[^\d]/g, '');
}

const CHANNEL_ICON: Record<ContactChannel['ChannelType'], typeof Phone> = {
  Phone: Phone, WhatsApp: MessageCircle, Email: Mail, SMS: Phone,
};
const CHANNEL_HREF = (type: ContactChannel['ChannelType'], value: string) => {
  const digits = digitsOnly(value);
  if (type === 'Email') return `mailto:${value}`;
  if (type === 'WhatsApp') return `https://wa.me/${digits}`;
  if (type === 'SMS') return `sms:${value}`;
  return `tel:${value}`;
};

// Quick-action contact card for the service's assigned vendor — one
// clickable pill per contact channel (tel:/sms:/mailto:/wa.me), grouped
// in channel-type order rather than a hardcoded single phone+email pair.
function VendorContactCard({ provider }: { provider: Provider }) {
  return (
    <div className="rounded border bg-muted/30 p-2 space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold">{provider.Name}</span>
        {provider.WorkingHoursZ && <span className="text-[10px] text-muted-foreground">{provider.WorkingHoursZ}</span>}
      </div>
      {(provider.Channels ?? []).length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {provider.Channels.map((c, i) => {
            const Icon = CHANNEL_ICON[c.ChannelType] ?? Mail;
            return (
              <a
                key={i}
                href={CHANNEL_HREF(c.ChannelType, c.Value)}
                target={c.ChannelType === 'WhatsApp' ? '_blank' : undefined}
                rel={c.ChannelType === 'WhatsApp' ? 'noreferrer' : undefined}
                className="inline-flex items-center gap-1 rounded border bg-background px-1.5 py-0.5 text-[10px] hover:bg-accent"
              >
                <Icon className="h-3 w-3" /> {c.Label || c.Value}
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ServiceInlineEditor({ service, editing, selected, onSelect, onDelete, onSaved, leg, trip, legs, comms, persons, serviceTypes }: { service: Service; editing: boolean; selected: boolean; onSelect: () => void; onDelete: () => void; onSaved: () => Promise<void> | void; leg: Leg; trip: Trip; legs: Leg[]; comms: Comm[]; persons: TripPersonView[]; serviceTypes: ServiceTypeDef[] }) {
  const [draft, setDraft] = useState(service);
  const [savedDraft, setSavedDraft] = useState(service);
  const [composeOpen, setComposeOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [conflict, setConflict] = useState<{ changedBy?: string; changedAt?: string; current: Record<string, unknown> } | null>(null);
  const hasChanges = JSON.stringify(draft) !== JSON.stringify(savedDraft);
  const save = async () => {
    try {
      await saveService(draft);
      setSavedDraft(draft);
      await onSaved();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const body = err.body as { current?: Record<string, unknown>; changedBy?: string; changedAt?: string };
        setConflict({ changedBy: body.changedBy, changedAt: body.changedAt, current: body.current ?? {} });
      } else {
        throw err;
      }
    }
  };

  const reloadAfterConflict = async () => {
    setConflict(null);
    await onSaved();
  };
  const activeVariantDef = serviceTypes.find((d) => d.code === draft.ServiceType);

  const providers = getProviderList();
  const arrCountryISO2 = getAirport(leg.ArrICAO)?.CountryISO2;
  const depCountryISO2 = getAirport(leg.DepICAO)?.CountryISO2;
  const eligibleProviders = providers.filter((p) =>
    p.ServiceTypes.includes(draft.ServiceType) &&
    (
      p.ScopeType === 'Global' ||
      (p.ScopeType === 'ICAO' && (p.Scope === leg.ArrICAO || p.Scope === leg.DepICAO)) ||
      (p.ScopeType === 'Country' && (p.Scope === draft.CountryISO2 || p.Scope === arrCountryISO2 || p.Scope === depCountryISO2))
    )
  );
  const selectedProvider = providers.find((p) => p.ProviderID === draft.ProviderID) ?? null;
  // Always keep the service's assigned vendor selectable even if it falls outside the
  // eligibility heuristic above (same reasoning as ComposeDrawer's identical pattern).
  const providerOptions = selectedProvider && !eligibleProviders.some((p) => p.ProviderID === selectedProvider.ProviderID)
    ? [selectedProvider, ...eligibleProviders]
    : eligibleProviders;

  return (
    <>
      {/* Level 1 — compact status row, always visible */}
      <div className="flex items-center gap-2 rounded-md border p-2">
        {editing && (
          // Padding + negative margin expands the tap target well past the
          // native ~16px checkbox box without shifting surrounding layout —
          // a checkbox that small is a real mis-tap risk on a touch screen.
          <label className="-m-2 flex cursor-pointer items-center p-2">
            <input type="checkbox" checked={selected} onChange={onSelect} aria-label={`Select ${serviceLabel(service.ServiceType, serviceTypes)}`} />
          </label>
        )}
        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setDrawerOpen(true)}>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate text-xs font-semibold">{serviceLabel(service.ServiceType, serviceTypes)}</span>
            {activeVariantDef?.variants?.length && service.Variant && (
              <span className="text-[10px] text-muted-foreground">({activeVariantDef.variants.find((v) => v.code === service.Variant)?.label || service.Variant})</span>
            )}
            <Badge variant="secondary" className={`text-[9px] ${statusColor(service.Status)}`}>{service.Status.toUpperCase()}</Badge>
            <Badge variant="outline" className={`text-[9px] ${urgencyColor(service.Urgency)}`}>{service.Urgency}</Badge>
          </div>
          <div className="mt-0.5 flex flex-wrap gap-2 text-[10px] text-muted-foreground">
            {service.RefNumber && <span>REF: {service.RefNumber}</span>}
            {service.AssignedTo && <span>{service.AssignedTo.toUpperCase()}</span>}
          </div>
        </button>
        <Button size="sm" variant="outline" className="h-6 shrink-0 px-2 text-[10px]" onClick={() => setDrawerOpen(true)}>OPEN</Button>
        <Button size="icon-sm" variant="ghost" onClick={() => setComposeOpen(true)} title="Compose message">
          <Send className="h-3.5 w-3.5" />
        </Button>
        {editing && <Button size="icon-sm" variant="ghost" onClick={onDelete} title="Remove service"><Trash2 className="h-3.5 w-3.5 text-rose-600" /></Button>}
      </div>

      {/* Level 3 — the Service Case drawer, opened on demand */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{serviceLabel(service.ServiceType, serviceTypes)} — {service.SVCID}</SheetTitle>
          </SheetHeader>
          <div className="space-y-3 px-4 pb-4">
            <div className="flex flex-wrap items-center gap-2">
              <select
                className="h-8 min-w-0 flex-1 rounded border bg-background px-1 text-xs font-semibold"
                disabled={!editing}
                value={draft.ServiceType}
                onChange={(event) => setDraft({ ...draft, ServiceType: event.target.value, Variant: undefined })}
              >
                {(['Permit', 'Handling', 'Other'] as const).map((category) => {
                  const inCategory = serviceTypes.filter((d) => d.active && d.category === category).sort((a, b) => a.sortOrder - b.sortOrder);
                  if (inCategory.length === 0) return null;
                  return (
                    <optgroup key={category} label={category.toUpperCase()}>
                      {inCategory.map((d) => <option key={d.code} value={d.code}>{d.label}</option>)}
                    </optgroup>
                  );
                })}
              </select>
              {!!activeVariantDef?.variants?.length && (
                <select
                  className="h-8 min-w-0 flex-1 rounded border bg-background px-1 text-xs"
                  disabled={!editing}
                  value={draft.Variant || ''}
                  onChange={(event) => setDraft({ ...draft, Variant: event.target.value || undefined })}
                >
                  <option value="">SELECT…</option>
                  {activeVariantDef.variants.map((v) => <option key={v.code} value={v.code}>{v.label}</option>)}
                </select>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <select
                className="h-8 min-w-0 rounded border bg-background px-1 text-xs"
                disabled={!editing}
                value={draft.ProviderID || ''}
                onChange={(event) => setDraft({ ...draft, ProviderID: event.target.value || null })}
                title="Provider"
              >
                <option value="">NO PROVIDER</option>
                {providerOptions.map((p) => <option key={p.ProviderID} value={p.ProviderID}>{p.Name}</option>)}
              </select>
              <select className="h-8 min-w-0 rounded border bg-background px-1 text-xs" disabled={!editing} value={draft.Status} onChange={(event) => setDraft({ ...draft, Status: event.target.value as ServiceStatus })} title="Status">
                {SERVICE_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
            </div>
            {selectedProvider && <VendorContactCard provider={selectedProvider} />}
            <textarea className="w-full rounded border bg-background px-2 py-1 text-xs" disabled={!editing} value={draft.Notes} placeholder="Confirmatory note" rows={3} onChange={(event) => setDraft({ ...draft, Notes: event.target.value })} />
            <div className="grid grid-cols-2 gap-2">
              <input className="h-8 w-full rounded border bg-background px-2 text-xs text-muted-foreground" disabled={!editing} value={draft.RefNumber} placeholder="Ref / permit number" onChange={(event) => setDraft({ ...draft, RefNumber: event.target.value })} />
              <input className="h-8 w-full rounded border bg-background px-2 text-xs text-muted-foreground" disabled={!editing} value={draft.AssignedTo} placeholder="Assigned to" onChange={(event) => setDraft({ ...draft, AssignedTo: event.target.value })} />
            </div>
            {editing && <Button size="sm" className="w-full" onClick={save} disabled={!hasChanges}><Save className="h-3.5 w-3.5" /> SAVE SERVICE</Button>}
          </div>
        </SheetContent>
      </Sheet>

      <ComposeDrawer
        service={service}
        leg={leg}
        trip={trip}
        legs={legs}
        comms={comms}
        persons={persons}
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        onSent={onSaved}
      />

      {conflict && (
        <ConflictDialog
          open={!!conflict}
          onOpenChange={(open) => !open && setConflict(null)}
          entityLabel="Service"
          changedBy={conflict.changedBy}
          changedAt={conflict.changedAt}
          draft={draft as unknown as Record<string, unknown>}
          current={conflict.current}
          onReload={reloadAfterConflict}
        />
      )}
    </>
  );
}

function PermitSubmissionGroups({ legs, services, onSaved }: { legs: Leg[]; services: Service[]; onSaved: () => Promise<void> | void }) {
  const [selectedLegs, setSelectedLegs] = useState<Record<string, string[]>>({});
  const [requestRefs, setRequestRefs] = useState<Record<string, string>>({});
  const permitServices = services.filter((service) =>
    (service.ServiceType === 'Permit' || service.ServiceType === 'Overflight') && service.CountryISO2
  );
  const grouped = permitServices.reduce<Record<string, Service[]>>((groups, service) => {
    const country = service.CountryISO2 as string;
    groups[country] = [...(groups[country] || []), service];
    return groups;
  }, {});

  const toggleLeg = (country: string, legId: string) => {
    setSelectedLegs((current) => {
      const selected = current[country] || [];
      return { ...current, [country]: selected.includes(legId) ? selected.filter((id) => id !== legId) : [...selected, legId] };
    });
  };

  const submitCountryRequest = async (country: string, countryServices: Service[]) => {
    const legIds = selectedLegs[country] || [];
    if (!legIds.length) return;
    const ref = requestRefs[country] || `REQ-${country}-${Date.now()}`;
    for (const service of countryServices.filter((service) => legIds.includes(service.ScopeID))) {
      await saveService({ ...service, Status: 'Requested', RefNumber: ref, Notes: `${service.Notes} Included in combined ${country} permit request.`.trim() });
    }
    await onSaved();
  };

  return (
    <div className="space-y-4">
      {Object.entries(grouped).map(([country, countryServices]) => {
        const selected = selectedLegs[country] || [];
        return (
          <Card key={country}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-base font-semibold">{(getCountry(country)?.Name || country).toUpperCase()} PERMIT REQUEST</CardTitle>
                <p className="text-xs text-muted-foreground">Select multiple itinerary legs for one country request.</p>
              </div>
              <Badge variant="outline">{selected.length} LEGS SELECTED</Badge>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {countryServices.map((service) => {
                  const leg = legs.find((item) => item.LegID === service.ScopeID);
                  if (!leg) return null;
                  return (
                    <label key={service.SVCID} className="flex cursor-pointer items-start gap-3 rounded-md border p-3 hover:bg-muted/30">
                      <input type="checkbox" className="mt-1" checked={selected.includes(leg.LegID)} onChange={() => toggleLeg(country, leg.LegID)} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">LEG {leg.Seq}: {leg.DepICAO} → {leg.ArrICAO} <Badge variant="secondary" className="text-[10px]">{service.Status.toUpperCase()}</Badge></div>
                        <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground"><span>{leg.PaxCount} PAX</span><span>{leg.CrewCount} CREW</span><span>PURPOSE: {(leg.Purpose || 'Not specified').toUpperCase()}</span><span>{serviceLabel(service.ServiceType).toUpperCase()}</span></div>
                      </div>
                    </label>
                  );
                })}
              </div>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:justify-end">
                <input className="h-9 rounded-md border bg-background px-2 text-sm" placeholder="Request reference (optional)" value={requestRefs[country] || ''} onChange={(event) => setRequestRefs({ ...requestRefs, [country]: event.target.value })} />
                <Button size="sm" disabled={!selected.length} onClick={() => submitCountryRequest(country, countryServices)}><FileText className="h-4 w-4" /> SUBMIT {country} REQUEST</Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ─── Deadline Rail Component ────────────────────────────────────────────────

// "What needs my attention?" — the trip header's Level-1 status line.
// Every open service falls into exactly one bucket (priority order below),
// so the counts never double-count and always sum to the open-service total.
// A separate "CLIENT" (responsibility-not-ours) bucket isn't included —
// that needs a responsibility field this data model doesn't have yet.
type AttentionBucket = 'action' | 'waiting' | 'reconfirm' | 'confirmed';

function bucketForService(s: Service): AttentionBucket | null {
  if (s.Status === 'Not Required' || s.Status === 'Cancelled') return null;
  if (s.Status === 'Confirmed') return 'confirmed';
  if (s.Status === 'Re-confirm Required') return 'reconfirm';
  if (s.Urgency === 'URGENT' || s.Urgency === 'BREACH' || s.Status === 'Not Started') return 'action';
  return 'waiting';
}

function AttentionStrip({ services, legs }: { services: Service[]; legs: Leg[] }) {
  const counts: Record<AttentionBucket, number> = { action: 0, waiting: 0, reconfirm: 0, confirmed: 0 };
  services.forEach((s) => {
    const bucket = bucketForService(s);
    if (bucket) counts[bucket] += 1;
  });

  const items: { label: string; count: number; tone: string }[] = [
    { label: 'ACTION', count: counts.action, tone: 'border-red-300 bg-red-50/60 text-red-700' },
    { label: 'WAITING', count: counts.waiting, tone: 'border-amber-300 bg-amber-50/60 text-amber-700' },
    { label: 'RECONFIRM', count: counts.reconfirm, tone: 'border-violet-300 bg-violet-50/60 text-violet-700' },
    { label: 'CONFIRMED', count: counts.confirmed, tone: 'border-emerald-300 bg-emerald-50/60 text-emerald-700' },
  ];

  const paxTotal = legs.reduce((sum, leg) => sum + leg.PaxCount, 0);
  const crewTotal = legs.reduce((sum, leg) => sum + leg.CrewCount, 0);

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card px-3 py-2 dark:shadow-glow">
      <span className="text-[10px] font-semibold tracking-wider text-muted-foreground">{legs.length} LEGS</span>
      <span className="text-muted-foreground/40">·</span>
      <span className="text-[10px] font-semibold tracking-wider text-muted-foreground">{paxTotal} PAX / {crewTotal} CREW</span>
      <span className="ml-auto flex flex-wrap items-center gap-2">
        {items.filter((i) => i.count > 0).map((i) => (
          <span key={i.label} className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${i.tone}`}>
            {i.count} {i.label}
          </span>
        ))}
        {items.every((i) => i.count === 0) && (
          <span className="rounded-full border border-emerald-300 bg-emerald-50/60 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
            ALL CLEAR
          </span>
        )}
      </span>
    </div>
  );
}

// "290h" -> "12days & 2hrs" (and "-6h" -> "6hrs" for the overdue/BREACH case,
// which prefixes its own "overdue" wording separately).
function formatDueDuration(hours: number): string {
  const total = Math.abs(Math.round(hours));
  const days = Math.floor(total / 24);
  const rem = total % 24;
  const dayPart = days > 0 ? `${days}day${days === 1 ? '' : 's'}` : '';
  const hourPart = rem > 0 || days === 0 ? `${rem}hr${rem === 1 ? '' : 's'}` : '';
  return [dayPart, hourPart].filter(Boolean).join(' & ');
}

function legLabelFor(svc: Service, legs: Leg[]): string {
  const leg = svc.ScopeType === 'LEG' ? legs.find(l => l.LegID === svc.ScopeID) : undefined;
  return leg ? `L${String(leg.Seq).padStart(2, '0')}` : '—';
}

const DEADLINE_CATEGORIES: { title: string; types: Service['ServiceType'][] }[] = [
  { title: 'LANDING PERMITS', types: ['Permit'] },
  { title: 'OVERFLY PERMITS', types: ['Overflight'] },
  { title: 'GROUND HANDLING', types: ['GroundHandling'] },
];

function DeadlineRail({ services, legs }: { services: Service[]; legs: Leg[] }) {
  const now = new Date('2026-08-15T12:00:00Z').getTime();
  const open = services
    .filter(s => s.Status !== 'Confirmed' && s.Status !== 'Not Required' && s.Status !== 'Cancelled')
    .map(s => {
      const diff = new Date(s.RequiredByZ).getTime() - now;
      return { ...s, hours: Math.round(diff / (1000 * 60 * 60)) };
    })
    .sort((a, b) => a.hours - b.hours);

  const categorized = DEADLINE_CATEGORIES.map(cat => ({
    ...cat,
    rows: open.filter(s => cat.types.includes(s.ServiceType)),
  }));
  const otherRows = open.filter(s => !DEADLINE_CATEGORIES.some(cat => cat.types.includes(s.ServiceType)));

  return (
    <div className="rounded-lg border bg-card p-3 space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Timer className="h-4 w-4 text-amber-600" />
        OPEN DEADLINES <Badge variant="outline" className="ml-auto">{open.length} OPEN</Badge>
      </div>
      {open.length === 0 && <div className="text-xs text-muted-foreground">No open deadlines. All current services are confirmed, not required, or cancelled.</div>}
      {[...categorized, ...(otherRows.length ? [{ title: 'OTHER SERVICES', rows: otherRows }] : [])]
        .filter(cat => cat.rows.length > 0)
        .map(cat => (
          <div key={cat.title} className="space-y-1">
            <div className="text-xs font-semibold text-muted-foreground">{cat.title}</div>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="w-12 pb-1 font-medium">Leg</th>
                  <th className="pb-1 font-medium">Country</th>
                  <th className="pb-1 font-medium">Status</th>
                  <th className="pb-1 font-medium text-right">Due</th>
                </tr>
              </thead>
              <tbody>
                {cat.rows.map(svc => {
                  const isBreach = svc.hours < 0;
                  const isUrgent = svc.hours < 12;
                  const isDue = svc.hours < 48;
                  const country = svc.CountryISO2 ? (getCountry(svc.CountryISO2)?.Name || svc.CountryISO2) : (svc.ICAO || '—');
                  return (
                    <tr key={svc.SVCID} title={svc.SVCID} className="border-t">
                      <td className="py-1 font-mono">{legLabelFor(svc, legs)}</td>
                      <td className="py-1">{country}</td>
                      <td className="py-1"><Badge variant="outline" className="text-[9px]">{svc.Status}</Badge></td>
                      <td className={`py-1 text-right font-medium ${
                        isBreach ? 'text-red-700' : isUrgent ? 'text-orange-600' : isDue ? 'text-amber-700' : 'text-muted-foreground'
                      }`}>
                        {isBreach ? `BREACH: ${formatDueDuration(svc.hours)} overdue` : `Due in ${formatDueDuration(svc.hours)}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
    </div>
  );
}

// ─── Leg Register Row ───────────────────────────────────────────────────────

// ─── Service Status Icon ────────────────────────────────────────────────────

function svcStatusIcon(status: string) {
  switch (status) {
    case 'Confirmed': return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
    case 'Requested': return <Clock className="h-4 w-4 text-blue-600" />;
    case 'Chasing': return <AlertTriangle className="h-4 w-4 text-amber-600" />;
    case 'Not Started': return <HelpCircle className="h-4 w-4 text-slate-400" />;
    case 'Cancelled': return <XCircle className="h-4 w-4 text-gray-400" />;
    default: return <HelpCircle className="h-4 w-4 text-slate-400" />;
  }
}

function TripInfoEditor({ trip, onSaved }: { trip: Trip; onSaved: () => Promise<void> | void }) {
  const { canEdit } = useAuth();
  const [draft, setDraft] = useState(trip);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [billToEmailsText, setBillToEmailsText] = useState((trip.BillToEmails || []).join(', '));
  const [userDirectory, setUserDirectory] = useState<UserDirectoryEntry[]>([]);
  const [conflict, setConflict] = useState<{ changedBy?: string; changedAt?: string; current: Record<string, unknown> } | null>(null);

  useEffect(() => { getUserDirectory().then(setUserDirectory); }, []);
  useEffect(() => { setDraft(trip); setBillToEmailsText((trip.BillToEmails || []).join(', ')); }, [trip]);

  const clientList = getClientList();

  const save = async () => {
    if (!canEdit) return;
    setSaving(true);
    try {
      let resolvedDraft = { ...draft, BillToEmails: billToEmailsText.split(',').map((e) => e.trim()).filter(Boolean) };

      // Same "match by name, else create" resolution the New Trip wizard
      // uses — a trip saved before Item 12/19 has Client text but no
      // ClientID; this backfills it exactly once (a repeat save finds the
      // now-existing match instead of creating a duplicate).
      if (!resolvedDraft.ClientID && resolvedDraft.Client.trim()) {
        const match = clientList.find((c) => c.Name.toLowerCase() === resolvedDraft.Client.trim().toLowerCase());
        if (match) {
          resolvedDraft = { ...resolvedDraft, ClientID: match.ClientID };
        } else {
          const created = await saveClient({
            ClientID: `CLI-${Date.now()}`,
            Name: resolvedDraft.Client.trim(),
            IsOperator: false,
            BillingAddressLine1: resolvedDraft.BillToAddressLine1 || undefined,
            BillingAddressLine2: resolvedDraft.BillToAddressLine2 || undefined,
            BillingCity: resolvedDraft.BillToCity || undefined,
            BillingState: resolvedDraft.BillToState || undefined,
            BillingPostalCode: resolvedDraft.BillToPostalCode || undefined,
            BillingCountry: resolvedDraft.BillToCountry || undefined,
            // Client lost its single BillingEmails string[] field when Task 6
            // moved contact data onto the shared Channels model — each
            // billing email becomes its own Email channel marked ForBilling,
            // matching how Task 6's migration represents pre-existing
            // billingEmails values (see plan Task 12 Step 4).
            Channels: resolvedDraft.BillToEmails.map((email) => ({
              ID: 0, ChannelType: 'Email' as const, Value: email, Preferred: false, ForBilling: true,
            })),
          });
          resolvedDraft = { ...resolvedDraft, ClientID: created.ClientID };
        }
      }

      // Legacy single-line BillToAddress kept in sync so BillingPage.tsx's
      // "Bill To" line and resolveBillToAddress() keep working unchanged.
      const billToAddressLine = [
        resolvedDraft.BillToAddressLine1, resolvedDraft.BillToAddressLine2,
        resolvedDraft.BillToCity, resolvedDraft.BillToState, resolvedDraft.BillToPostalCode, resolvedDraft.BillToCountry,
      ].filter(Boolean).join(', ') || resolvedDraft.BillToAddress;

      await saveTrip({ ...resolvedDraft, BillToAddress: billToAddressLine });
      setDraft(resolvedDraft);
      setEditing(false);
      await onSaved();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const body = err.body as { current?: Record<string, unknown>; changedBy?: string; changedAt?: string };
        setConflict({ changedBy: body.changedBy, changedAt: body.changedAt, current: body.current ?? {} });
      } else {
        throw err;
      }
    } finally {
      setSaving(false);
    }
  };

  const reloadAfterConflict = async () => {
    setConflict(null);
    await onSaved();
  };

  const selectAircraft = (registration: string) => {
    const aircraft = getAircraftList().find((item) => item.Registration === registration);
    const type = aircraft ? getAircraftType(aircraft.ICAOType) : undefined;
    const operator = aircraft ? getOperator(aircraft.CurrentOperatorID || '') : undefined;
    setDraft((current) => ({
      ...current,
      Registration: registration,
      Operator: operator?.Name || current.Operator,
      AircraftICAOType: aircraft?.ICAOType || current.AircraftICAOType,
      AircraftMTOWKg: aircraft?.MTOW_kg || type?.MTOW_kg || current.AircraftMTOWKg,
      AircraftSerialNumber: aircraft?.SerialNumber || current.AircraftSerialNumber,
    }));
  };

  const selectClient = (c: Client) => {
    setDraft((current) => ({ ...current, Client: c.Name, ClientID: c.ClientID }));
    if (!draft.BillToAddressLine1 && !draft.BillToCity && !billToEmailsText) {
      setDraft((current) => ({
        ...current,
        BillToAddressLine1: c.BillingAddressLine1,
        BillToAddressLine2: c.BillingAddressLine2,
        BillToCity: c.BillingCity,
        BillToState: c.BillingState,
        BillToPostalCode: c.BillingPostalCode,
        BillToCountry: c.BillingCountry,
      }));
      setBillToEmailsText(c.Channels.filter((ch) => ch.ChannelType === 'Email' && ch.ForBilling).map((ch) => ch.Value).join(', '));
    }
  };

  const selectOwner = (u: UserDirectoryEntry) => {
    setDraft((current) => ({
      ...current,
      Owner: [u.FirstName, u.LastName].filter(Boolean).join(' ') || u.Username,
      OwnerUserID: u.ID,
      Team: current.Team || u.Team || current.Team,
    }));
  };

  const field = (label: string, key: keyof Trip, type = 'text') => (
    <label className="text-xs font-medium text-muted-foreground">
      {label}
      <input
        className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm text-foreground"
        type={type}
        value={(draft[key] as string | undefined) || ''}
        disabled={!editing}
        onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}
      />
    </label>
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-base font-semibold">TRIP INFORMATION</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">Client, operator, aircraft and mission details</p>
        </div>
        <Button size="sm" variant={editing ? 'default' : 'outline'} disabled={!canEdit || saving} onClick={() => canEdit && (editing ? save() : setEditing(true))}>
          {editing ? <Save className="h-4 w-4" /> : <Edit3 className="h-4 w-4" />}
          {editing ? (saving ? 'SAVING…' : 'SAVE') : 'EDIT'}
        </Button>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-4">
          <label className="text-xs font-medium text-muted-foreground">
            CLIENT
            <Typeahead
              value={draft.Client}
              onChange={(v) => setDraft({ ...draft, Client: v, ClientID: undefined })}
              options={clientList}
              getLabel={(c) => c.Name}
              getKey={(c) => c.ClientID}
              onSelect={selectClient}
              placeholder="Client name"
              className="mt-1 h-9"
            />
          </label>
          {field('OPERATOR', 'Operator')}
          <label className="text-xs font-medium text-muted-foreground">
            AIRCRAFT REGISTRY
            <select className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm text-foreground" disabled={!editing} value={draft.Registration} onChange={(event) => selectAircraft(event.target.value)}>
              {getAircraftList().map((aircraft) => <option key={aircraft.Registration} value={aircraft.Registration}>{aircraft.Registration} · {aircraft.ICAOType}</option>)}
            </select>
          </label>
          <label className="text-xs font-medium text-muted-foreground">
            OWNER
            <Typeahead
              value={draft.Owner}
              onChange={(v) => setDraft({ ...draft, Owner: v, OwnerUserID: undefined })}
              options={userDirectory}
              getLabel={(u) => [u.FirstName, u.LastName].filter(Boolean).join(' ') || u.Username}
              getKey={(u) => u.ID}
              onSelect={selectOwner}
              placeholder="Owner / trip manager"
              className="mt-1 h-9"
            />
          </label>
          {field('TEAM', 'Team')}
          <label className="text-xs font-medium text-muted-foreground">
            STATUS
            <select className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm text-foreground" disabled={!editing} value={draft.Status} onChange={(event) => setDraft({ ...draft, Status: event.target.value as TripStatus })}>
              {(['Planning', 'Active', 'Complete', 'Cancelled'] as TripStatus[]).map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
          </label>
          {field('CLIENT REF', 'SupportRef')}
          {field('OPERATION TYPE', 'OperationType')}
          {field('MISSION TYPE', 'MissionType')}
          {field('ICAO TYPE', 'AircraftICAOType')}
          {field('MTOW KG', 'AircraftMTOWKg', 'number')}
          {field('SERIAL NUMBER', 'AircraftSerialNumber')}
        </div>

        <div className="mt-4 rounded-md border bg-muted/20 p-3">
          <div className="mb-2 text-xs font-semibold">BILL TO (optional — defaults to the aircraft's operator billing address if left blank)</div>
          <div className="grid gap-2 md:grid-cols-2">
            <input className="h-9 rounded-md border bg-background px-2 text-sm text-foreground" disabled={!editing} placeholder="Address line 1" value={draft.BillToAddressLine1 || ''} onChange={(e) => setDraft({ ...draft, BillToAddressLine1: e.target.value })} />
            <input className="h-9 rounded-md border bg-background px-2 text-sm text-foreground" disabled={!editing} placeholder="Address line 2" value={draft.BillToAddressLine2 || ''} onChange={(e) => setDraft({ ...draft, BillToAddressLine2: e.target.value })} />
            <input className="h-9 rounded-md border bg-background px-2 text-sm text-foreground" disabled={!editing} placeholder="City" value={draft.BillToCity || ''} onChange={(e) => setDraft({ ...draft, BillToCity: e.target.value })} />
            <input className="h-9 rounded-md border bg-background px-2 text-sm text-foreground" disabled={!editing} placeholder="State / Region" value={draft.BillToState || ''} onChange={(e) => setDraft({ ...draft, BillToState: e.target.value })} />
            <input className="h-9 rounded-md border bg-background px-2 text-sm text-foreground" disabled={!editing} placeholder="Postal Code" value={draft.BillToPostalCode || ''} onChange={(e) => setDraft({ ...draft, BillToPostalCode: e.target.value })} />
            <input className="h-9 rounded-md border bg-background px-2 text-sm text-foreground" disabled={!editing} placeholder="Country" value={draft.BillToCountry || ''} onChange={(e) => setDraft({ ...draft, BillToCountry: e.target.value })} />
          </div>
          <input className="mt-2 h-9 w-full rounded-md border bg-background px-2 text-sm text-foreground" disabled={!editing} placeholder="Billing email(s), comma-separated" value={billToEmailsText} onChange={(e) => setBillToEmailsText(e.target.value)} />
        </div>

        <label className="mt-3 block text-xs font-medium text-muted-foreground">
          NOTES
          <textarea className="mt-1 w-full rounded-md border bg-background px-2 py-2 text-sm text-foreground" rows={2} disabled={!editing} value={draft.Notes || ''} onChange={(event) => setDraft({ ...draft, Notes: event.target.value })} />
        </label>
      </CardContent>
      {conflict && (
        <ConflictDialog
          open={!!conflict}
          onOpenChange={(open) => !open && setConflict(null)}
          entityLabel="Trip"
          changedBy={conflict.changedBy}
          changedAt={conflict.changedAt}
          draft={draft as unknown as Record<string, unknown>}
          current={conflict.current}
          onReload={reloadAfterConflict}
        />
      )}
    </Card>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function TripDetail() {
  const { canEdit } = useAuth();
  const { tripId } = useParams<{ tripId: string }>();
  const [selectedLegId, setSelectedLegId] = useState<string | null>(null);
  const [sheet, setSheet] = useState<TripSheet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [serviceTypes, setServiceTypes] = useState<ServiceTypeDef[]>([]);
  const [legPurposes, setLegPurposes] = useState<LegPurposeDef[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [uploadDocType, setUploadDocType] = useState('Other');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [verifyDocId, setVerifyDocId] = useState<string | null>(null);
  const [ocrRunningDocId, setOcrRunningDocId] = useState<string | null>(null);
  const [pdfPasswords, setPdfPasswords] = useState<Record<string, string>>({});

  const reload = async () => {
    if (!tripId) return;
    const [s, a, inv] = await Promise.all([getTripSheet(tripId), getAudit(), getInvoices(tripId)]);
    setSheet(s);
    setAudit(a);
    setInvoices(inv);
  };

  useEffect(() => {
    let cancelled = false;
    if (!tripId) { setLoading(false); return; }
    setLoading(true);
    Promise.all([getTripSheet(tripId), getAudit(), getInvoices(tripId)])
      .then(([s, a, inv]) => { if (!cancelled) { setSheet(s); setAudit(a); setInvoices(inv); setLoading(false); } })
      .catch((e) => { if (!cancelled) { setError(e.message); setLoading(false); } });
    return () => { cancelled = true; };
  }, [tripId]);

  // Trip-independent reference data — fetched once, not per-trip.
  useEffect(() => {
    getServiceTypes().then(setServiceTypes);
    getLegPurposes().then(setLegPurposes);
  }, []);

  if (loading) return <p className="p-4 text-sm text-muted-foreground">Loading…</p>;
  if (error) return <p className="p-4 text-sm text-destructive">Error: {error}</p>;

  if (!sheet) {
    return (
      <div className="py-12 text-center">
        <h2 className="text-xl font-bold">TRIP NOT FOUND</h2>
        <p className="text-muted-foreground">{tripId} DOES NOT EXIST IN THE SYSTEM.</p>
        <Link to="/trips" className="mt-4 inline-block text-primary hover:underline">← BACK TO TRIPS</Link>
      </div>
    );
  }

  const { trip, legs, stops, services, comms, persons, docs } = sheet;
  const ac = getAircraft(trip.Registration);

  const permitServices = services.filter(s => s.ServiceType === 'Permit' || s.ServiceType === 'Overflight');

  const handleUploadDoc = async () => {
    if (!canEdit || !uploadFile) return;
    setUploading(true);
    try {
      await uploadDoc(uploadFile, { docType: uploadDocType, tripId: trip.TripID });
      setUploadFile(null);
      await reload();
    } finally {
      setUploading(false);
    }
  };

  const handleRunOcr = async (docId: string) => {
    if (!canEdit) return;
    setOcrRunningDocId(docId);
    try {
      await runDocOcr(docId, pdfPasswords[docId]);
      await reload();
    } finally {
      setOcrRunningDocId(null);
    }
  };

  const addLeg = async () => {
    const seq = legs.reduce((highest, leg) => Math.max(highest, leg.Seq), 0) + 1;
    const newLeg: Leg = {
      LegID: `${trip.TripID}-L${seq}-${Date.now()}`,
      TripID: trip.TripID,
      Seq: seq,
      DepICAO: legs[legs.length - 1]?.ArrICAO || '',
      ArrICAO: '',
      ETDZ: new Date().toISOString(),
      ETAZ: new Date().toISOString(),
      BlockHours: 0,
      PaxCount: 0,
      CrewCount: 0,
      CountriesOverflown: [],
      Revision: 1,
      Version: 1,
      Purpose: '',
      Routing: '',
    };
    await saveLeg(newLeg);
    await reload();
    setSelectedLegId(newLeg.LegID);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="mb-1 flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">{trip.TripID}</h1>
            <Badge variant="secondary" className={trip.Status === 'Active' ? 'bg-emerald-100 text-emerald-700' : trip.Status === 'Planning' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}>
              {trip.Status}
            </Badge>
          </div>
          <p className="text-muted-foreground uppercase">{trip.Client} — {trip.Operator}</p>
          {trip.SupportRef && (
            <p className="text-xs text-muted-foreground">REF: {trip.SupportRef}</p>
          )}
        </div>
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <Users className="h-4 w-4" />
            {trip.Owner}
          </div>
          <div className="flex items-center gap-1">
            <Plane className="h-4 w-4" />
            {trip.Registration} {ac && `(${ac.Manufacturer?.toUpperCase()})`}
          </div>
        </div>
      </div>

      <AttentionStrip services={services} legs={legs} />

      <TripInfoEditor trip={trip} onSaved={reload} />

      {/* Live Deadline Rail */}
      <DeadlineRail services={services} legs={legs} />

      {/* Main Tabs */}
      <Tabs defaultValue="route">
        <TabsList className="mb-4 flex-wrap">
          <TabsTrigger value="route" className="flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" /> ROUTE
          </TabsTrigger>
          <TabsTrigger value="services" className="flex items-center gap-1">
            <Briefcase className="h-3.5 w-3.5" /> SERVICES
          </TabsTrigger>
          <TabsTrigger value="crew" className="flex items-center gap-1">
            <Users className="h-3.5 w-3.5" /> PEOPLE
          </TabsTrigger>
          <TabsTrigger value="docs" className="flex items-center gap-1">
            <FileText className="h-3.5 w-3.5" /> DOCS
          </TabsTrigger>
          <TabsTrigger value="billing" className="flex items-center gap-1">
            <DollarSign className="h-3.5 w-3.5" /> BILLING
          </TabsTrigger>
          <TabsTrigger value="activity" className="flex items-center gap-1">
            <MessageSquare className="h-3.5 w-3.5" /> ACTIVITY
          </TabsTrigger>
        </TabsList>

        {/* ─── ROUTE TAB ────────────────────────────────────────────── */}
        <TabsContent value="route" className="space-y-6">
          {/* Leg Selector */}
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2"><Plane className="h-4 w-4" /> LEG SELECTOR</CardTitle>
                <div className="flex items-center gap-2">
                  <select
                    className="h-9 min-w-[240px] rounded-md border bg-background px-2 text-sm"
                    value={selectedLegId || ''}
                    onChange={(event) => setSelectedLegId(event.target.value || null)}
                  >
                    <option value="">— SELECT A LEG —</option>
                    {legs.map((leg) => (
                      <option key={leg.LegID} value={leg.LegID}>
                        LEG {leg.Seq}: {leg.DepICAO} → {leg.ArrICAO}{getCallSign(leg, trip.Registration) ? ` (${getCallSign(leg, trip.Registration)})` : ''}
                      </option>
                    ))}
                  </select>
                  <Button size="sm" variant="outline" disabled={!canEdit} onClick={() => canEdit && addLeg()}><Plus className="h-4 w-4" /> ADD LEG</Button>
                </div>
              </div>
            </CardHeader>
          </Card>

          {!selectedLegId ? (
            /* Preview — read-only summary of every leg, shown when none is selected. */
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {legs.map((leg) => {
                const dep = getAirport(leg.DepICAO);
                const arr = getAirport(leg.ArrICAO);
                return (
                  <button
                    key={leg.LegID}
                    type="button"
                    className="rounded-lg border bg-card p-4 text-left transition hover:border-primary hover:ring-2 hover:ring-primary/20"
                    onClick={() => setSelectedLegId(leg.LegID)}
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">LEG {leg.Seq} — REV {leg.Revision}</span>
                      {getCallSign(leg, trip.Registration) && (
                        <Badge variant="outline" className="font-mono text-xs gap-1">
                          <Radio className="h-3 w-3" />
                          {getCallSign(leg, trip.Registration)}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-lg font-bold">{leg.DepICAO}</div>
                        <div className="text-xs text-muted-foreground">{dep?.Name?.toUpperCase()}</div>
                        <div className="mt-1 text-xs font-medium">{formatZ(leg.ETDZ)}</div>
                      </div>
                      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="text-right">
                        <div className="text-lg font-bold">{leg.ArrICAO}</div>
                        <div className="text-xs text-muted-foreground">{arr?.Name?.toUpperCase()}</div>
                        <div className="mt-1 text-xs font-medium">{formatZ(leg.ETAZ)}</div>
                      </div>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">{leg.PaxCount} PAX / {leg.CrewCount} CREW · {leg.BlockHours}H BLOCK</div>
                    {leg.CountriesOverflown.length > 0 && (
                      <div className="mt-2 text-xs text-muted-foreground">
                        OVERFLIGHT: {leg.CountriesOverflown.map(iso => (getCountry(iso)?.Name || iso).toUpperCase()).join(', ')}
                      </div>
                    )}
                  </button>
                );
              })}
              {legs.length === 0 && <div className="text-sm text-muted-foreground">No legs yet — click ADD LEG to create the first one.</div>}
            </div>
          ) : (() => {
            const leg = legs.find((item) => item.LegID === selectedLegId);
            if (!leg) return null;
            const dep = getAirport(leg.DepICAO);
            const arr = getAirport(leg.ArrICAO);
            return (
              <Card className="border-primary ring-2 ring-primary/20">
                <CardContent className="p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-muted-foreground">LEG {leg.Seq} — REV {leg.Revision}</span>
                      {getCallSign(leg, trip.Registration) && (
                        <Badge variant="outline" className="font-mono text-xs gap-1">
                          <Radio className="h-3 w-3" />
                          {getCallSign(leg, trip.Registration)}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground">{leg.BlockHours}H BLOCK</span>
                      <Button size="sm" variant="ghost" onClick={() => setSelectedLegId(null)}>CHANGE LEG</Button>
                    </div>
                  </div>
                  <div className="flex flex-col items-center gap-2 md:flex-row">
                    <div className="flex-1 text-center md:text-left">
                      <div className="text-lg font-bold">{leg.DepICAO}</div>
                      <div className="text-sm text-muted-foreground">{dep?.Name?.toUpperCase()}</div>
                      <div className="mt-1 text-sm font-medium">{formatZ(leg.ETDZ)}</div>
                    </div>
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <ArrowRight className="h-5 w-5" />
                      <span className="text-xs">{leg.PaxCount} PAX / {leg.CrewCount} CREW</span>
                    </div>
                    <div className="flex-1 text-center md:text-right">
                      <div className="text-lg font-bold">{leg.ArrICAO}</div>
                      <div className="text-sm text-muted-foreground">{arr?.Name?.toUpperCase()}</div>
                      <div className="mt-1 text-sm font-medium">{formatZ(leg.ETAZ)}</div>
                    </div>
                  </div>
                  {leg.CountriesOverflown.length > 0 && (
                    <div className="mt-3 text-xs text-muted-foreground">
                      OVERFLIGHT: {leg.CountriesOverflown.map(iso => (getCountry(iso)?.Name || iso).toUpperCase()).join(', ')}
                    </div>
                  )}
                  <LegEditor
                    leg={leg}
                    trip={trip}
                    legs={legs}
                    services={services}
                    comms={comms}
                    serviceTypes={serviceTypes}
                    legPurposes={legPurposes}
                    audit={audit}
                    invoices={invoices}
                    persons={leg.persons}
                    onSaved={reload}
                  />
                </CardContent>
              </Card>
            );
          })()}

          {/* Stops */}
          {stops.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  GROUND STOPS
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>AIRPORT</TableHead>
                      <TableHead>ARRIVAL Z/UTC</TableHead>
                      <TableHead>DEPARTURE Z/UTC</TableHead>
                      <TableHead>GROUND TIME</TableHead>
                      <TableHead>PURPOSE</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stops.map(stop => {
                      const ap = getAirport(stop.ICAO);
                      return (
                        <TableRow key={stop.StopID}>
                          <TableCell className="font-medium">{stop.ICAO} <span className="text-xs text-muted-foreground">{ap?.Name?.toUpperCase()}</span></TableCell>
                          <TableCell className="text-sm">{formatZ(stop.ArrZ)}</TableCell>
                          <TableCell className="text-sm">{formatZ(stop.DepZ)}</TableCell>
                          <TableCell>{stop.GroundTimeHours}H</TableCell>
                          <TableCell>
                            <Badge variant="outline">{stop.Purpose.toUpperCase()}</Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ─── PERMITS TAB ──────────────────────────────────────────── */}
        {/* ─── SERVICES TAB (includes what was the separate PERMITS tab) ── */}
        <TabsContent value="services" className="space-y-4">
          <PermitSubmissionGroups
            legs={legs}
            services={services}
            onSaved={reload}
          />
          {permitServices.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  PERMITS & OVERFLIGHTS
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>SVC ID</TableHead>
                      <TableHead>TYPE</TableHead>
                      <TableHead>LEG</TableHead>
                      <TableHead>STATUS</TableHead>
                      <TableHead>URGENCY</TableHead>
                      <TableHead>REF / PERMIT NO</TableHead>
                      <TableHead>COUNTRY</TableHead>
                      <TableHead>VALID UNTIL</TableHead>
                      <TableHead>CONFIRMED BY</TableHead>
                      <TableHead>ASSIGNED</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {permitServices.map(svc => {

                      const leg = legs.find(l => l.LegID === svc.ScopeID);
                      return (
                        <TableRow key={svc.SVCID}>
                          <TableCell className="font-mono text-xs">{svc.SVCID}</TableCell>
                          <TableCell className="font-medium">{serviceLabel(svc.ServiceType).toUpperCase()}</TableCell>
                          <TableCell className="text-xs">{leg ? `LEG ${leg.Seq}: ${leg.DepICAO}→${leg.ArrICAO}` : svc.ScopeID}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              {svcStatusIcon(svc.Status)}
                              <Badge variant="secondary" className={`text-[10px] ${statusColor(svc.Status)}`}>{svc.Status.toUpperCase()}</Badge>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`text-[10px] ${urgencyColor(svc.Urgency)}`}>{svc.Urgency}</Badge>
                          </TableCell>
                          <TableCell className="text-xs font-mono">{svc.RefNumber || '—'}</TableCell>
                          <TableCell className="text-xs font-semibold">{svc.CountryISO2 ? (getCountry(svc.CountryISO2)?.Name?.toUpperCase() || svc.CountryISO2) : '—'}</TableCell>
                          <TableCell className="text-xs">{svc.ValidityZ ? formatZ(svc.ValidityZ) : '—'}</TableCell>
                          <TableCell className="text-xs">{svc.ConfirmedBy || '—'}</TableCell>
                          <TableCell className="text-xs">{svc.AssignedTo?.toUpperCase()}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Briefcase className="h-4 w-4" />
                ALL SERVICES
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SVC ID</TableHead>
                    <TableHead>TYPE</TableHead>
                    <TableHead>SCOPE</TableHead>
                    <TableHead>STATUS</TableHead>
                    <TableHead>URGENCY</TableHead>
                    <TableHead>REQUIRED BY Z/UTC</TableHead>
                    <TableHead>PROVIDER</TableHead>
                    <TableHead>REF</TableHead>
                    <TableHead>ASSIGNED</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {services.map(svc => {
                    const _provider = svc.ProviderID ? getProvider(svc.ProviderID) : null;
                    return (
                      <TableRow key={svc.SVCID}>
                        <TableCell className="font-mono text-xs">{svc.SVCID}</TableCell>
                        <TableCell className="font-medium">{serviceLabel(svc.ServiceType).toUpperCase()}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{svc.ScopeType}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {svcStatusIcon(svc.Status)}
                            <Badge variant="secondary" className={`text-[10px] ${statusColor(svc.Status)}`}>{svc.Status.toUpperCase()}</Badge>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[10px] ${urgencyColor(svc.Urgency)}`}>{svc.Urgency}</Badge>
                        </TableCell>
                        <TableCell className="text-sm">{formatZ(svc.RequiredByZ)}</TableCell>
                        <TableCell className="text-sm">{_provider?.Name?.toUpperCase() || '—'}</TableCell>
                        <TableCell className="text-xs font-mono">{svc.RefNumber || '—'}</TableCell>
                        <TableCell className="text-xs">{svc.AssignedTo?.toUpperCase()}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Sub-items */}
          {services.filter(s => s.SubItems && s.SubItems.length > 0).map(svc => (
            <Card key={`sub-${svc.SVCID}`} className="mt-4">
              <CardHeader>
                <CardTitle className="text-sm font-semibold">{svc.SVCID} — SUB-ITEMS</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {svc.SubItems?.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between rounded-md border p-2">
                      <div>
                        <span className="font-medium text-sm">{item.label}</span>
                        <p className="text-xs text-muted-foreground">{item.value}</p>
                      </div>
                      <Badge variant="outline" className={
                        item.status === 'Confirmed' ? 'border-emerald-300 text-emerald-700' :
                        item.status === 'Cancelled' ? 'border-gray-300 text-gray-500 line-through' :
                        item.status === 'Pending' ? 'border-amber-300 text-amber-700' :
                        'border-slate-300 text-slate-600'
                      }>
                        {item.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}

          {services.some(s => s.Status === 'Re-confirm Required') && (
            <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-4">
              <h4 className="mb-1 font-semibold text-rose-800 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                SCHEDULE CHANGE DETECTED
              </h4>
              <p className="text-sm text-rose-700">
                ONE OR MORE SERVICES WERE CONFIRMED AGAINST AN EARLIER ETD. AFTER THE LEG TIME WAS REVISED, THESE SERVICES NOW REQUIRE RE-CONFIRMATION.
              </p>
            </div>
          )}
        </TabsContent>

        {/* ─── CREW & PAX TAB ───────────────────────────────────────── */}
        <TabsContent value="crew">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  CREW & PAX REGISTER
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>NAME</TableHead>
                      <TableHead>LEG</TableHead>
                      <TableHead>ROLE</TableHead>
                      <TableHead>CONTACT</TableHead>
                      <TableHead>DETAILS</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {persons.map(p => (
                      <TableRow key={`${p.PersonID}-${p.LegID}`}>
                        <TableCell className="font-medium">{p.Name?.toUpperCase()}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">LEG {p.LegSeq}: {p.LegDepICAO} → {p.LegArrICAO}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{p.Role}</Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {getPreferredContact(p.Channels, 'Phone') && <div>{getPreferredContact(p.Channels, 'Phone')}</div>}
                          {getPreferredContact(p.Channels, 'Email') && <div>{getPreferredContact(p.Channels, 'Email')}</div>}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {p.Hotel && <div>HOTEL: {p.Hotel?.toUpperCase()}</div>}
                          {p.CommercialFlightETA && <div>FLT ETA: {formatZ(p.CommercialFlightETA)}</div>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold">ROLE SUMMARY</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {['PIC', 'SIC', 'FA', 'MECHANIC', 'ENGINEER', 'MEDICAL STAFF', 'OTHER', 'PAX', 'VIP', 'PRINCIPAL'].map(role => {
                  const count = persons.filter(p => p.Role === role).length;
                  if (count === 0) return null;
                  return (
                    <div key={role} className="flex items-center justify-between rounded-md border p-2">
                      <span className="text-sm font-medium">{role}</span>
                      <Badge variant="secondary">{count}</Badge>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ─── DOCS TAB ─────────────────────────────────────────────── */}
        <TabsContent value="docs" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <FileText className="h-4 w-4" /> UPLOAD DOCUMENT
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-2">
              <select className="h-9 rounded-md border bg-background px-2 text-sm" value={uploadDocType} onChange={(event) => setUploadDocType(event.target.value)}>
                {DOC_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
              <input
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/gif,image/tiff,image/bmp,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="text-sm"
                onChange={(event) => setUploadFile(event.target.files?.[0] || null)}
              />
              <Button size="sm" onClick={handleUploadDoc} disabled={!canEdit || !uploadFile || uploading}>
                {uploading ? 'UPLOADING…' : 'UPLOAD'}
              </Button>
            </CardContent>
          </Card>

          {docs.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  DOCUMENT ATTACHMENTS
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>DOC TYPE</TableHead>
                      <TableHead>FILE</TableHead>
                      <TableHead>SIZE</TableHead>
                      <TableHead>LINKED SVC</TableHead>
                      <TableHead>UPLOADED Z/UTC</TableHead>
                      <TableHead>BY</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {docs.map(doc => (
                      <TableRow key={doc.DocID}>
                        <TableCell>
                          <Badge variant="outline">{doc.DocType?.toUpperCase()}</Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{doc.FileName?.toUpperCase()}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{(doc.FileSizeBytes / 1024).toFixed(0)} KB</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{doc.SVCID || '—'}</TableCell>
                        <TableCell className="text-sm">{formatZ(doc.UploadedZ)}</TableCell>
                        <TableCell className="text-sm">{doc.UploadedBy?.toUpperCase()}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-2">
                            <Button size="sm" variant="outline" onClick={() => downloadDocFile(doc.DocID, doc.FileName)}>DOWNLOAD</Button>
                            {doc.OcrStatus === 'Complete' ? (
                              <Button size="sm" variant="outline" disabled={!canEdit} onClick={() => canEdit && setVerifyDocId(doc.DocID)}>
                                {doc.VerifiedAt ? 'RE-VERIFY' : 'VERIFY'}
                              </Button>
                            ) : (
                              <>
                                {doc.MimeType === 'application/pdf' && (
                                  <Input
                                    type="password"
                                    placeholder="PDF password (if any)"
                                    className="h-8 w-36 text-xs"
                                    value={pdfPasswords[doc.DocID] || ''}
                                    onChange={(e) => setPdfPasswords((cur) => ({ ...cur, [doc.DocID]: e.target.value }))}
                                  />
                                )}
                                <Button size="sm" variant="outline" onClick={() => handleRunOcr(doc.DocID)} disabled={!canEdit || ocrRunningDocId === doc.DocID}>
                                  {ocrRunningDocId === doc.DocID ? 'EXTRACTING…' : 'EXTRACT TEXT'}
                                </Button>
                              </>
                            )}
                            {doc.VerifiedAt && <Badge variant="outline" className="border-emerald-300 text-emerald-700 text-[9px]">VERIFIED</Badge>}
                            <Button size="sm" variant="outline" disabled={!canEdit} onClick={async () => { if (!canEdit) return; await deleteDoc(doc.DocID); await reload(); }}>DELETE</Button>
                          </div>
                          {doc.OcrStatus === 'Failed' && doc.OcrError && (
                            <div className="mt-1 text-xs text-destructive">{doc.OcrError}</div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ) : (
            <div className="text-center text-muted-foreground py-8">NO DOCUMENTS ATTACHED</div>
          )}
          {verifyDocId && (
            <DocVerifyDialog
              doc={docs.find((d) => d.DocID === verifyDocId)!}
              open={!!verifyDocId}
              onClose={() => setVerifyDocId(null)}
              onSaved={reload}
            />
          )}
        </TabsContent>

        {/* ─── BILLING TAB ──────────────────────────────────────────── */}
        <TabsContent value="billing">
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                BILLING
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border border-dashed p-8 text-center">
                <DollarSign className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-muted-foreground">BILLING MODULE COMING SOON</p>
                <p className="text-xs text-muted-foreground mt-1">
                  QUOTE GENERATION, E-SIGNATURE, INVOICE TRACKING, AND PAYMENT GATEWAY INTEGRATION WILL BE ADDED IN THE NEXT PHASE.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── ACTIVITY TAB ─────────────────────────────────────────── */}
        {/* One merged, chronological timeline — messages (full detail,
            since that content genuinely matters) interleaved with a
            compact one-line-per-change feed from the audit log, filtered
            to entries that actually belong to this trip (the trip record
            itself, or one of its legs/services). Level-1/Level-2 view;
            AuditPage.tsx remains the Level-3 system-wide record. */}
        <TabsContent value="activity" className="space-y-3">
          {(() => {
            const legIds = new Set(legs.map((l) => l.LegID));
            const svcIds = new Set(services.map((s) => s.SVCID));
            const relevantAudit = audit.filter((e) =>
              (e.Table === 'Trip' && e.RecordID === trip.TripID) ||
              (e.Table === 'Leg' && legIds.has(e.RecordID)) ||
              (e.Table === 'Service' && svcIds.has(e.RecordID))
            );
            type ActivityItem =
              | { kind: 'comm'; ts: string; comm: Comm }
              | { kind: 'audit'; ts: string; entry: AuditEntry };
            const items: ActivityItem[] = [
              ...comms.map((comm): ActivityItem => ({ kind: 'comm', ts: comm.TimestampZ, comm })),
              ...relevantAudit.map((entry): ActivityItem => ({ kind: 'audit', ts: entry.TimestampZ, entry })),
            ].sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());

            if (items.length === 0) {
              return <div className="text-center text-muted-foreground py-8">NO ACTIVITY FOR THIS TRIP YET</div>;
            }

            return items.map((item) => {
              if (item.kind === 'comm') {
                const comm = item.comm;
                return (
                  <Card key={`comm-${comm.CommID}`} className={comm.Direction === 'INBOUND' ? 'border-l-4 border-l-blue-400' : 'border-l-4 border-l-emerald-400'}>
                    <CardContent className="p-4">
                      <div className="mb-2 flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={comm.Direction === 'INBOUND' ? 'secondary' : comm.Status === 'Failed' ? 'destructive' : 'default'}
                          >
                            {comm.Direction === 'INBOUND' ? 'RECEIVED' : comm.Status.toUpperCase()}
                          </Badge>
                          <Mail className="h-4 w-4 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">{comm.TimestampZ.replace('T', ' ').replace('Z', '')}</span>
                        </div>
                        {comm.Token && (
                          <Badge variant="outline" className="font-mono text-xs">{comm.Token}</Badge>
                        )}
                      </div>
                      <div className="mb-1 text-sm text-muted-foreground">
                        <span className="font-medium text-foreground">{comm.Subject}</span>
                      </div>
                      <div className="mb-2 text-xs text-muted-foreground">
                        {comm.Direction === 'OUTBOUND' ? 'TO:' : 'FROM:'} {comm.Direction === 'OUTBOUND' ? comm.To : comm.From}
                      </div>
                      {comm.Status === 'Failed' && comm.ErrorMessage && (
                        <div className="mb-2 text-xs text-destructive">Send failed: {comm.ErrorMessage}</div>
                      )}
                      <Separator className="my-2" />
                      <pre className="whitespace-pre-wrap text-xs text-muted-foreground">{comm.Body}</pre>
                    </CardContent>
                  </Card>
                );
              }
              const entry = item.entry;
              return (
                <div key={`audit-${entry.TimestampZ}-${entry.RecordID}-${entry.Field}`} className="flex items-center gap-2 rounded-md border px-3 py-2 text-xs">
                  <span className="shrink-0 font-mono text-muted-foreground">{entry.TimestampZ.replace('T', ' ').replace('Z', '')}</span>
                  <span className="shrink-0 font-medium">{entry.User}</span>
                  <span className="text-muted-foreground">
                    {entry.Field === 'Created' ? (
                      <>created {entry.Table.toLowerCase()} <span className="font-mono">{entry.RecordID}</span></>
                    ) : entry.Field === 'Deleted' ? (
                      <>deleted {entry.Table.toLowerCase()} <span className="font-mono">{entry.RecordID}</span></>
                    ) : (
                      <>
                        changed <span className="font-mono">{entry.RecordID}</span>'s {entry.Field}: {' '}
                        <span className="rounded bg-red-50 px-1 text-red-700 line-through">{entry.OldValue || '—'}</span>
                        {' → '}
                        <span className="rounded bg-emerald-50 px-1 text-emerald-700">{entry.NewValue}</span>
                      </>
                    )}
                  </span>
                </div>
              );
            });
          })()}
        </TabsContent>
      </Tabs>

      <div className="pt-4">
        <Link to="/trips" className="text-sm text-primary hover:underline">← BACK TO ALL TRIPS</Link>
      </div>
    </div>
  );
}
