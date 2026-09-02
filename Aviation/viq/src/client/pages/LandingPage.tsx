import { useState, useEffect } from 'react';
import { Link } from 'react-router';
import {
  refAircraftTypes as aircraftTypes, refAircraft, refCountries, refCountryRules,
  getAirport, getCountry, getAircraftType, computeCountriesOverflown, normalizeRegistration,
} from '@/lib/dataStore';
import { apiFetch } from '@/lib/apiClient';
import type { PersonRole } from '@/data/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Combobox } from '@/components/ui/combobox';
import LandingHero, { type LandingMode } from '@/components/LandingHero';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import {
  Plane, Plus, Trash2, MapPin, Users, Clock, FileText,
  CheckCircle2, Globe, Send, ChevronRight
} from 'lucide-react';

// ─── Rough distance lookup (nm) for common pairs — fallback estimator ───────

const ROUGH_DISTANCES: Record<string, number> = {
  'EGLL-OMDB': 3000, 'OMDB-HKJK': 2200, 'HKJK-EGLL': 4200,
  'LSGG-OERK': 2700, 'OERK-HECA': 800, 'HECA-LSGG': 1800,
  'WIII-FACT': 5300, 'FACT-FALA': 800,
  'FWCL-FALA': 600, 'FALA-HECA': 3600,
  'FACT-LFMN': 4800, 'HAAB-DGAA': 2200,
};

function roughDistanceNm(dep: string, arr: string): number {
  const key = `${dep}-${arr}`;
  const rev = `${arr}-${dep}`;
  return ROUGH_DISTANCES[key] || ROUGH_DISTANCES[rev] || 2500; // default fallback
}

function estimateEetHours(distanceNm: number): number {
  const speedKnots = 460; // typical bizjet cruise
  return Math.round((distanceNm / speedKnots) * 10) / 10;
}

const OPERATION_TYPES = ['Private — Non-Revenue', 'Charter', 'Cargo', 'Medivac'];
const MISSION_TYPES = ['Business', 'Reposition', 'Tourism', 'Humanitarian', 'Medical', 'Training', 'Other'];
const PERSON_ROLES = ['PIC', 'SIC', 'FA', 'Mechanic', 'Engineer', 'Medical Staff', 'Other', 'Pax', 'VIP', 'Principal'];
const PERSON_ROLE_OPTIONS = PERSON_ROLES.map((r) => ({ value: r.toUpperCase(), label: r.toUpperCase() }));
// The UI stores/displays roles upper-cased (PERSON_ROLE_OPTIONS above); the
// backend's PersonRole enum (CreateQuoteDto) expects PERSON_ROLES' exact
// casing ('Pax', 'Medical Staff', etc.) — map back to canonical casing at
// the API boundary in submitQuote below.
const PERSON_ROLE_CANONICAL: Record<string, PersonRole> = Object.fromEntries(
  PERSON_ROLES.map((r) => [r.toUpperCase(), r as PersonRole])
);
const NATIONALITY_OPTIONS = [...refCountries]
  .sort((a, b) => a.Name.localeCompare(b.Name))
  .map((c) => ({ value: c.Name.toUpperCase(), label: c.Name.toUpperCase() }));

// ─── Types ──────────────────────────────────────────────────────────────────

interface LandingLeg {
  id: string;
  dep: string;
  arr: string;
  etdDate: string;
  etdTime: string;
  callSign: string;
  // Manual FIR overrides on top of the great-circle route computation
  addFirs: string[];
  avoidFirs: string[];
}

interface LandingPerson {
  id: string;
  name: string;
  role: string;
  nationality: string;
}

type ServiceLineType = 'Overflight' | 'Permit' | 'GroundHandling';

const SERVICE_TYPE_LABEL: Record<ServiceLineType, string> = {
  Overflight: 'Overflight Permit',
  Permit: 'Landing Permit',
  GroundHandling: 'Ground Handling',
};

