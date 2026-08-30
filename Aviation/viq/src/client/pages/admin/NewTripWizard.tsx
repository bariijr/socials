// @ts-nocheck
import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '@/lib/authContext';
import {
  saveTrip, saveLeg, saveStop, savePerson,
  refOperators, refAircraftTypes, nextTripId,
  getAircraftType, getAircraftList, saveAircraft, normalizeRegistration,
  computeCountriesOverflown, generateOverflightServices, generateArrivalServices,
  getAirport, getCountry, getClientList, saveClient, getUserDirectory,
  getPreferredContact, setPreferredChannelValue,
} from '@/lib/dataStore';
import type { Trip, Leg, Stop, Person, TripStatus, ServiceScope, ServiceType, PersonRole } from '@/data/types';
import type { Client, UserDirectoryEntry } from '@/lib/dataStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Typeahead } from '@/components/ui/typeahead';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from '@/components/ui/dialog';
import {
  Plane, Plus, Trash2, Users, ChevronRight, CheckCircle2, ArrowLeft, Save
} from 'lucide-react';

// ─── Helpers ────────────────────────────────────────────────────────────────

// `local` is a datetime-local input value (YYYY-MM-DDTHH:mm) — every time
// in this app is Zulu/UTC, so the digits the user typed ARE the UTC clock
// time. Appending "Z" directly (no `new Date(...)` round-trip) means zero
// conversion happens: what's typed is exactly what gets stored.
function isoLocalToZ(local: string): string {
  if (!local) return '';
  return `${local}:00.000Z`;
}

function zToLocalInput(iso: string): string {
  if (!iso) return '';
  return iso.slice(0, 16);
}

const TRIP_STATUSES: TripStatus[] = ['Planning', 'Active', 'Complete', 'Cancelled'];
const PERSON_ROLES: PersonRole[] = ['PIC', 'SIC', 'FA', 'Mechanic', 'Engineer', 'Medical Staff', 'Other', 'Pax', 'VIP', 'Principal'];
const STOP_PURPOSES = ['Tech', 'Night', 'CrewChange', 'Passenger'] as const;

// ─── Sub-components ─────────────────────────────────────────────────────────

