"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { CountryLookup } from "@/lib/types";

interface Props {
  label?: string;
  value: string;
  onChange: (iso3: string) => void;
  placeholder?: string;
}

// Read-only resolver — for a plain display context (an info grid, a table
// cell) that just needs "the country name for this ISO3", not a picker.
// Falls back to the raw code only while the name is still loading.
export function CountryName({ iso3 }: { iso3: string | null }) {
  const { data } = useQuery({
    queryKey: ["country-lookup", iso3],
    queryFn: () => api.get<CountryLookup[]>(`/feasibility/countries?q=${encodeURIComponent(iso3 ?? "")}`),
    enabled: Boolean(iso3),
  });
  if (!iso3) return null;
  const match = data?.find((c) => c.iso3 === iso3);
  return <>{match?.name ?? iso3}</>;
}

// Single-select country typeahead — always displays the full country name
// once resolved, never a bare ISO3 code (task #90). Mirrors AirportPicker's
// pattern (search -> pick -> "Change" to reopen) but for /feasibility/countries.
export function CountryPicker({ label, value, onChange, placeholder }: Props) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  // Resolves the current value's display name — needed on initial render
  // (e.g. editing an existing person) when the name hasn't been searched
  // for yet in this session.
  const [resolvedName, setResolvedName] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(t);
  }, [query]);

  const { data } = useQuery({
    queryKey: ["country-lookup", debounced],
    queryFn: () => api.get<CountryLookup[]>(`/feasibility/countries?q=${encodeURIComponent(debounced)}`),
    enabled: debounced.length >= 2 && !value,
  });

  const { data: resolveData } = useQuery({
    queryKey: ["country-lookup", value],
    queryFn: () => api.get<CountryLookup[]>(`/feasibility/countries?q=${encodeURIComponent(value)}`),
    enabled: Boolean(value) && resolvedName === null,
  });

  useEffect(() => {
    if (resolveData) {
      const match = resolveData.find((c) => c.iso3 === value);
      if (match) setResolvedName(match.name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolveData, value]);

  useEffect(() => {
    if (!value) setResolvedName(null);
  }, [value]);

  if (value) {
    return (
      <div>
        {label && <label className="mb-1 block text-sm text-fg/60">{label}</label>}
        <div className="flex h-11 items-center justify-between rounded-md border border-fg/20 px-3 text-sm">
          <span>{resolvedName ?? <span className="mono-figures">{value}</span>}</span>
          <button
            type="button"
            onClick={() => {
              onChange("");
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
      {label && <label className="mb-1 block text-sm text-fg/60">{label}</label>}
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder ?? "Search country…"}
        className="h-11 w-full rounded-md border border-fg/20 bg-transparent px-3 text-base text-fg"
      />
      {data && data.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full rounded-md border border-fg/20 bg-base shadow-lg">
          {data.map((c) => (
            <li key={c.iso3}>
              <button
                type="button"
                onClick={() => {
                  onChange(c.iso3);
                  setResolvedName(c.name);
                }}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-fg/10"
              >
                <span>{c.name}</span>
                <span className="mono-figures text-fg/40">{c.iso3}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
