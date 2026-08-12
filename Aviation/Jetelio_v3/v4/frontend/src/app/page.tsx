"use client";

import { useState } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import type {
  AircraftTypeLookup,
  FeasibilityCheckRequest,
  FeasibilityCheckResult,
  LegInput,
  PersonPublicInput,
} from "@/lib/types";
import { AircraftTypePicker } from "@/components/AircraftTypePicker";
import { PersonsEditor } from "@/components/PersonsEditor";
import { LegEditor } from "@/components/LegEditor";
import { FeasibilityResultsCard } from "@/components/FeasibilityResultsCard";
import { LegSummaryTable } from "@/components/LegSummaryTable";
import { RequestQuoteForm } from "@/components/RequestQuoteForm";
import { CombinedRouteMap } from "@/components/CombinedRouteMap";
import { StatusChip } from "@/components/StatusChip";

const MAX_LEGS = 8;
const LB_PER_KG = 2.20462;

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
  };
}

function legTimeValid(l: LegInput): boolean {
  const hasDep = Boolean(l.reference_datetime);
  const hasArr = Boolean(l.required_arrival_datetime);
  return hasDep !== hasArr; // exactly one
}

export default function FeasibilityIQPage() {
  const [aircraft, setAircraft] = useState<AircraftTypeLookup | null>(null);
  const [registration, setRegistration] = useState("");
  const [mtowKg, setMtowKg] = useState("");
  const [mtowUnit, setMtowUnit] = useState<"kg" | "lb">("kg");
  const [operatorAirlineName, setOperatorAirlineName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");

  const [persons, setPersons] = useState<PersonPublicInput[]>([]);
  const [legs, setLegs] = useState<LegInput[]>([emptyLeg()]);

  const [result, setResult] = useState<FeasibilityCheckResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tripId, setTripId] = useState<string | null>(null);

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

  function removeLeg(index: number) {
    setLegs((prev) => prev.filter((_, i) => i !== index));
  }

  function entered_mtow_kg(): number | null {
    if (!mtowKg) return null;
    const n = Number(mtowKg);
    if (Number.isNaN(n)) return null;
    return mtowUnit === "lb" ? n / LB_PER_KG : n;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!aircraft) return;
    setError(null);
    setSubmitting(true);
    setResult(null);
    setTripId(null);
    try {
      const payload: FeasibilityCheckRequest = {
        aircraft_icao_type: aircraft.icao_type,
        aircraft_registration: registration || undefined,
        entered_mtow_kg: entered_mtow_kg() ?? undefined,
        operator_airline_name: operatorAirlineName || undefined,
        persons,
        legs,
      };
      const out = await api.post<FeasibilityCheckResult>("/feasibility/check", payload);
      setResult(out);
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setError("Too many checks from this connection — please wait a while and try again.");
      } else {
        setError("Could not compute feasibility — please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-10">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] lg:items-start">
        <MarketingPanel />

        <form onSubmit={onSubmit} className="space-y-6 rounded-2xl border border-accent/15 bg-surface p-4 shadow-lg shadow-black/20 sm:p-6">
        {/* Stage 1 of 3 — Aircraft. Always visible; nothing downstream can
            be planned without it, so it's never gated. */}
        <WizardStage step={1} label="Aircraft">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <AircraftTypePicker value={aircraft} onChange={setAircraft} />
            <div>
              <label className="mb-1 block text-sm text-fg/60">Registration (optional)</label>
              <input
                type="text"
                value={registration}
                onChange={(e) => setRegistration(e.target.value.toUpperCase())}
                className="mono-figures h-11 w-full rounded-md border border-fg/20 bg-transparent px-3 text-base text-fg"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-fg/60">MTOW (optional)</label>
              {/* Task #113: one unit-suffix-style control instead of a
                  number input plus a separate two-button segmented toggle
                  competing for the same cramped grid cell. Same mtowKg/
                  mtowUnit state and LB_PER_KG conversion — the suffix
                  button just cycles the unit on click rather than needing
                  two separate buttons to pick between. */}
              <div className="flex h-11 items-stretch overflow-hidden rounded-md border border-fg/20 focus-within:border-fg/40">
                <input
                  type="number"
                  min={0}
                  value={mtowKg}
                  onChange={(e) => setMtowKg(e.target.value)}
                  className="mono-figures h-full min-w-0 flex-1 bg-transparent px-3 text-base text-fg outline-none"
                />
                <button
                  type="button"
                  onClick={() => setMtowUnit(mtowUnit === "kg" ? "lb" : "kg")}
                  className="h-full shrink-0 border-l border-fg/20 px-3 text-xs font-semibold uppercase text-fg/60 transition-colors hover:bg-fg/10 hover:text-fg"
                  aria-label="Toggle MTOW unit"
                >
                  {mtowUnit}
                </button>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm text-fg/60">Operator / airline (optional)</label>
              <input
                type="text"
                value={operatorAirlineName}
                onChange={(e) => setOperatorAirlineName(e.target.value)}
                className="h-11 w-full rounded-md border border-fg/20 bg-transparent px-3 text-base text-fg"
              />
            </div>
          </div>
        </WizardStage>

        {/* Stage 2 of 3 — Legs (+ crew/pax, route map). Unlocks once an
            aircraft type is picked — nothing here can compute without one. */}
        {aircraft && (
          <WizardStage step={2} label="Legs">
            <div className="space-y-4">
              <div className="space-y-4">
                {legs.map((leg, i) => (
                  <LegEditor
                    key={i}
                    index={i}
                    leg={leg}
                    onChange={(l) => updateLeg(i, l)}
                    onRemove={() => removeLeg(i)}
                    canRemove={legs.length > 1}
                  />
                ))}
              </div>

              {legs.length < MAX_LEGS && (
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
              )}

              <PersonsEditor persons={persons} onChange={setPersons} />

              {/* Task #114: one combined map for the whole trip — was a
                  separate small map stacked under every leg. */}
              {legs.some((l) => l.dep_icao && l.arr_icao) && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-fg/70">Route map</h3>
                  <CombinedRouteMap legs={legs.map((l) => ({ depIcao: l.dep_icao, arrIcao: l.arr_icao }))} />
                  {legs.length > 1 && (
                    <p className="mono-figures flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg/50">
                      {legs.map(
                        (l, i) =>
                          l.dep_icao &&
                          l.arr_icao && (
                            <span key={i}>
                              {i + 1}. {l.dep_icao} → {l.arr_icao}
                            </span>
                          )
                      )}
                    </p>
                  )}
                </div>
              )}
            </div>
          </WizardStage>
        )}

        {/* Stage 3 of 3 — Client info. Unlocks once every leg has a
            dep/arr and exactly one of departure/arrival time set — asking
            for contact details before the trip itself is plannable would
            just be a wasted step if the aircraft/route turns out unusable. */}
        {legsComplete && (
          <WizardStage step={3} label="Your details">
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-sm text-fg/60">Your name</label>
                <input
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  className="h-11 w-full rounded-md border border-fg/20 bg-transparent px-3 text-base text-fg"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-fg/60">Email</label>
                <input
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  className="h-11 w-full rounded-md border border-fg/20 bg-transparent px-3 text-base text-fg"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-fg/60">Phone (optional)</label>
                <input
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  className="h-11 w-full rounded-md border border-fg/20 bg-transparent px-3 text-base text-fg"
                />
              </div>
            </div>

            {error && <p className="mt-4 text-sm text-danger">{error}</p>}

            <button
              type="submit"
              disabled={!canSubmit || submitting}
              className="mt-4 h-12 rounded-md bg-primary px-6 text-sm font-semibold tracking-wide text-fg shadow-md shadow-primary/20 transition-all hover:shadow-lg hover:shadow-primary/30 disabled:opacity-50 disabled:shadow-none"
            >
              {submitting ? "Checking…" : "Get estimate"}
            </button>
          </WizardStage>
        )}
        </form>
      </div>

      {result && !tripId && (
        <WizardStage step={4} label="Result">
          <div className="mb-4 flex items-center gap-3">
            <h2 className="font-display text-xl font-bold">Trip verdict</h2>
            <StatusChip status={result.overall_verdict} />
          </div>
          <div className="space-y-4">
            <LegSummaryTable
              aircraftIcaoType={aircraft?.icao_type ?? null}
              mtowKg={entered_mtow_kg()}
              rows={result.legs.map((leg, i) => ({
                legIndex: i,
                depIcao: leg.dep_icao,
                fromDate: leg.reference_datetime,
                arrIcao: leg.arr_icao,
                toDate: leg.arrival_datetime,
                callSign: leg.call_sign,
                registration: registration || null,
                distanceNm: leg.route.distance_nm,
                eetHours: leg.route.eet_hours,
              }))}
            />
            {result.legs.map((legResult, i) => (
              <FeasibilityResultsCard key={i} result={legResult} title={`Leg ${i + 1}: ${legResult.dep_icao} → ${legResult.arr_icao}`} />
            ))}
            <RequestQuoteForm
              checkId={result.check_id}
              onSuccess={setTripId}
              initialName={contactName}
              initialEmail={contactEmail}
              initialPhone={contactPhone}
            />
          </div>
        </WizardStage>
      )}

      {tripId && (
        <div className="rounded-lg border border-success/40 bg-success/10 p-4 text-sm text-success">
          Quote request received — reference {tripId}. Our team will be in touch shortly.
        </div>
      )}

      <footer className="border-t border-accent/10 pt-4 text-xs text-fg/40">
        <Link href="/login" className="transition-colors hover:text-accent">
          Staff sign in
        </Link>
      </footer>
    </div>
  );
}