function LegRow({ leg, idx, onChange, onRemove, depGroundHandling, onToggleDepGroundHandling }: {
  leg: Partial<Leg>;
  idx: number;
  onChange: (l: Partial<Leg>) => void;
  onRemove: () => void;
  depGroundHandling: boolean;
  onToggleDepGroundHandling: (v: boolean) => void;
}) {
  const depAirport = leg.DepICAO ? getAirport(leg.DepICAO) : undefined;
  const arrAirport = leg.ArrICAO ? getAirport(leg.ArrICAO) : undefined;
  const depCountry = depAirport ? getCountry(depAirport.CountryISO2) : undefined;
  const arrCountry = arrAirport ? getCountry(arrAirport.CountryISO2) : undefined;
  const overflown = leg.CountriesOverflown || [];

  return (
    <div className="rounded-lg border p-4 space-y-3 bg-card">
      <div className="flex items-center justify-between">
        <Badge variant="outline">Leg {idx + 1}</Badge>
        <Button variant="ghost" size="sm" className="h-7 text-red-600" onClick={onRemove}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Dep ICAO</Label>
          <Input
            value={leg.DepICAO || ''}
            onChange={(e) => onChange({ ...leg, DepICAO: e.target.value.toUpperCase() })}
            placeholder="EGLL"
            maxLength={4}
            className="uppercase"
          />
        </div>
        <div>
          <Label className="text-xs">Arr ICAO</Label>
          <Input
            value={leg.ArrICAO || ''}
            onChange={(e) => onChange({ ...leg, ArrICAO: e.target.value.toUpperCase() })}
            placeholder="OMDB"
            maxLength={4}
            className="uppercase"
          />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">ETD (UTC)</Label>
          <Input
            type="datetime-local"
            value={zToLocalInput(leg.ETDZ || '')}
            onChange={(e) => onChange({ ...leg, ETDZ: isoLocalToZ(e.target.value) })}
          />
        </div>
        <div>
          <Label className="text-xs">ETA (UTC)</Label>
          <Input
            type="datetime-local"
            value={zToLocalInput(leg.ETAZ || '')}
            onChange={(e) => onChange({ ...leg, ETAZ: isoLocalToZ(e.target.value) })}
          />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <div>
          <Label className="text-xs">Pax</Label>
          <Input
            type="number"
            min={0}
            value={leg.PaxCount ?? 0}
            onChange={(e) => onChange({ ...leg, PaxCount: parseInt(e.target.value) || 0 })}
          />
        </div>
        <div>
          <Label className="text-xs">Crew</Label>
          <Input
            type="number"
            min={1}
            value={leg.CrewCount ?? 1}
            onChange={(e) => onChange({ ...leg, CrewCount: Math.max(1, parseInt(e.target.value) || 1) })}
          />
        </div>
        <div>
          <Label className="text-xs">Block (hrs)</Label>
          <Input
            type="number"
            step={0.1}
            min={0}
            value={leg.BlockHours ?? 0}
            onChange={(e) => onChange({ ...leg, BlockHours: parseFloat(e.target.value) || 0 })}
          />
        </div>
      </div>
      <div>
        <Label className="text-xs">Call Sign (optional)</Label>
        <Input
          value={leg.CallSign || ''}
          onChange={(e) => onChange({ ...leg, CallSign: e.target.value.toUpperCase() || undefined })}
          placeholder="ACW169"
          className="uppercase"
        />
      </div>

      {(overflown.length > 0 || arrCountry || depCountry) && (
        <div className="rounded-md border bg-muted/40 p-3 space-y-2">
          {overflown.length > 0 && (
            <div className="text-xs">
              <span className="font-semibold">Overflown: </span>
              {overflown.map((iso) => (
                <Badge key={iso} variant="outline" className="mr-1">
                  {getCountry(iso)?.Name || iso}
                </Badge>
              ))}
            </div>
          )}
          {arrCountry && (
            <div className="text-xs text-muted-foreground">
              Arrival ({arrCountry.Name}): {arrCountry.LandingPermitRequired ? 'Landing Permit + ' : ''}Ground Handling auto-added.
            </div>
          )}
          {depCountry && (
            <div className="flex items-center gap-2 text-xs">
              <Checkbox
                id={`dep-gh-${idx}`}
                checked={depGroundHandling}
                onCheckedChange={(v) => onToggleDepGroundHandling(v === true)}
              />
              <Label htmlFor={`dep-gh-${idx}`} className="text-xs font-normal cursor-pointer">
                Include Ground Handling at departure ({depCountry.Name}), on request
              </Label>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StopRow({ stop, idx, onChange, onRemove }: {
  stop: Partial<Stop>;
  idx: number;
  onChange: (s: Partial<Stop>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-lg border p-4 space-y-3 bg-card">
      <div className="flex items-center justify-between">
        <Badge variant="outline">Stop {idx + 1}</Badge>
        <Button variant="ghost" size="sm" className="h-7 text-red-600" onClick={onRemove}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">ICAO</Label>
          <Input
            value={stop.ICAO || ''}
            onChange={(e) => onChange({ ...stop, ICAO: e.target.value.toUpperCase() })}
            placeholder="OMDB"
            maxLength={4}
            className="uppercase"
          />
        </div>
        <div>
          <Label className="text-xs">Purpose</Label>
          <Select value={stop.Purpose || 'Night'} onValueChange={(v) => onChange({ ...stop, Purpose: v as Stop['Purpose'] })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {STOP_PURPOSES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Arrival (UTC)</Label>
          <Input
            type="datetime-local"
            value={zToLocalInput(stop.ArrZ || '')}
            onChange={(e) => onChange({ ...stop, ArrZ: isoLocalToZ(e.target.value) })}
          />
        </div>
        <div>
          <Label className="text-xs">Departure (UTC)</Label>
          <Input
            type="datetime-local"
            value={zToLocalInput(stop.DepZ || '')}
            onChange={(e) => onChange({ ...stop, DepZ: isoLocalToZ(e.target.value) })}
          />
        </div>
      </div>
      <div>
        <Label className="text-xs">Ground Time (hrs)</Label>
        <Input
          type="number"
          step={0.1}
          min={0}
          value={stop.GroundTimeHours ?? 0}
          onChange={(e) => onChange({ ...stop, GroundTimeHours: parseFloat(e.target.value) || 0 })}
        />
      </div>
    </div>
  );
}

function PersonRow({ person, idx, onChange, onRemove }: {
  person: Partial<Person>;
  idx: number;
  onChange: (p: Partial<Person>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-lg border p-4 space-y-3 bg-card">
      <div className="flex items-center justify-between">
        <Badge variant="outline">Person {idx + 1}</Badge>
        <Button variant="ghost" size="sm" className="h-7 text-red-600" onClick={onRemove}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Name</Label>
          <Input
            value={person.Name || ''}
            onChange={(e) => onChange({ ...person, Name: e.target.value })}
            placeholder="Full name"
          />
        </div>
        <div>
          <Label className="text-xs">Role</Label>
          <Select value={person.Role || 'Pax'} onValueChange={(v) => onChange({ ...person, Role: v as PersonRole })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {PERSON_ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Phone</Label>
          <Input
            value={getPreferredContact(person.Channels, 'Phone') || ''}
            onChange={(e) => onChange({ ...person, Channels: setPreferredChannelValue(person.Channels ?? [], 'Phone', e.target.value) })}
            placeholder="+1-555-0100"
          />
        </div>
        <div>
          <Label className="text-xs">Email</Label>
          <Input
            value={getPreferredContact(person.Channels, 'Email') || ''}
            onChange={(e) => onChange({ ...person, Channels: setPreferredChannelValue(person.Channels ?? [], 'Email', e.target.value) })}
            placeholder="email@example.com"
          />
        </div>
      </div>
    </div>
  );
}

// ─── Main Wizard ────────────────────────────────────────────────────────────

export default function NewTripWizard() {
  const navigate = useNavigate();
  const { canEdit, user: authUser } = useAuth();
  const [step, setStep] = useState(0);
  const [tripId, setTripId] = useState('');
  useEffect(() => {
    nextTripId().then(setTripId);
  }, []);

  // Trip basics
  const [client, setClient] = useState('');
  const [clientId, setClientId] = useState<string | undefined>(undefined);
  const [operator, setOperator] = useState('');
  const [icaoType, setIcaoType] = useState('');
  const [registration, setRegistration] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [mtowUnit, setMtowUnit] = useState<'kg' | 'lb'>('kg');
  const [owner, setOwner] = useState('');
  const [ownerUserId, setOwnerUserId] = useState<string | undefined>(undefined);
  const [team, setTeam] = useState('');
  const [status, setStatus] = useState<TripStatus>('Planning');
  const [supportRef, setSupportRef] = useState('');
  const [billToLine1, setBillToLine1] = useState('');
  const [billToLine2, setBillToLine2] = useState('');
  const [billToCity, setBillToCity] = useState('');
  const [billToState, setBillToState] = useState('');
  const [billToPostalCode, setBillToPostalCode] = useState('');
  const [billToCountry, setBillToCountry] = useState('');
  const [billToEmails, setBillToEmails] = useState('');

  const [userDirectory, setUserDirectory] = useState<UserDirectoryEntry[]>([]);
  useEffect(() => { getUserDirectory().then(setUserDirectory); }, []);

  // Default the Owner field to whoever's logged in, once the directory
  // loads — still a plain editable field, not locked to this value.
  useEffect(() => {
    if (owner || !authUser || userDirectory.length === 0) return;
    const me = userDirectory.find((u) => u.Username === authUser.username);
    if (me) {
      setOwner(([me.FirstName, me.LastName].filter(Boolean).join(' ') || me.Username).toUpperCase());
      setOwnerUserId(me.ID);
      if (!team && me.Team) setTeam(me.Team);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userDirectory]);

  const clientList = getClientList();

  const selectClient = (c: Client) => {
    setClient(c.Name.toUpperCase());
    setClientId(c.ClientID);
    // Only overwrite bill-to fields if the coordinator hasn't already typed
    // something into them — a selected client pre-fills, it doesn't clobber.
    if (!billToLine1 && !billToCity && !billToEmails) {
      setBillToLine1(c.BillingAddressLine1 || '');
      setBillToLine2(c.BillingAddressLine2 || '');
      setBillToCity(c.BillingCity || '');
      setBillToState(c.BillingState || '');
      setBillToPostalCode(c.BillingPostalCode || '');
      setBillToCountry(c.BillingCountry || '');
      setBillToEmails((c.BillingEmails || []).join(', '));
    }
  };

  const selectAircraft = (a: ReturnType<typeof getAircraftList>[number]) => {
    setRegistration(a.Registration);
    setIcaoType(a.ICAOType);
    setSerialNumber(a.SerialNumber || '');
    const op = refOperators.find((o) => o.OperatorID === a.CurrentOperatorID);
    if (op) setOperator(op.Name);
  };

  const selectedType = icaoType ? getAircraftType(icaoType) : undefined;
  const mtowDisplay = selectedType
    ? mtowUnit === 'kg'
      ? `${selectedType.MTOW_kg.toLocaleString()} kg`
      : `${Math.round(selectedType.MTOW_kg * 2.20462).toLocaleString()} lb`
    : '—';

  // Legs
  const [legs, setLegs] = useState<Partial<Leg>[]>([]);
  // Parallel to `legs` — whether to also arrange departure-country ground
  // handling on request (opt-in; arrival ground handling is always automatic).
  const [depGHRequested, setDepGHRequested] = useState<boolean[]>([]);

  // Stops
  const [stops, setStops] = useState<Partial<Stop>[]>([]);

  // Persons
  const [persons, setPersons] = useState<Partial<Person>[]>([]);

  // Dialogs
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const canProceed = useMemo(() => {
    if (step === 0) return client && operator && icaoType && registration && owner;
    if (step === 1) return legs.length > 0 && legs.every((l) => l.DepICAO && l.ArrICAO && l.ETDZ && l.ETAZ);
    return true;
  }, [step, client, operator, icaoType, registration, owner, legs]);

  const addLeg = () => {
    setLegs((prev) => [
      ...prev,
      {
        LegID: `${tripId}-L${String(prev.length + 1).padStart(2, '0')}`,
        TripID: tripId,
        Seq: prev.length + 1,
        DepICAO: prev.length > 0 ? prev[prev.length - 1].ArrICAO || '' : '',
        ArrICAO: '',
        ETDZ: '',
        ETAZ: '',
        BlockHours: 0,
        PaxCount: 0,
        CrewCount: 1,
        CountriesOverflown: [],
        Revision: 1,
      },
    ]);
    setDepGHRequested((prev) => [...prev, false]);
  };

  const updateLeg = async (idx: number, l: Partial<Leg>) => {
    // Commit the edited field(s) synchronously first, via a functional updater,
    // so this can never be clobbered by another in-flight updateLeg call's
    // stale closure once its await resolves.
    setLegs((prev) => prev.map((leg, i) => (i === idx ? { ...leg, ...l } : leg)));

    const currentLeg: Partial<Leg> = { ...legs[idx], ...l };
    if (currentLeg.DepICAO?.length === 4 && currentLeg.ArrICAO?.length === 4) {
      const countriesOverflown = await computeCountriesOverflown(currentLeg.DepICAO, currentLeg.ArrICAO);
      // Patch only CountriesOverflown on top of whatever the row's current
      // state is by the time this resolves — never overwrite a concurrent
      // edit to some other field made while this lookup was in flight.
      setLegs((prev) => prev.map((leg, i) => (i === idx ? { ...leg, CountriesOverflown: countriesOverflown } : leg)));
    }
  };

  const removeLeg = (idx: number) => {
    setLegs((prev) => prev.filter((_, i) => i !== idx).map((leg, i) => ({ ...leg, Seq: i + 1, LegID: `${tripId}-L${String(i + 1).padStart(2, '0')}` })));
    setDepGHRequested((prev) => prev.filter((_, i) => i !== idx));
  };

  const addStop = () => {
    setStops((prev) => [
      ...prev,
      {
        StopID: `${tripId}-S${String(prev.length + 1).padStart(2, '0')}`,
        TripID: tripId,
        ICAO: '',
        ArrZ: '',
        DepZ: '',
        GroundTimeHours: 0,
        Purpose: 'Night',
      },
    ]);
  };

  const updateStop = (idx: number, s: Partial<Stop>) => {
    setStops((prev) => prev.map((stop, i) => (i === idx ? { ...stop, ...s } : stop)));
  };

  const removeStop = (idx: number) => {
    setStops((prev) => prev.filter((_, i) => i !== idx).map((stop, i) => ({ ...stop, StopID: `${tripId}-S${String(i + 1).padStart(2, '0')}` })));
  };

  const addPerson = () => {
    setPersons((prev) => [
      ...prev,
      {
        PersonID: `PER-${tripId}-${String(prev.length + 1).padStart(3, '0')}`,
        TripID: tripId,
        Name: '',
        Role: 'Pax',
        Channels: [],
      },
    ]);
  };

  const updatePerson = (idx: number, p: Partial<Person>) => {
    setPersons((prev) => prev.map((person, i) => (i === idx ? { ...person, ...p } : person)));
  };

  const removePerson = (idx: number) => {
    setPersons((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    if (!canEdit) return;
    setSaveError(null);
    setSaving(true);
    try {
    // Register the aircraft (type + registration) if it isn't already in the catalog
    if (!getAircraftList().some((a) => a.Registration === registration)) {
      const type = getAircraftType(icaoType);
      saveAircraft({
        Registration: registration,
        ICAOType: icaoType,
        Manufacturer: type?.Manufacturer || 'Unknown',
        MTOW_kg: type?.MTOW_kg || 0,
        NoiseCert: type?.NoiseCert || 'Unknown',
        SerialNumber: serialNumber || undefined,
      });
    }

    // A typed client name with no matching record becomes a new Client row
    // (Item 12: "clients must be saved in the database") — a selected match
    // already has clientId set and needs no new row.
    let resolvedClientId = clientId;
    if (!resolvedClientId && client.trim()) {
      const created = await saveClient({
        ClientID: `CLI-${Date.now()}`,
        Name: client.trim(),
        IsOperator: false,
        BillingAddressLine1: billToLine1 || undefined,
        BillingAddressLine2: billToLine2 || undefined,
        BillingCity: billToCity || undefined,
        BillingState: billToState || undefined,
        BillingPostalCode: billToPostalCode || undefined,
        BillingCountry: billToCountry || undefined,
        BillingEmails: billToEmails.split(',').map((e) => e.trim()).filter(Boolean),
      });
      resolvedClientId = created.ClientID;
    }

    // Legacy single-line BillToAddress kept in sync from the structured
    // fields so existing display code (BillingPage.tsx, resolveBillToAddress)
    // that only reads the flat string still works without its own rewrite.
    const billToAddressLine = [billToLine1, billToLine2, billToCity, billToState, billToPostalCode, billToCountry]
      .filter(Boolean).join(', ') || undefined;

    // Save trip
    const trip: Trip = {
      TripID: tripId,
      Client: client,
      ClientID: resolvedClientId,
      Operator: operator,
      Registration: registration,
      Status: status,
      Owner: owner,
      OwnerUserID: ownerUserId,
      Team: team || undefined,
      CreatedZ: new Date().toISOString(),
      SupportRef: supportRef || undefined,
      BillToAddress: billToAddressLine,
      BillToAddressLine1: billToLine1 || undefined,
      BillToAddressLine2: billToLine2 || undefined,
      BillToCity: billToCity || undefined,
      BillToState: billToState || undefined,
      BillToPostalCode: billToPostalCode || undefined,
      BillToCountry: billToCountry || undefined,
      BillToEmails: billToEmails.split(',').map((e) => e.trim()).filter(Boolean),
      AircraftICAOType: icaoType || undefined,
      AircraftMTOWKg: selectedType?.MTOW_kg,
      AircraftSerialNumber: serialNumber || undefined,
    };
    await saveTrip(trip);

    // Save legs, then auto-derive overflight + landing/ground-handling services
    for (const [idx, l] of legs.entries()) {
      await saveLeg(l as Leg);
      await generateOverflightServices((l as Leg).LegID);
      await generateArrivalServices((l as Leg).LegID, { departureGroundHandling: depGHRequested[idx] });
    }

    // Save stops
    for (const s of stops) {
      await saveStop(s as Stop);
    }

    // Save persons
    persons.forEach((p) => {
      savePerson(p as Person);
    });

    setConfirmOpen(true);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Failed to save trip. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const steps = ['Trip Basics', 'Legs', 'Stops', 'Crew & Passengers', 'Review'];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => navigate('/admin/trips')}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">New Trip</h1>
          <p className="text-sm text-muted-foreground">Trip ID: <span className="font-mono font-medium">{tripId}</span></p>
        </div>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-2">
        {steps.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <Badge
              variant={i === step ? 'default' : i < step ? 'secondary' : 'outline'}
              className="cursor-pointer"
              onClick={() => i <= step && setStep(i)}
            >
              {i < step ? <CheckCircle2 className="h-3 w-3 mr-1" /> : null}
              {s}
            </Badge>
            {i < steps.length - 1 && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          </div>
        ))}
      </div>

      {/* Step 0: Trip Basics */}
      {step === 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Trip Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>Registration</Label>
                <Typeahead
                  value={registration}
                  onChange={(v) => setRegistration(normalizeRegistration(v))}
                  options={getAircraftList()}
                  getLabel={(a) => `${a.Registration} — ${a.Manufacturer} (${a.ICAOType})`}
                  getKey={(a) => a.Registration}
                  onSelect={selectAircraft}
                  placeholder="E.G. N123AB — type to find an existing aircraft"
                  className="uppercase"
                />
                <p className="mt-1 text-[11px] text-muted-foreground">Matching an existing tail auto-fills Operator, ICAO Type, MTOW & Serial below.</p>
              </div>
              <div>
                <Label>Client</Label>
                <Typeahead
                  value={client}
                  onChange={(v) => { setClient(v.toUpperCase()); setClientId(undefined); }}
                  options={clientList}
                  getLabel={(c) => c.Name}
                  getKey={(c) => c.ClientID}
                  onSelect={selectClient}
                  placeholder="E.G. APEX CAPITAL PARTNERS"
                  className="uppercase"
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {clientId ? 'Matched an existing client — billing details pre-filled below.' : 'No match — a new client record will be created on save.'}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <Label>Operator</Label>
                <Select value={operator} onValueChange={setOperator}>
                  <SelectTrigger><SelectValue placeholder="Select operator..." /></SelectTrigger>
                  <SelectContent>
                    {refOperators.map((o) => (
                      <SelectItem key={o.OperatorID} value={o.Name}>{o.Name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Aircraft ICAO Type</Label>
                <Select value={icaoType} onValueChange={setIcaoType}>
                  <SelectTrigger><SelectValue placeholder="Select ICAO type..." /></SelectTrigger>
                  <SelectContent>
                    {refAircraftTypes.map((t) => (
                      <SelectItem key={t.ICAOType} value={t.ICAOType}>{t.ICAOType} — {t.Manufacturer} {t.Model}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Serial Number (optional)</Label>
                <Input
                  value={serialNumber}
                  onChange={(e) => setSerialNumber(e.target.value)}
                  placeholder="E.G. 12345"
                />
              </div>
            </div>
            <div className="rounded-lg border p-3 flex items-center justify-between bg-muted/30">
              <div className="text-sm">
                <span className="text-muted-foreground">MTOW ({selectedType?.ICAOType || 'select a type'}): </span>
                <span className="font-semibold">{mtowDisplay}</span>
              </div>
              <div className="flex gap-1">
                <Button type="button" size="sm" variant={mtowUnit === 'kg' ? 'default' : 'outline'} className="h-7 px-2 text-xs" onClick={() => setMtowUnit('kg')}>KG</Button>
                <Button type="button" size="sm" variant={mtowUnit === 'lb' ? 'default' : 'outline'} className="h-7 px-2 text-xs" onClick={() => setMtowUnit('lb')}>LB</Button>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <Label>Owner / Trip Manager</Label>
                <Typeahead
                  value={owner}
                  onChange={(v) => { setOwner(v.toUpperCase()); setOwnerUserId(undefined); }}
                  options={userDirectory}
                  getLabel={(u) => [u.FirstName, u.LastName].filter(Boolean).join(' ') || u.Username}
                  getKey={(u) => u.ID}
                  onSelect={(u) => { setOwner(([u.FirstName, u.LastName].filter(Boolean).join(' ') || u.Username).toUpperCase()); setOwnerUserId(u.ID); if (u.Team) setTeam(u.Team); }}
                  placeholder="E.G. SARAH MITCHELL"
                  className="uppercase"
                />
              </div>
              <div>
                <Label>Team (optional)</Label>
                <Input
                  value={team}
                  onChange={(e) => setTeam(e.target.value)}
                  placeholder="E.G. OPERATIONS"
                />
              </div>
              <div>
                <Label>Status</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as TripStatus)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TRIP_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Support Ref (optional)</Label>
              <Input
                value={supportRef}
                onChange={(e) => setSupportRef(e.target.value.toUpperCase())}
                placeholder="E.G. 125121395"
                className="uppercase"
              />
            </div>
            <Separator />
            <div>
              <Label className="text-sm font-semibold">Bill To (optional — defaults to the aircraft's operator billing address if left blank)</Label>
              <div className="mt-2 space-y-2">
                <Input value={billToLine1} onChange={(e) => setBillToLine1(e.target.value)} placeholder="Address line 1" />
                <Input value={billToLine2} onChange={(e) => setBillToLine2(e.target.value)} placeholder="Address line 2" />
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <Input value={billToCity} onChange={(e) => setBillToCity(e.target.value)} placeholder="City" />
                  <Input value={billToState} onChange={(e) => setBillToState(e.target.value)} placeholder="State / Region" />
                  <Input value={billToPostalCode} onChange={(e) => setBillToPostalCode(e.target.value)} placeholder="Postal Code" />
                  <Input value={billToCountry} onChange={(e) => setBillToCountry(e.target.value)} placeholder="Country" />
                </div>
                <Input value={billToEmails} onChange={(e) => setBillToEmails(e.target.value)} placeholder="Billing email(s), comma-separated" />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 1: Legs */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Legs</h2>
            <Button size="sm" onClick={addLeg}>
              <Plus className="mr-1 h-4 w-4" />
              Add Leg
            </Button>
          </div>
          {legs.length === 0 && (
            <div className="text-center text-muted-foreground py-8">No legs yet. Click Add Leg to start building the itinerary.</div>
          )}
          <div className="space-y-3">
            {legs.map((leg, idx) => (
              <LegRow
                key={idx}
                leg={leg}
                idx={idx}
                onChange={(l) => updateLeg(idx, l)}
                onRemove={() => removeLeg(idx)}
                depGroundHandling={depGHRequested[idx] ?? false}
                onToggleDepGroundHandling={(v) =>
                  setDepGHRequested((prev) => prev.map((val, i) => (i === idx ? v : val)))
                }
              />
            ))}
          </div>
        </div>
      )}

      {/* Step 2: Stops */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Stops</h2>
            <Button size="sm" onClick={addStop}>
              <Plus className="mr-1 h-4 w-4" />
              Add Stop
            </Button>
          </div>
          {stops.length === 0 && (
            <div className="text-center text-muted-foreground py-8">No stops defined. Stops are optional — add them for overnight or tech stops.</div>
          )}
          <div className="space-y-3">
            {stops.map((stop, idx) => (
              <StopRow
                key={idx}
                stop={stop}
                idx={idx}
                onChange={(s) => updateStop(idx, s)}
                onRemove={() => removeStop(idx)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Step 3: Crew & Pax */}
      {step === 3 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Crew & Passengers</h2>
            <Button size="sm" onClick={addPerson}>
              <Users className="mr-1 h-4 w-4" />
              Add Person
            </Button>
          </div>
          {persons.length === 0 && (
            <div className="text-center text-muted-foreground py-8">No persons added yet.</div>
          )}
          <div className="space-y-3">
            {persons.map((person, idx) => (
              <PersonRow
                key={idx}
                person={person}
                idx={idx}
                onChange={(p) => updatePerson(idx, p)}
                onRemove={() => removePerson(idx)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Step 4: Review */}
      {step === 4 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Review & Save</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border p-4 space-y-2">
              <div className="font-semibold">{tripId}</div>
              <div className="text-sm text-muted-foreground">{client} — {registration} — {operator}</div>
              <div className="text-sm text-muted-foreground">Owner: {owner} | Status: {status}</div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="rounded-lg border p-3 text-center">
                <div className="text-2xl font-bold">{legs.length}</div>
                <div className="text-xs text-muted-foreground">Legs</div>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <div className="text-2xl font-bold">{stops.length}</div>
                <div className="text-xs text-muted-foreground">Stops</div>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <div className="text-2xl font-bold">{persons.length}</div>
                <div className="text-xs text-muted-foreground">Persons</div>
              </div>
            </div>
            <Button className="w-full" onClick={() => canEdit && handleSave()} disabled={saving || !canEdit}>
              {saving ? 'SAVING…' : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Save Trip
                </>
              )}
            </Button>
            {saveError && (
              <p className="text-xs text-destructive text-center mt-2">{saveError}</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Navigation */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
          Previous
        </Button>
        <Button onClick={() => setStep((s) => Math.min(steps.length - 1, s + 1))} disabled={!canProceed || step === steps.length - 1}>
          Next
        </Button>
      </div>

      {/* Success Dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              Trip Created
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm">Trip <span className="font-mono font-medium">{tripId}</span> has been saved successfully.</p>
            <p className="text-xs text-muted-foreground">You can now view it in the trip list or manage services for it.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => navigate('/admin/trips')}>Manage Trips</Button>
            <Button onClick={() => navigate(`/trips/${tripId}`)}>View Trip Sheet</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
