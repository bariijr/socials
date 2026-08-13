"use client";

import { useEffect, useState } from "react";
import type { AirportLookup, CountryLookup, FirLookup, LegInput } from "@/lib/types";
import { AirportPicker } from "@/components/AirportPicker";
import { MultiCodePicker } from "@/components/MultiCodePicker";
import { RoutePreviewPanel } from "@/components/RoutePreviewPanel";
import { formatUtc } from "@/lib/format";
import { addHours } from "@/lib/time";

interface Props {
  index: number;
  leg: LegInput;
  onChange: (leg: LegInput) => void;
  onRemove: () => void;
  canRemove: boolean;
}

function toDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Splits a datetime-local value ("YYYY-MM-DDTHH:MM") into [date, time],
 * always a real two-element pair — "".split("T") alone would leave the
 * second slot undefined rather than "", which a controlled <input> can't
 * take as its value. */
function splitDatetimeLocal(value: string): [string, string] {
  const [date, time] = value.split("T");
  return [date ?? "", time ?? ""];
}

// The native date/time inputs fire onChange with a partial value while a
// user is still typing each segment — new Date(value).toISOString() throws
// RangeError on those instead of just meaning "not a complete value yet".
// Never let that escape as an uncaught crash (see task #110's LegEditor
// crash fix).
function toIsoOrNull(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const CONSTRAINT_COUNT = (leg: LegInput) =>
  leg.avoid_states.length + leg.include_states.length + leg.avoid_firs.length + leg.include_firs.length;

export function LegEditor({ index, leg, onChange, onRemove, canRemove }: Props) {
  const [dep, setDep] = useState<AirportLookup | null>(leg.dep_icao ? ({ icao: leg.dep_icao, iata: null, name: leg.dep_icao, city: null, country_name: null } as AirportLookup) : null);
  const [arr, setArr] = useState<AirportLookup | null>(leg.arr_icao ? ({ icao: leg.arr_icao, iata: null, name: leg.arr_icao, city: null, country_name: null } as AirportLookup) : null);

  // Task #116: departure and arrival are two always-visible, independently
  // editable fields — not a single field behind a "which one do you know"
  // toggle (the old task #112 model). Departure always drives
  // reference_datetime (the engine's real time driver); arrival is
  // auto-prefilled from departure + EET once both are known, then stays
  // fully independent — never recomputed out from under a value the user
  // (or the prefill itself) already set. Clearing arrival back to empty is
  // the "reset to computed" gesture: the prefill effect below only ever
  // fills an empty field.
  const [depInitialDate, depInitialTime] = splitDatetimeLocal(toDatetimeLocal(leg.reference_datetime));
  const [depDate, setDepDate] = useState(depInitialDate);
  const [depTime, setDepTime] = useState(depInitialTime);
  const [arrInitialDate, arrInitialTime] = splitDatetimeLocal(toDatetimeLocal(leg.arrival_datetime_override));
  const [arrDate, setArrDate] = useState(arrInitialDate);
  const [arrTime, setArrTime] = useState(arrInitialTime);
  const [eetHours, setEetHours] = useState<number | null>(null);

  function update(patch: Partial<LegInput>) {
    onChange({ ...leg, ...patch });
  }

  function applyDeparture(dateStr: string, timeStr: string) {
    const iso = dateStr && timeStr ? toIsoOrNull(`${dateStr}T${timeStr}`) : null;
    // required_arrival_datetime (the old "back-calculate departure from a
    // required landing time" mode) is superseded by this always-departure-
    // driven design — an arrival value now only ever means
    // arrival_datetime_override, a display override, never a driver.
    update({ reference_datetime: iso, required_arrival_datetime: null });
  }

  function applyArrival(dateStr: string, timeStr: string) {
    const iso = dateStr && timeStr ? toIsoOrNull(`${dateStr}T${timeStr}`) : null;
    update({ arrival_datetime_override: iso });
  }

  // Auto-prefill arrival from departure + EET — only while arrival is
  // still empty, so it never overwrites a value already set (by this same
  // prefill or by the user typing one in). Re-runs when arrival is cleared
  // back to empty (the reset gesture) or when departure/EET change while
  // arrival is still unset.
  useEffect(() => {
    if (arrDate || arrTime) return;
    if (!depDate || !depTime || eetHours === null) return;
    const depIso = toIsoOrNull(`${depDate}T${depTime}`);
    if (!depIso) return;
    const arrIso = addHours(depIso, eetHours);
    if (!arrIso) return;
    const [d, t] = splitDatetimeLocal(toDatetimeLocal(arrIso));
    setArrDate(d);
    setArrTime(t);
    update({ arrival_datetime_override: arrIso });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depDate, depTime, eetHours, arrDate, arrTime]);

  function resetArrivalToComputed() {
    setArrDate("");
    setArrTime("");
    update({ arrival_datetime_override: null });
  }

  const depIso = depDate && depTime ? toIsoOrNull(`${depDate}T${depTime}`) : null;
  const arrIso = arrDate && arrTime ? toIsoOrNull(`${arrDate}T${arrTime}`) : null;
  const computedArrIso = depIso && eetHours !== null ? addHours(depIso, eetHours) : null;
  const arrivalDiffersFromComputed = arrIso !== null && computedArrIso !== null && arrIso !== computedArrIso;

  return (
    <div className="space-y-4 rounded-lg border border-fg/10 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-fg/70">Leg {index + 1}</h3>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="h-11 rounded-md border border-fg/20 px-3 text-sm text-fg/60 hover:border-danger hover:text-danger"
          >
            Remove leg
          </button>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <AirportPicker
          label="Departure"
          value={dep}
          onChange={(a) => {
            setDep(a);
            update({ dep_icao: a?.icao ?? "" });
          }}
        />
        <AirportPicker
          label="Arrival"
          value={arr}
          onChange={(a) => {
            setArr(a);
            update({ arr_icao: a?.icao ?? "" });
          }}
        />
        <div>
          <label className="mb-1 block text-sm text-fg/60">Call sign (optional)</label>
          <input
            type="text"
            value={leg.call_sign ?? ""}
            onChange={(e) => update({ call_sign: e.target.value.toUpperCase() || null })}
            className="mono-figures h-11 w-full rounded-md border border-fg/20 bg-transparent px-3 text-base text-fg"
          />
        </div>
      </div>

      <RoutePreviewPanel
        depIcao={leg.dep_icao}
        arrIcao={leg.arr_icao}
        referenceDatetime={leg.reference_datetime ?? undefined}
        onEetHours={setEetHours}
        showMap={false}
        avoidStates={leg.avoid_states}
        includeStates={leg.include_states}
        avoidFirs={leg.avoid_firs}
        includeFirs={leg.include_firs}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-md border border-fg/15 p-3">
          <label className="mb-2 block text-sm font-medium text-fg/70">Departure</label>
          <div className="flex flex-wrap gap-2">
            <input
              type="date"
              required
              value={depDate}
              onChange={(e) => {
                setDepDate(e.target.value);
                applyDeparture(e.target.value, depTime);
              }}
              className="mono-figures h-11 w-40 rounded-md border border-fg/20 bg-transparent px-3 text-base text-fg"
            />
            <input
              type="time"
              required
              value={depTime}
              onChange={(e) => {
                setDepTime(e.target.value);
                applyDeparture(depDate, e.target.value);
              }}
              className="mono-figures h-11 w-28 rounded-md border border-fg/20 bg-transparent px-3 text-base text-fg"
            />
          </div>
        </div>

        <div className="rounded-md border border-fg/15 p-3">
          <div className="mb-2 flex items-center justify-between">
            <label className="block text-sm font-medium text-fg/70">
              Arrival {eetHours !== null && <span className="font-normal text-fg/40">(prefilled — EET {eetHours.toFixed(1)}h)</span>}
            </label>
            {arrivalDiffersFromComputed && (
              <button type="button" onClick={resetArrivalToComputed} className="text-xs text-accent hover:underline">
                Reset to computed
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              type="date"
              value={arrDate}
              onChange={(e) => {
                setArrDate(e.target.value);
                applyArrival(e.target.value, arrTime);
              }}
              className="mono-figures h-11 w-40 rounded-md border border-fg/20 bg-transparent px-3 text-base text-fg"
            />
            <input
              type="time"
              value={arrTime}
              onChange={(e) => {
                setArrTime(e.target.value);
                applyArrival(arrDate, e.target.value);
              }}
              className="mono-figures h-11 w-28 rounded-md border border-fg/20 bg-transparent px-3 text-base text-fg"
            />
          </div>
          {/* Editing here always sets arrival_datetime_override — a display
              value only. Permit/deadline computation always uses the
              engine's own reference_datetime + EET, never this field. */}
          {computedArrIso && arrivalDiffersFromComputed && (
            <p className="mono-figures mt-2 text-xs text-fg/50">Computed from EET: {formatUtc(computedArrIso)}</p>
          )}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm text-fg/60">Filed route (optional)</label>
        <input
          type="text"
          placeholder="e.g. FAKN PKV UT915 VHA UL432 TUPIR B527 BJA L432 GAVDA GAVDA1B HRYR"
          value={leg.filed_route ?? ""}
          onChange={(e) => update({ filed_route: e.target.value.toUpperCase() || null })}
          className="mono-figures h-11 w-full rounded-md border border-fg/20 bg-transparent px-3 text-sm text-fg"
        />
        <p className="mt-1 text-xs text-fg/50">
          Stored and shown as-is on permit paperwork. Overflown countries/FIRs are still derived from the great-circle
          route below, not parsed from this string.
        </p>
      </div>

      <details className="rounded-md border border-fg/10">
        <summary className="cursor-pointer select-none px-3 py-2.5 text-sm text-fg/60">
          Routing constraints (optional){CONSTRAINT_COUNT(leg) > 0 && ` — ${CONSTRAINT_COUNT(leg)} set`}
        </summary>
        <div className="grid gap-4 border-t border-fg/10 p-3 sm:grid-cols-2">
          <MultiCodePicker<CountryLookup>
            label="Avoid countries"
            endpoint="/feasibility/countries"
            getCode={(c) => c.iso3}
            getName={(c) => c.name}
            selected={leg.avoid_states}
            onChange={(codes) => update({ avoid_states: codes })}
          />
          <MultiCodePicker<FirLookup>
            label="Avoid FIRs"
            endpoint="/feasibility/firs"
            getCode={(f) => f.icao_fir_code}
            getName={(f) => f.name}
            selected={leg.avoid_firs}
            onChange={(codes) => update({ avoid_firs: codes })}
          />
          <MultiCodePicker<CountryLookup>
            label="Require countries"
            endpoint="/feasibility/countries"
            getCode={(c) => c.iso3}
            getName={(c) => c.name}
            selected={leg.include_states}
            onChange={(codes) => update({ include_states: codes })}
          />
          <MultiCodePicker<FirLookup>
            label="Require FIRs"
            endpoint="/feasibility/firs"
            getCode={(f) => f.icao_fir_code}
            getName={(f) => f.name}
            selected={leg.include_firs}
            onChange={(codes) => update({ include_firs: codes })}
          />
        </div>
      </details>
    </div>
  );
}