// Task #111 — progressive-disclosure wizard. Each stage reveals once its
// precondition is met (aircraft picked -> legs unlock -> legs complete ->
// contact info unlocks -> a result exists -> result unlocks); earlier
// stages stay visible and editable rather than collapsing, so nothing a
// user already entered disappears as they move forward. animate-in is a
// plain CSS fade/slide defined in globals.css — no animation library.
function WizardStage({ step, label, children }: { step: number; label: string; children: React.ReactNode }) {
  return (
    <section className="animate-in space-y-4">
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-fg">
          {step}
        </span>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-fg/60">{label}</h2>
      </div>
      {children}
    </section>
  );
}

// Task #78 — landing-page redesign. The headline/subtitle above are real
// (product name + a factual one-line description, not marketing claims);
// everything in this panel below them is placeholder structure only,
// pending real copy from the user (explicit direction 2026-08-12: draft
// placeholders for layout, swap before anything ships). Kept visually
// unmistakable as placeholder (dashed border + badge), not just flagged in
// a comment, so it can't accidentally ship as real copy.
function MarketingPanel() {
  return (
    <div className="space-y-6 lg:sticky lg:top-6">
      <header className="space-y-3 py-4 text-center sm:text-left">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-accent">Private Aviation Trip Planning</p>
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Jetelio Viability IQ</h1>
        <p className="mx-auto max-w-md text-fg/60 sm:mx-0">
          Route, permits, services and a verdict for your trip — free, no account needed.
        </p>
      </header>

      <div className="space-y-4 rounded-2xl border border-dashed border-accent/40 bg-surface/60 p-4 sm:p-6">
        <span className="inline-block rounded-full border border-accent/40 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-accent">
          Placeholder copy — replace before launch
        </span>

        <ul className="space-y-3 text-sm text-fg/70">
          <li className="flex gap-2">
            <span className="text-accent">—</span>
            <span>[Value prop 1 — e.g. how fast an operator gets a real answer]</span>
          </li>
          <li className="flex gap-2">
            <span className="text-accent">—</span>
            <span>[Value prop 2 — e.g. regional coverage / countries supported]</span>
          </li>
          <li className="flex gap-2">
            <span className="text-accent">—</span>
            <span>[Value prop 3 — e.g. what makes the verdict trustworthy]</span>
          </li>
        </ul>

        <p className="border-t border-accent/20 pt-3 text-xs text-fg/50">
          [Trust signal placeholder — e.g. years in operation, countries served, client logos]
        </p>
      </div>
    </div>
  );
}
