"use client";

import { useState } from "react";
import type { AirportLookup, CountryLookup, FirLookup, LegInput } from "@/lib/types";
import { AirportPicker } from "@/components/AirportPicker";
import { MultiCodePicker } from "@/components/MultiCodePicker";
import { RoutePreviewPanel } from "@/components/RoutePreviewPanel";
import { formatUtc } from "@/lib/format";

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

// The native datetime-local input fires onChange with a partial/malformed
// value while a user is still typing each segment (date filled in, time
// not yet) — new Date(value).toISOString() throws RangeError on those
// instead of just meaning "not a complete value yet". Never let that
// escape as an uncaught crash.
function toIsoOrNull(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

type TimeDriver = "departure" | "arrival";

const CONSTRAINT_COUNT = (leg: LegInput) =>
  leg.avoid_states.length + leg.include_states.length + leg.avoid_firs.length + leg.include_firs.length;

export function LegEditor({ index, leg, onChange, onRemove, canRemove }: Props) {
  const [dep, setDep] = useState<AirportLookup | null>(leg.dep_icao ? ({ icao: leg.dep_icao, iata: null, name: leg.dep_icao, city: null, country_name: null } as AirportLookup) : null);
  const [arr, setArr] = useState<AirportLookup | null>(leg.arr_icao ? ({ icao: leg.arr_icao, iata: null, name: leg.arr_icao, city: null, country_name: null } as AirportLookup) : null);
  const [timeDriver, setTimeDriver] = useState<TimeDriver>(leg.required_arrival_datetime ? "arrival" : "departure");
  const [datetimeLocal, setDatetimeLocal] = useState(
    toDatetimeLocal(timeDriver === "arrival" ? leg.required_arrival_datetime : leg.reference_datetime)
  );
  const [initialDateStr, initialTimeStr] = datetimeLocal ? datetimeLocal.split("T") : ["", ""];
  // Task #112: date and time are tracked as their own independent inputs
  // (see below) rather than derived by splitting datetimeLocal on every
  // render — a user who's filled in the date but not yet the time must
  // still see their date, even though datetimeLocal itself stays "" (and
  // so doesn't propagate to the parent) until both are present.
  const [dateStr, setDateStr] = useState(initialDateStr);
  const [timeStr, setTimeStr] = useState(initialTimeStr);
  const [eetHours, setEetHours] = useState<number | null>(null);

  function update(patch: Partial<LegInput>) {
    onChange({ ...leg, ...patch });
  }

  function applyDatetime(value: string, driver: TimeDriver) {
    setDatetimeLocal(value);
    const iso = toIsoOrNull(value);
    if (driver === "departure") {
      update({ reference_datetime: iso, required_arrival_datetime: null });
    } else {
      update({ reference_datetime: null, required_arrival_datetime: iso });
    }
  }

  // Task #112: two plain, normal-sized date/time inputs instead of one
  // oversized native datetime-local widget. Each of these is either a
  // complete valid value or empty — never the partial/malformed string a
  // single datetime-local control can produce mid-type — so the combined
  // value only ever propagates to the parent once both are filled in.
  function applyDatePart(newDate: string) {
    setDateStr(newDate);
    applyDatetime(newDate && timeStr ? `${newDate}T${timeStr}` : "", timeDriver);
  }
  function applyTimePart(newTime: string) {
    setTimeStr(newTime);
    applyDatetime(dateStr && newTime ? `${dateStr}T${newTime}` : "", timeDriver);
  }

  const enteredIso = toIsoOrNull(datetimeLocal);
  const enteredDate = enteredIso ? new Date(enteredIso) : null;
  const computedOther =
    enteredDate && eetHours !== null && !Number.isNaN(enteredDate.getTime())
      ? new Date(enteredDate.getTime() + (timeDriver === "departure" ? 1 : -1) * eetHours * 3600_000)
      : null;

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
      />

      <div className="rounded-md border border-fg/15 p-3">
        <label className="mb-2 block text-sm font-medium text-fg/70">Time known as</label>
        <div className="mb-3 flex overflow-hidden rounded-md border border-fg/20">
          {(["departure", "arrival"] as TimeDriver[]).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => {
                setTimeDriver(d);
                applyDatetime(datetimeLocal, d);
              }}
              className={`h-11 flex-1 text-sm font-semibold capitalize transition-colors ${
                timeDriver === d ? "bg-primary text-fg" : "text-fg/60 hover:bg-fg/10"
              }`}
            >
              {d}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            type="date"
            required
            value={dateStr}
            onChange={(e) => applyDatePart(e.target.value)}
            className="mono-figures h-11 w-40 rounded-md border border-fg/20 bg-transparent px-3 text-base text-fg"
          />
          <input
            type="time"
            required
            value={timeStr}
            onChange={(e) => applyTimePart(e.target.value)}
            className="mono-figures h-11 w-28 rounded-md border border-fg/20 bg-transparent px-3 text-base text-fg"
          />
        </div>
        {computedOther && (
          <p className="mono-figures mt-2 text-xs text-fg/50">
            Computed {timeDriver === "departure" ? "arrival" : "departure"}: {formatUtc(computedOther.toISOString())}
          </p>
        )}
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
