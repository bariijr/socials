"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { AircraftTypeLookup } from "@/lib/types";

interface Props {
  value: AircraftTypeLookup | null;
  onChange: (aircraftType: AircraftTypeLookup | null) => void;
}

export function AircraftTypePicker({ value, onChange }: Props) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(t);
  }, [query]);

  const { data } = useQuery({
    queryKey: ["aircraft-type-lookup", debounced],
    queryFn: () => api.get<AircraftTypeLookup[]>(`/feasibility/aircraft-types?q=${encodeURIComponent(debounced)}`),
    enabled: debounced.length >= 1 && !value,
  });

  if (value) {
    return (
      <div>
        <label className="mb-1 block text-sm text-fg/60">Aircraft type</label>
        <div className="flex h-11 items-center justify-between rounded-md border border-fg/20 px-3 text-sm">
          <span>
            <span className="mono-figures">{value.icao_type}</span>
            {value.manufacturer && ` — ${value.manufacturer} ${value.model_series ?? ""}`}
          </span>
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setQuery("");
            }}
            className="text-fg/50 hover:text-fg"
          >
            Change
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <label className="mb-1 block text-sm text-fg/60">Aircraft type</label>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="ICAO type designator or model"
        className="h-11 w-full rounded-md border border-fg/20 bg-transparent px-3 text-base text-fg"
      />
      {data && data.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full rounded-md border border-fg/20 bg-base shadow-lg">
          {data.map((t) => (
            <li key={t.icao_type}>
              <button
                type="button"
                onClick={() => onChange(t)}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-fg/10"
              >
                <span className="mono-figures">{t.icao_type}</span>
                <span className="text-fg/40">
                  {t.manufacturer} {t.model_series}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
