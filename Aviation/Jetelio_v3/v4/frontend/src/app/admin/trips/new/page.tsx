"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import type {
  AircraftLookup,
  AircraftTypeLookup,
  ClientLookup,
  LegInput,
  PersonPublicInput,
  TripCreateRequest,
  TripDetail,
  TripFlightPurpose,
  TripLegStatus,
  TripLegType,
  TripOpsType,
} from "@/lib/types";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { AircraftTypePicker } from "@/components/AircraftTypePicker";
import { PersonsEditor } from "@/components/PersonsEditor";
import { LegEditor } from "@/components/LegEditor";
import { RoutePreviewPanel } from "@/components/RoutePreviewPanel";

const MAX_LEGS = 20;
const LB_PER_KG = 2.20462;
const AUTOSAVE_DEBOUNCE_MS = 3000;
const OPS_TYPES: TripOpsType[] = ["PRIVATE", "MILITARY", "CHARTER", "CARGO", "MEDEVAC", "OTHER"];
const FLIGHT_PURPOSES: TripFlightPurpose[] = ["BUSINESS", "TOURISM", "FERRY", "REPOSITION", "OTHER"];
const LEG_TYPES: TripLegType[] = ["PRIMARY", "ALTERNATE"];
const LEG_STATUSES: TripLegStatus[] = ["PENDING", "CONFIRMED", "CANCELLED", "COMPLETED"];

function emptyLeg(depIcao = ""): LegInput {
  return {
    dep_icao: depIcao,
    arr_icao: "",
    reference_datetime: null,
    required_arrival_datetime: null,
    avoid_states: [],
    include_states: [],
    avoid_firs: [],
    include_firs: [],
    client_id: null,
    registration: null,
    leg_type: "PRIMARY",
    leg_status: "PENDING",
    arrival_datetime_override: null,
  };
}

function legTimeValid(l: LegInput): boolean {
  const hasDep = Boolean(l.reference_datetime);
  const hasArr = Boolean(l.required_arrival_datetime);
  return hasDep !== hasArr;
}

