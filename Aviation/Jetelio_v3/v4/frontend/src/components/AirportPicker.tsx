"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { AirportLookup } from "@/lib/types";

interface Props {
  label: string;
  value: AirportLookup | null;
  onChange: (airport: AirportLookup | null) => void;
}

export function AirportPicker({ label, value, onChange }: Props) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(t);
  }, [query]);

  const { data } = useQuery({
    queryKey: ["airport-lookup", debounced],
    queryFn: () => api.get<AirportLookup[]>(`/feasibility/airports?q=${encodeURIComponent(debounced)}`),
    enabled: debounced.length >= 2 && !value,
  });

  if (value) {
    return (
      <div>
        <label className="mb-1 block text-sm text-fg/60">{label}</label>
        <div className="flex h-11 items-center justify-between rounded-md border border-fg/20 px-3 text-sm">
          <span>
            <span className="mono-figures">{value.icao}</span> — {value.name}
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
      <label className="mb-1 block text-sm text-fg/60">{label}</label>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="ICAO, IATA or airport name"
        className="h-11 w-full rounded-md border border-fg/20 bg-transparent px-3 text-base text-fg"
      />
      {data && data.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full rounded-md border border-fg/20 bg-base shadow-lg">
          {data.map((a) => (
            <li key={a.icao}>
              <button
                type="button"
                onClick={() => onChange(a)}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-fg/10"
              >
                <span>
                  <span className="mono-figures">{a.icao}</span> — {a.name}
                </span>
                <span className="text-fg/40">{a.country_name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