interface ServiceLine {
  id: string; // `${countryIso2}-${type}`
  legId: string; // LandingLeg.id this was first derived from — used to scope the real Service on submit
  countryIso2: string;
  countryName: string;
  type: ServiceLineType;
  leadTimeHours: number;
  included: boolean;
  auto: boolean; // true = system-derived from the route, false = manually added
}

interface EnquiryResult {
  tripId: string;
  legs: LandingLeg[];
  aircraftType: string;
  registration: string;
  operationType: string;
  missionType: string;
  persons: LandingPerson[];
  analysis: {
    totalDistance: number;
    totalEet: number;
    countries: string[];
    verdict: string;
  };
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function LandingPage() {
  const [mode, setMode] = useState<LandingMode | null>(null);
  const [clientName, setClientName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [aircraftTypeIcao, setAircraftTypeIcao] = useState('');
  const [registration, setRegistration] = useState('');
  const [operationType, setOperationType] = useState('');
  const [missionType, setMissionType] = useState('');
  const [notes, setNotes] = useState('');

  const [legs, setLegs] = useState<LandingLeg[]>([
    { id: '1', dep: '', arr: '', etdDate: '', etdTime: '', callSign: '', addFirs: [], avoidFirs: [] }
  ]);
  const [persons, setPersons] = useState<LandingPerson[]>([]);
  const [enquiry, setEnquiry] = useState<EnquiryResult | null>(null);
  const [serviceLines, setServiceLines] = useState<ServiceLine[]>([]);
  const [addFirIso, setAddFirIso] = useState('');
  const [showResult, setShowResult] = useState(false);
  const [submittedTripId, setSubmittedTripId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [overflownByLeg, setOverflownByLeg] = useState<Record<string, string[]>>({});

  useEffect(() => {
    legs.forEach((leg) => {
      if (leg.dep.length === 4 && leg.arr.length === 4) {
        computeCountriesOverflown(leg.dep, leg.arr).then((result) => {
          setOverflownByLeg((prev) => ({ ...prev, [leg.id]: result }));
        });
      }
    });
  }, [legs.map((l) => `${l.id}:${l.dep}:${l.arr}`).join('|')]);

  const selectedType = aircraftTypeIcao ? getAircraftType(aircraftTypeIcao) : undefined;
  const matchedAircraft = registration
    ? refAircraft.find((a) => a.Registration === normalizeRegistration(registration))
    : undefined;
  const mtowKg = matchedAircraft?.MTOW_kg || selectedType?.MTOW_kg || 0;
  const noiseCert = matchedAircraft?.NoiseCert || selectedType?.NoiseCert || '—';

  const addLeg = () => {
    setLegs([...legs, {
      id: Date.now().toString(),
      dep: '', arr: '', etdDate: '', etdTime: '', callSign: '', addFirs: [], avoidFirs: [],
    }]);
  };

  const removeLeg = (id: string) => {
    if (legs.length <= 1) return;
    setLegs(legs.filter(l => l.id !== id));
  };

  const updateLeg = (id: string, field: keyof LandingLeg, value: string) => {
    setLegs(legs.map(l => l.id === id ? { ...l, [field]: value.toUpperCase() } : l));
  };

  // Adding a FIR that was previously avoided just un-avoids it (it's already
  // part of the computed route); otherwise it's a manual addition.
  const addLegFir = (legId: string, iso2: string) => {
    setLegs((prev) => prev.map((l) => {
      if (l.id !== legId) return l;
      if (l.avoidFirs.includes(iso2)) return { ...l, avoidFirs: l.avoidFirs.filter((x) => x !== iso2) };
      if (l.addFirs.includes(iso2)) return l;
      return { ...l, addFirs: [...l.addFirs, iso2] };
    }));
  };

  // Removing a manually-added FIR just un-adds it; removing a computed one
  // marks it avoided so it's excluded from the route/permit list.
  const removeLegFir = (legId: string, iso2: string) => {
    setLegs((prev) => prev.map((l) => {
      if (l.id !== legId) return l;
      if (l.addFirs.includes(iso2)) return { ...l, addFirs: l.addFirs.filter((x) => x !== iso2) };
      return { ...l, avoidFirs: [...l.avoidFirs, iso2] };
    }));
  };

  const addPerson = () => {
    setPersons([...persons, { id: Date.now().toString(), name: '', role: 'PAX', nationality: '' }]);
  };

  const removePerson = (id: string) => {
    setPersons(persons.filter(p => p.id !== id));
  };

  const updatePerson = (id: string, field: keyof LandingPerson, value: string) => {
    setPersons(persons.map(p => p.id === id ? { ...p, [field]: field === 'name' || field === 'nationality' ? value.toUpperCase() : value } : p));
  };

  const analyzeRoute = async () => {
    if (!selectedType) return;

    const validLegs = legs.filter(l => l.dep && l.arr);
    if (validLegs.length === 0) return;

    setSubmittedTripId(null);

    let totalDist = 0;
    const countrySet = new Set<string>();
    const lines: ServiceLine[] = [];

    const pushLine = (legId: string, iso2: string, type: ServiceLineType, included: boolean, auto: boolean) => {
      const id = `${iso2}-${type}`;
      if (lines.some((l) => l.id === id)) return;
      const country = getCountry(iso2);
      const rule = refCountryRules.find((r) => r.CountryISO2 === iso2 && r.ServiceType === type);
      const fallbackLead = type === 'Overflight' ? 48 : type === 'Permit' ? 72 : 24;
      lines.push({
        id, legId, countryIso2: iso2, countryName: country?.Name || iso2, type,
        leadTimeHours: rule?.LeadTimeHours ?? fallbackLead,
        included, auto,
      });
    };

    for (const leg of validLegs) {
      const dist = roughDistanceNm(leg.dep, leg.arr);
      totalDist += dist;

      const depAp = getAirport(leg.dep);
      const arrAp = getAirport(leg.arr);

      if (depAp?.CountryISO2) countrySet.add(depAp.CountryISO2);
      if (arrAp?.CountryISO2) countrySet.add(arrAp.CountryISO2);

      // Countries the great-circle route actually overflies (excludes dep/arr),
      // adjusted by this leg's manual add/avoid FIR overrides
      const baseOverflown = await computeCountriesOverflown(leg.dep, leg.arr);
      const overflown = Array.from(new Set([...baseOverflown, ...leg.addFirs])).filter(
        (iso2) => !leg.avoidFirs.includes(iso2)
      );
      overflown.forEach((iso2) => {
        countrySet.add(iso2);
        const country = getCountry(iso2);
        if (country?.OverflightPermitRequired) {
          pushLine(leg.id, iso2, 'Overflight', true, true);
        }
      });

      // Arrival: landing permit (if required) + ground handling — both automatic
      if (arrAp) {
        const arrCountry = getCountry(arrAp.CountryISO2);
        if (arrCountry?.LandingPermitRequired) pushLine(leg.id, arrAp.CountryISO2, 'Permit', true, true);
        pushLine(leg.id, arrAp.CountryISO2, 'GroundHandling', true, true);
      }
      // Departure ground handling — opt-in, shown unchecked (arranged on request)
      if (depAp) pushLine(leg.id, depAp.CountryISO2, 'GroundHandling', false, false);
    }

    const totalEet = estimateEetHours(totalDist);

    const rangeNm = mtowKg > 40000 ? 6500 : 4500; // rough range estimate
    const verdict = totalDist > rangeNm * 1.2
      ? 'AIRCRAFT RANGE INSUFFICIENT — FUEL STOP(S) REQUIRED'
      : totalDist > rangeNm
      ? 'AIRCRAFT RANGE MARGINAL — CONSIDER FUEL STOP'
      : 'ROUTE FEASIBLE WITH CURRENT AIRCRAFT';

    const result: EnquiryResult = {
      tripId: `ENQ-${new Date().toISOString().slice(2, 4)}${new Date().toISOString().slice(5, 7)}${Math.floor(Math.random() * 900 + 100)}`,
      legs: validLegs,
      aircraftType: selectedType.ICAOType,
      registration,
      operationType,
      missionType,
      persons,
      analysis: {
        totalDistance: totalDist,
        totalEet,
        countries: Array.from(countrySet).map(iso => getCountry(iso)?.Name || iso),
        verdict,
      }
    };

    setEnquiry(result);
    setServiceLines(lines);
    setShowResult(true);
  };

  const toggleServiceLine = (id: string) => {
    setServiceLines((prev) => prev.map((l) => (l.id === id ? { ...l, included: !l.included } : l)));
  };

  const addFirCountry = () => {
    if (!addFirIso || !enquiry) return;
    const country = getCountry(addFirIso);
    if (!country) return;
    const id = `${addFirIso}-Overflight`;
    setServiceLines((prev) => {
      if (prev.some((l) => l.id === id)) return prev;
      const rule = refCountryRules.find((r) => r.CountryISO2 === addFirIso && r.ServiceType === 'Overflight');
      return [...prev, {
        id, legId: enquiry.legs[0].id, countryIso2: addFirIso, countryName: country.Name, type: 'Overflight',
        leadTimeHours: rule?.LeadTimeHours ?? 48, included: true, auto: false,
      }];
    });
    setAddFirIso('');
  };

  const firOptions = refCountries.filter(
    (c) => !serviceLines.some((l) => l.countryIso2 === c.ISO2 && l.type === 'Overflight')
  );

  // Persists the enquiry as a real Trip (+ Legs, Services, Persons) via the
  // single atomic, unauthenticated POST /api/quotes endpoint — this page has
  // no logged-in session, so the old sequential saveTrip/saveLeg/saveService
  // calls (now behind the auth guard) would 401.
  const submitQuote = async () => {
    if (!enquiry || !clientName.trim()) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
    const legEtdMap: Record<string, string> = {};

    const legsPayload = enquiry.legs.map((leg, i) => {
      const dist = roughDistanceNm(leg.dep, leg.arr);
      const blockHours = estimateEetHours(dist);
      const etdIso = leg.etdDate && leg.etdTime
        ? new Date(`${leg.etdDate}T${leg.etdTime}:00Z`).toISOString()
        : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const etaIso = new Date(new Date(etdIso).getTime() + blockHours * 60 * 60 * 1000).toISOString();
      legEtdMap[leg.id] = etdIso;

      const legOverflown = serviceLines
        .filter((l) => l.legId === leg.id && l.type === 'Overflight' && l.included)
        .map((l) => l.countryIso2);

      return {
        clientLegId: leg.id,
        seq: i + 1,
        depIcao: leg.dep,
        arrIcao: leg.arr,
        etdZ: etdIso,
        etaZ: etaIso,
        blockHours,
        countriesOverflown: legOverflown,
        callSign: leg.callSign || undefined,
      };
    });

    const servicesPayload = serviceLines.filter((l) => l.included).map((l) => ({
      clientLegId: l.legId,
      serviceType: l.type,
      countryIso2: l.countryIso2,
      leadTimeHours: l.leadTimeHours,
      auto: l.auto,
      notes: `Web enquiry — ${l.auto ? 'auto-derived' : 'manually added'} ${SERVICE_TYPE_LABEL[l.type]} for ${l.countryName}.`,
    }));

    const personsPayload = persons
      .filter((p) => p.name.trim())
      .map((p) => ({
        name: p.name,
        role: (PERSON_ROLE_CANONICAL[p.role] ?? p.role) as PersonRole,
        passportNationality: p.nationality || undefined,
      }));

    const res = await apiFetch('/quotes', {
      method: 'POST',
      body: JSON.stringify({
        client: clientName.trim(),
        contactEmail: contactEmail.trim() || undefined,
        registration: registration || enquiry.aircraftType,
        operationType: operationType || undefined,
        missionType: missionType || undefined,
        notes: notes || undefined,
        legs: legsPayload,
        services: servicesPayload,
        persons: personsPayload,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Quote submission failed: ${res.status} ${body}`);
    }

    const result = await res.json();
    setSubmittedTripId(result.trip.tripId);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Quote submission failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!mode) {
    return (
      <LandingHero
        onSelect={(m) => {
          setMode(m);
          if (m === 'charter') setOperationType('Charter');
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2">
            <Plane className="h-6 w-6 text-primary" />
            <span className="text-xl font-bold tracking-tight">VIQ</span>
          </div>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setMode(null)}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              ← BACK TO OPTIONS
            </button>
            <Link to="/trips" className="text-sm text-muted-foreground hover:text-foreground">
              INTERNAL LOGIN
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">
        {/* Hero */}
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight">
            {mode === 'charter' ? 'PLAN YOUR PRIVATE FLIGHT' : 'REQUEST PERMITS & GROUND HANDLING'}
          </h1>
          <p className="mt-2 text-muted-foreground">
            MULTI-LEG ROUTE PLANNER WITH PERMIT INTELLIGENCE — NO REGISTRATION REQUIRED
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left: Builder Form */}
          <div className="lg:col-span-2 space-y-6">
            {/* Contact Details */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  YOUR DETAILS
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs">CLIENT / COMPANY NAME</Label>
                    <Input
                      value={clientName}
                      onChange={(e) => setClientName(e.target.value.toUpperCase())}
                      placeholder="REQUIRED TO SUBMIT A QUOTE"
                      className="uppercase"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">CONTACT EMAIL (OPTIONAL)</Label>
                    <Input
                      type="email"
                      value={contactEmail}
                      onChange={(e) => setContactEmail(e.target.value)}
                      placeholder="you@example.com"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Aircraft Selection */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Plane className="h-4 w-4" />
                  STEP 1 — SELECT AIRCRAFT
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-xs">AIRCRAFT TYPE</Label>
                  <Select value={aircraftTypeIcao} onValueChange={setAircraftTypeIcao}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose aircraft type..." />
                    </SelectTrigger>
                    <SelectContent>
                      {aircraftTypes.map(t => (
                        <SelectItem key={t.ICAOType} value={t.ICAOType}>
                          {t.ICAOType} — {t.Manufacturer} {t.Model}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs">REGISTRATION (OPTIONAL)</Label>
                    <Input
                      value={registration}
                      onChange={(e) => setRegistration(e.target.value.toUpperCase())}
                      placeholder="E.G. N123AB"
                      className="uppercase"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">OPERATION TYPE</Label>
                    <Select value={operationType} onValueChange={setOperationType}>
                      <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                      <SelectContent>
                        {OPERATION_TYPES.map(o => <SelectItem key={o} value={o}>{o.toUpperCase()}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label className="text-xs">MISSION TYPE</Label>
                  <Select value={missionType} onValueChange={setMissionType}>
                    <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                    <SelectContent>
                      {MISSION_TYPES.map(m => <SelectItem key={m} value={m}>{m.toUpperCase()}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs">NOTES (OPTIONAL)</Label>
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Anything the ops team should know..."
                    rows={2}
                  />
                </div>

                {selectedType && (
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div className="rounded-md bg-slate-50 p-3 text-center">
                      <div className="text-xs text-muted-foreground">
                        MTOW {matchedAircraft ? '(REGISTRY)' : '(TYPE DEFAULT)'}
                      </div>
                      <div className="font-bold">{mtowKg.toLocaleString()} KG</div>
                    </div>
                    <div className="rounded-md bg-slate-50 p-3 text-center">
                      <div className="text-xs text-muted-foreground">TYPE</div>
                      <div className="font-bold">{selectedType.ICAOType}</div>
                    </div>
                    <div className="rounded-md bg-slate-50 p-3 text-center">
                      <div className="text-xs text-muted-foreground">NOISE</div>
                      <div className="font-bold">{noiseCert}</div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Leg Builder */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  STEP 2 — BUILD ROUTE
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {legs.map((leg, idx) => {
                  const legDepIso = getAirport(leg.dep)?.CountryISO2;
                  const legArrIso = getAirport(leg.arr)?.CountryISO2;
                  const baseOverflown = leg.dep.length === 4 && leg.arr.length === 4
                    ? (overflownByLeg[leg.id] ?? [])
                    : [];
                  const effectiveOverflown = Array.from(new Set([...baseOverflown, ...leg.addFirs])).filter(
                    (iso2) => !leg.avoidFirs.includes(iso2)
                  );
                  const legFirOptions = refCountries.filter(
                    (c) => !effectiveOverflown.includes(c.ISO2) && c.ISO2 !== legDepIso && c.ISO2 !== legArrIso
                  );
                  return (
                  <div key={leg.id} className="rounded-lg border p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">LEG {idx + 1}</span>
                      {legs.length > 1 && (
                        <Button variant="ghost" size="sm" onClick={() => removeLeg(leg.id)}>
                          <Trash2 className="h-3.5 w-3.5 text-red-500" />
                        </Button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-xs">FROM (ICAO)</Label>
                        <Input
                          value={leg.dep}
                          onChange={(e) => updateLeg(leg.id, 'dep', e.target.value)}
                          placeholder="EGLL"
                          maxLength={4}
                          className="uppercase"
                        />
                        {leg.dep && getAirport(leg.dep) && (
                          <div className="text-xs text-muted-foreground mt-1">
                            {getAirport(leg.dep)?.Name?.toUpperCase()} — {getCountry(getAirport(leg.dep)?.CountryISO2 || '')?.Name?.toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div>
                        <Label className="text-xs">TO (ICAO)</Label>
                        <Input
                          value={leg.arr}
                          onChange={(e) => updateLeg(leg.id, 'arr', e.target.value)}
                          placeholder="OMDB"
                          maxLength={4}
                          className="uppercase"
                        />
                        {leg.arr && getAirport(leg.arr) && (
                          <div className="text-xs text-muted-foreground mt-1">
                            {getAirport(leg.arr)?.Name?.toUpperCase()} — {getCountry(getAirport(leg.arr)?.CountryISO2 || '')?.Name?.toUpperCase()}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <Label className="text-xs">DATE</Label>
                        <Input
                          type="date"
                          value={leg.etdDate}
                          onChange={(e) => updateLeg(leg.id, 'etdDate', e.target.value)}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">TIME (UTC)</Label>
                        <Input
                          type="time"
                          value={leg.etdTime}
                          onChange={(e) => updateLeg(leg.id, 'etdTime', e.target.value)}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">CALL SIGN</Label>
                        <Input
                          value={leg.callSign}
                          onChange={(e) => updateLeg(leg.id, 'callSign', e.target.value)}
                          placeholder="ACW169"
                          className="uppercase"
                        />
                      </div>
                    </div>

                    {leg.dep.length === 4 && leg.arr.length === 4 && (
                      <div className="rounded-md border bg-muted/40 p-3 space-y-2">
                        <Label className="text-xs">OVERFLOWN FIRs (OPTIONAL — ADD OR AVOID TO ALTER PERMITS)</Label>
                        <div className="flex flex-wrap gap-1">
                          {effectiveOverflown.length === 0 && (
                            <span className="text-xs text-muted-foreground">NONE COMPUTED FOR THIS LEG</span>
                          )}
                          {effectiveOverflown.map((iso2) => (
                            <Badge key={iso2} variant="outline" className="text-[10px] gap-1 pr-1">
                              {getCountry(iso2)?.Name || iso2}
                              <button
                                type="button"
                                onClick={() => removeLegFir(leg.id, iso2)}
                                className="ml-1 rounded-full hover:bg-red-100 hover:text-red-600 px-1"
                                aria-label={`Avoid ${getCountry(iso2)?.Name || iso2}`}
                              >
                                ×
                              </button>
                            </Badge>
                          ))}
                        </div>
                        <Select
                          key={`legfir-${leg.id}-${leg.addFirs.length}-${leg.avoidFirs.length}`}
                          onValueChange={(v) => addLegFir(leg.id, v)}
                        >
                          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="+ Add FIR to this leg..." /></SelectTrigger>
                          <SelectContent>
                            {legFirOptions.map((c) => (
                              <SelectItem key={c.ISO2} value={c.ISO2}>{c.Name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                  );
                })}
                <Button variant="outline" size="sm" onClick={addLeg}>
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  ADD LEG
                </Button>
              </CardContent>
            </Card>

            {/* Persons */}
            {mode === 'charter' && (
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    STEP 3 — CREW & PAX (OPTIONAL)
                  </CardTitle>
                  <Button variant="outline" size="sm" onClick={addPerson}>
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    ADD PERSON
                  </Button>
                </CardHeader>
                <CardContent className="space-y-3">
                  {persons.length === 0 && (
                    <div className="text-sm text-muted-foreground">NO PERSONS ADDED</div>
                  )}
                  {persons.map((person) => (
                    <div key={person.id} className="grid grid-cols-4 gap-3 items-end">
                      <div>
                        <Label className="text-xs">NAME</Label>
                        <Input
                          value={person.name}
                          onChange={(e) => updatePerson(person.id, 'name', e.target.value)}
                          placeholder="FULL NAME"
                          className="uppercase"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">ROLE</Label>
                        <Select value={person.role} onValueChange={(v) => updatePerson(person.id, 'role', v)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {PERSON_ROLE_OPTIONS.map((r) => (
                              <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs">NATIONALITY</Label>
                        <Combobox
                          options={NATIONALITY_OPTIONS}
                          value={person.nationality}
                          onChange={(v) => updatePerson(person.id, 'nationality', v)}
                          placeholder="Select country..."
                          searchPlaceholder="Type to filter..."
                        />
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => removePerson(person.id)}>
                        <Trash2 className="h-3.5 w-3.5 text-red-500" />
                      </Button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Analyze Button */}
            <Button
              className="w-full"
              size="lg"
              onClick={analyzeRoute}
              disabled={!aircraftTypeIcao || legs.every(l => !l.dep || !l.arr)}
            >
              <Globe className="mr-2 h-4 w-4" />
              ANALYZE ROUTE
            </Button>
          </div>

          {/* Right: Results Panel */}
          <div className="space-y-4">
            {showResult && enquiry ? (
              <>
                <Card className="border-emerald-200 bg-emerald-50">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 text-emerald-800">
                      <CheckCircle2 className="h-5 w-5" />
                      <span className="font-semibold">{submittedTripId ? 'ENQUIRY SUBMITTED' : 'ROUTE ANALYSIS COMPLETE'}</span>
                    </div>
                    <div className="mt-2 text-xs text-emerald-700 font-mono">
                      {submittedTripId ? `TRIP ID: ${submittedTripId}` : `ENQUIRY: ${enquiry.tripId}`}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">VERDICT</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Badge variant={enquiry.analysis.verdict.includes('INSUFFICIENT') ? 'destructive' : enquiry.analysis.verdict.includes('MARGINAL') ? 'default' : 'secondary'}>
                      {enquiry.analysis.verdict}
                    </Badge>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      FLIGHT SUMMARY
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">TOTAL DISTANCE</span>
                      <span className="font-bold">{enquiry.analysis.totalDistance.toLocaleString()} NM</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">EST. EET</span>
                      <span className="font-bold">{enquiry.analysis.totalEet}H</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">LEGS</span>
                      <span className="font-bold">{enquiry.legs.length}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">AIRCRAFT</span>
                      <span className="font-bold">{enquiry.aircraftType}{enquiry.registration ? ` (${enquiry.registration})` : ''}</span>
                    </div>
                    {enquiry.operationType && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">OPERATION</span>
                        <span className="font-bold">{enquiry.operationType.toUpperCase()}</span>
                      </div>
                    )}
                    {enquiry.missionType && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">MISSION</span>
                        <span className="font-bold">{enquiry.missionType.toUpperCase()}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Globe className="h-4 w-4" />
                      COUNTRIES INVOLVED
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-1">
                      {enquiry.analysis.countries.map(c => (
                        <Badge key={c} variant="outline" className="text-[10px]">{c}</Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      SERVICES ON THIS QUOTE
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {serviceLines.length === 0 ? (
                      <div className="text-xs text-muted-foreground">NO SERVICES REQUIRED FOR THIS ROUTE</div>
                    ) : (
                      serviceLines.map((l) => (
                        <label
                          key={l.id}
                          className={`flex items-center justify-between rounded-md border p-2 text-xs cursor-pointer ${l.included ? '' : 'opacity-50'}`}
                        >
                          <div className="flex items-center gap-2">
                            <Checkbox checked={l.included} onCheckedChange={() => toggleServiceLine(l.id)} />
                            <span className="font-medium">{l.countryName}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-[9px]">{SERVICE_TYPE_LABEL[l.type]}</Badge>
                            {!l.auto && <Badge variant="secondary" className="text-[9px]">MANUAL</Badge>}
                            <span className="text-muted-foreground">{l.leadTimeHours}H LEAD</span>
                          </div>
                        </label>
                      ))
                    )}

                    <div className="flex items-center gap-2 pt-2">
                      <Select value={addFirIso} onValueChange={setAddFirIso}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Add / avoid a FIR..." /></SelectTrigger>
                        <SelectContent>
                          {firOptions.map((c) => (
                            <SelectItem key={c.ISO2} value={c.ISO2}>{c.Name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button size="sm" variant="outline" className="h-8 text-xs shrink-0" onClick={addFirCountry} disabled={!addFirIso}>
                        <Plus className="mr-1 h-3 w-3" />
                        ADD FIR
                      </Button>
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      UNCHECK A ROW TO OPT OUT OR AVOID THAT COUNTRY/FIR. THE OVERFLOWN-COUNTRY LIST IS A GREAT-CIRCLE APPROXIMATION — ADJUST IT TO MATCH THE ACTUAL AIRWAY ROUTING IF NEEDED.
                    </div>
                  </CardContent>
                </Card>

                {submittedTripId ? (
                  <Card className="border-emerald-200 bg-emerald-50">
                    <CardContent className="p-4 space-y-2 text-center">
                      <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" />
                      <div className="text-sm font-semibold text-emerald-800">QUOTE SUBMITTED</div>
                      <div className="text-xs text-emerald-700">
                        Trip <span className="font-mono">{submittedTripId}</span> was created. Our ops team will review it and follow up{contactEmail ? ` at ${contactEmail}` : ''}.
                      </div>
                      <Link to={`/admin/trips?trip=${submittedTripId}`}>
                        <Button variant="outline" size="sm" className="mt-1">
                          OPEN IN ADMIN
                          <ChevronRight className="ml-1 h-3.5 w-3.5" />
                        </Button>
                      </Link>
                    </CardContent>
                  </Card>
                ) : (
                  <>
                    <Button className="w-full" size="lg" variant="default" onClick={submitQuote} disabled={!clientName.trim() || submitting}>
                      <Send className="mr-2 h-4 w-4" />
                      {submitting ? 'SUBMITTING…' : 'REQUEST QUOTE'}
                    </Button>
                    {submitError && (
                      <p className="text-xs text-destructive text-center">{submitError}</p>
                    )}
                    <div className="text-xs text-muted-foreground text-center">
                      {clientName.trim()
                        ? 'THIS CREATES AN ENQUIRY TRIP IN OUR SYSTEM. OUR TEAM WILL CONTACT YOU WITHIN 24 HOURS.'
                        : 'ENTER YOUR CLIENT / COMPANY NAME ABOVE TO SUBMIT.'}
                    </div>
                  </>
                )}
              </>
            ) : (
              <Card>
                <CardContent className="p-8 text-center">
                  <Globe className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">SELECT AIRCRAFT AND ENTER ROUTE TO SEE ANALYSIS</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t mt-12 py-6 text-center text-xs text-muted-foreground">
        VIQ — PRIVATE AVIATION TRIP MANAGEMENT
      </footer>
    </div>
  );
}