export default function NewTripPage() {
  useRequireAuth();
  const router = useRouter();

  const [aircraft, setAircraft] = useState<AircraftTypeLookup | null>(null);
  const [registration, setRegistration] = useState("");
  const [mtowKg, setMtowKg] = useState("");
  const [mtowUnit, setMtowUnit] = useState<"kg" | "lb">("kg");
  const [lookup, setLookup] = useState<AircraftLookup | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [serialNumber, setSerialNumber] = useState("");
  const [colors, setColors] = useState("");
  const [opsType, setOpsType] = useState<TripOpsType | "">("");
  const [flightPurpose, setFlightPurpose] = useState<TripFlightPurpose | "">("");

  const [persons, setPersons] = useState<PersonPublicInput[]>([]);
  const [legs, setLegs] = useState<LegInput[]>([emptyLeg()]);
  const [requestedByName, setRequestedByName] = useState("");
  const [requestedByEmail, setRequestedByEmail] = useState("");
  const [requestedByPhone, setRequestedByPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [draftTripId, setDraftTripId] = useState<string | null>(null);
  const [autosaveStatus, setAutosaveStatus] = useState<"idle" | "saving" | "saved">("idle");

  const legsComplete = legs.every((l) => l.dep_icao && l.arr_icao && legTimeValid(l));
  const canSubmit = Boolean(aircraft && legsComplete);

  function updateLeg(index: number, leg: LegInput) {
    setLegs((prev) => prev.map((l, i) => (i === index ? leg : l)));
  }

  function addLeg() {
    setLegs((prev) => {
      if (prev.length >= MAX_LEGS) return prev;
      const last = prev[prev.length - 1];
      return [...prev, emptyLeg(last?.arr_icao ?? "")];
    });
  }

  function roundTrip() {
    setLegs((prev) => {
      if (prev.length >= MAX_LEGS || prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      const first = prev[0];
      return [...prev, { ...emptyLeg(last.arr_icao), arr_icao: first.dep_icao }];
    });
  }

  function mtowInKg(): number | null {
    if (!mtowKg) return null;
    const n = Number(mtowKg);
    if (Number.isNaN(n)) return null;
    return mtowUnit === "lb" ? n / LB_PER_KG : n;
  }

  // Registration -> autofill AC type/MTOW/operator/billing-client options.
  // Admin-only lookup; never available on the public form.
  async function runLookup() {
    if (!registration.trim()) return;
    setLookingUp(true);
    setLookupError(null);
    try {
      const found = await api.get<AircraftLookup>(`/trips/aircraft-lookup?registration=${encodeURIComponent(registration.trim())}`);
      setLookup(found);
      setAircraft({ icao_type: found.icao_type, manufacturer: null, model_series: null });
      if (found.mtow_kg !== null) {
        setMtowKg(String(found.mtow_kg));
        setMtowUnit("kg");
      }
    } catch (err) {
      setLookup(null);
      setLookupError(err instanceof ApiError && err.status === 404 ? "No aircraft found for this registration." : "Lookup failed.");
    } finally {
      setLookingUp(false);
    }
  }

  function buildPayload(): TripCreateRequest {
    return {
      aircraft_icao_type: aircraft!.icao_type,
      aircraft_registration: registration || undefined,
      entered_mtow_kg: mtowInKg() ?? undefined,
      serial_number: serialNumber || undefined,
      colors: colors || undefined,
      operator_airline_name: lookup?.operator_name || undefined,
      ops_type: opsType || undefined,
      flight_purpose: flightPurpose || undefined,
      persons,
      legs,
      requested_by_name: requestedByName || undefined,
      requested_by_email: requestedByEmail || undefined,
      requested_by_phone: requestedByPhone || undefined,
      notes: notes || undefined,
    };
  }

  // Autosave: once the form is minimally valid, silently create the trip
  // as a LEAD so an abandoned entry still shows up in the trips
  // list. Only fires the initial create — once a draft exists, further
  // leg edits are made through the trip detail page's own editing (same
  // as any other trip), avoiding a second, more complex leg-diffing sync
  // path here.
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (draftTripId || !canSubmit) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(async () => {
      setAutosaveStatus("saving");
      try {
        const trip = await api.post<TripDetail>("/trips", buildPayload());
        setDraftTripId(trip.id);
        setAutosaveStatus("saved");
      } catch {
        setAutosaveStatus("idle");
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    aircraft, registration, mtowKg, serialNumber, colors, opsType, flightPurpose, legs, persons,
    requestedByName, requestedByEmail, requestedByPhone, notes, draftTripId, canSubmit,
  ]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!aircraft) return;
    setError(null);
    setSubmitting(true);
    try {
      if (draftTripId) {
        router.push(`/admin/trips/${draftTripId}`);
        return;
      }
      const trip = await api.post<TripDetail>("/trips", buildPayload());
      router.push(`/admin/trips/${trip.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? "Could not create the trip — check the leg details." : "Could not reach the API");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold">New trip</h1>
        {autosaveStatus === "saving" && <span className="text-xs text-fg/50">Saving lead…</span>}
        {autosaveStatus === "saved" && <span className="text-xs text-success">Lead saved</span>}
      </div>

      <form onSubmit={onSubmit} className="space-y-4 rounded-lg border border-fg/10 p-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <AircraftTypePicker value={aircraft} onChange={setAircraft} />
          <div>
            <label className="mb-1 block text-sm text-fg/60">Registration (optional)</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={registration}
                onChange={(e) => setRegistration(e.target.value.toUpperCase())}
                onBlur={runLookup}
                className="mono-figures h-11 w-full rounded-md border border-fg/20 bg-transparent px-3 text-base text-fg"
              />
              <button
                type="button"
                onClick={runLookup}
                disabled={lookingUp || !registration.trim()}
                className="h-11 shrink-0 rounded-md border border-fg/20 px-3 text-sm text-fg/70 hover:border-fg/40 disabled:opacity-50"
              >
                {lookingUp ? "…" : "Look up"}
              </button>
            </div>
            {lookupError && <p className="mt-1 text-xs text-danger">{lookupError}</p>}
            {lookup && <p className="mt-1 text-xs text-success">Matched: {lookup.operator_name ?? "operator on file"}</p>}
          </div>
          <div>
            <label className="mb-1 block text-sm text-fg/60">MTOW (optional)</label>
            <div className="flex gap-2">
              <input
                type="number"
                min={0}
                value={mtowKg}
                onChange={(e) => setMtowKg(e.target.value)}
                className="mono-figures h-11 w-full rounded-md border border-fg/20 bg-transparent px-3 text-base text-fg"
              />
              <div className="flex overflow-hidden rounded-md border border-fg/20">
                {(["kg", "lb"] as const).map((u) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => setMtowUnit(u)}
                    className={`h-11 px-2.5 text-xs uppercase ${mtowUnit === u ? "bg-primary text-fg" : "text-fg/60 hover:bg-fg/10"}`}
                  >
                    {u}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm text-fg/60">Operator</label>
            <input
              readOnly
              value={lookup?.operator_name ?? ""}
              placeholder="Autofilled from registration"
              className="h-11 w-full rounded-md border border-fg/10 bg-fg/5 px-3 text-base text-fg/70"
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="mb-1 block text-sm text-fg/60">Serial number (optional)</label>
            <input
              value={serialNumber}
              onChange={(e) => setSerialNumber(e.target.value.toUpperCase())}
              className="mono-figures h-11 w-full rounded-md border border-fg/20 bg-transparent px-3 text-base text-fg"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-fg/60">Colors (optional)</label>
            <input
              value={colors}
              onChange={(e) => setColors(e.target.value)}
              className="h-11 w-full rounded-md border border-fg/20 bg-transparent px-3 text-base text-fg"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-fg/60">Ops type (optional)</label>
            <select
              value={opsType}
              onChange={(e) => setOpsType(e.target.value as TripOpsType | "")}
              className="h-11 w-full rounded-md border border-fg/20 bg-transparent px-3 text-base text-fg"
            >
              <option value="" className="bg-base">
                —
              </option>
              {OPS_TYPES.map((t) => (
                <option key={t} value={t} className="bg-base">
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm text-fg/60">Flight purpose (optional)</label>
            <select
              value={flightPurpose}
              onChange={(e) => setFlightPurpose(e.target.value as TripFlightPurpose | "")}
              className="h-11 w-full rounded-md border border-fg/20 bg-transparent px-3 text-base text-fg"
            >
              <option value="" className="bg-base">
                —
              </option>
              {FLIGHT_PURPOSES.map((t) => (
                <option key={t} value={t} className="bg-base">
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-4">
          {legs.map((leg, i) => (
            <div key={i} className="space-y-2">
              <LegEditor
                index={i}
                leg={leg}
                onChange={(l) => updateLeg(i, l)}
                onRemove={() => setLegs((prev) => prev.filter((_, idx) => idx !== i))}
                canRemove={legs.length > 1}
              />
              <div className="grid gap-3 rounded-md border border-fg/10 p-3 sm:grid-cols-2 lg:grid-cols-4">
                {lookup && lookup.clients.length > 0 && (
                  <div>
                    <label className="mb-1 block text-sm text-fg/60">Bill-to client (optional)</label>
                    <select
                      value={leg.client_id ?? ""}
                      onChange={(e) => updateLeg(i, { ...leg, client_id: e.target.value || null })}
                      className="h-9 w-full rounded-md border border-fg/20 bg-transparent px-2 text-sm text-fg"
                    >
                      <option value="" className="bg-base">
                        Unassigned
                      </option>
                      {lookup.clients.map((c: ClientLookup) => (
                        <option key={c.id} value={c.id} className="bg-base">
                          {c.bill_to_legal_name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <label className="mb-1 block text-sm text-fg/60">Registration override (optional)</label>
                  <input
                    value={leg.registration ?? ""}
                    onChange={(e) => updateLeg(i, { ...leg, registration: e.target.value.toUpperCase() || null })}
                    placeholder={registration || "Uses trip default"}
                    className="mono-figures h-9 w-full rounded-md border border-fg/20 bg-transparent px-2 text-sm text-fg"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm text-fg/60">Leg type</label>
                  <select
                    value={leg.leg_type ?? "PRIMARY"}
                    onChange={(e) => updateLeg(i, { ...leg, leg_type: e.target.value as TripLegType })}
                    className="h-9 w-full rounded-md border border-fg/20 bg-transparent px-2 text-sm text-fg"
                  >
                    {LEG_TYPES.map((t) => (
                      <option key={t} value={t} className="bg-base">
                        {t}
                      </option>
                    ))}
                  </select>
                  {leg.leg_type === "ALTERNATE" && (
                    <p className="mt-1 text-xs text-fg/50">Alternate — exempt from chronological ordering, still billed.</p>
                  )}
                </div>
                <div>
                  <label className="mb-1 block text-sm text-fg/60">Leg status</label>
                  <select
                    value={leg.leg_status ?? "PENDING"}
                    onChange={(e) => updateLeg(i, { ...leg, leg_status: e.target.value as TripLegStatus })}
                    className="h-9 w-full rounded-md border border-fg/20 bg-transparent px-2 text-sm text-fg"
                  >
                    {LEG_STATUSES.map((s) => (
                      <option key={s} value={s} className="bg-base">
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={roundTrip}
            disabled={legs.length === 0 || !legs[0].dep_icao}
            className="h-11 rounded-md border border-fg/20 px-3 text-sm text-fg/70 hover:border-fg/40 disabled:opacity-50"
          >
            Round trip
          </button>
          <button
            type="button"
            onClick={addLeg}
            className="h-11 rounded-md border border-fg/20 px-3 text-sm text-fg/70 hover:border-fg/40"
          >
            Add leg
          </button>
        </div>

        <PersonsEditor persons={persons} onChange={setPersons} />

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-sm text-fg/60">Requested by (optional)</label>
            <input
              value={requestedByName}
              onChange={(e) => setRequestedByName(e.target.value)}
              className="h-11 w-full rounded-md border border-fg/20 bg-transparent px-3 text-base text-fg"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-fg/60">Contact email (optional)</label>
            <input
              type="email"
              value={requestedByEmail}
              onChange={(e) => setRequestedByEmail(e.target.value)}
              className="h-11 w-full rounded-md border border-fg/20 bg-transparent px-3 text-base text-fg"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-fg/60">Contact phone (optional)</label>
            <input
              value={requestedByPhone}
              onChange={(e) => setRequestedByPhone(e.target.value)}
              className="h-11 w-full rounded-md border border-fg/20 bg-transparent px-3 text-base text-fg"
            />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm text-fg/60">Notes (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="w-full rounded-md border border-fg/20 bg-transparent px-3 py-2 text-base text-fg"
          />
        </div>

        {legs.some((l) => l.dep_icao && l.arr_icao) && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-fg/70">Route map</h3>
            {legs.map(
              (leg, i) =>
                leg.dep_icao &&
                leg.arr_icao && (
                  <div key={i} className="space-y-1">
                    <p className="text-xs text-fg/50">
                      Leg {i + 1}: {leg.dep_icao} → {leg.arr_icao}
                    </p>
                    <RoutePreviewPanel depIcao={leg.dep_icao} arrIcao={leg.arr_icao} showStats={false} />
                  </div>
                )
            )}
          </div>
        )}

        {error && <p className="text-sm text-danger">{error}</p>}

        <button
          type="submit"
          disabled={!canSubmit || submitting}
          className="h-11 rounded-md bg-primary px-5 text-sm font-semibold text-fg disabled:opacity-50"
        >
          {submitting ? "Creating…" : draftTripId ? "Open trip" : "Create trip"}
        </button>
      </form>
    </div>
  );
}
