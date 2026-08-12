"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

interface Props<T> {
  label: string;
  endpoint: string;
  getCode: (item: T) => string;
  getName: (item: T) => string;
  selected: string[];
  onChange: (codes: string[]) => void;
}

export function MultiCodePicker<T>({ label, endpoint, getCode, getName, selected, onChange }: Props<T>) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  // Codes are the only thing actually stored/selected, but chips should
  // show the name (task #90 — never a bare country code to the user). A
  // selected code isn't necessarily in the current search results, so
  // every batch of results seen gets merged into this cache rather than
  // re-fetched per chip.
  const [nameCache, setNameCache] = useState<Record<string, string>>({});

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(t);
  }, [query]);

  const { data } = useQuery({
    queryKey: [endpoint, debounced],
    queryFn: () => api.get<T[]>(`${endpoint}?q=${encodeURIComponent(debounced)}`),
    enabled: debounced.length >= 2,
  });

  useEffect(() => {
    if (!data || data.length === 0) return;
    setNameCache((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const item of data) {
        const code = getCode(item);
        if (next[code] !== getName(item)) {
          next[code] = getName(item);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  function add(code: string) {
    if (!selected.includes(code)) onChange([...selected, code]);
    setQuery("");
  }

  function remove(code: string) {
    onChange(selected.filter((c) => c !== code));
  }

  return (
    <div>
      <label className="mb-1 block text-sm text-fg/60">{label}</label>
      {selected.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {selected.map((code) => (
            <span key={code} className="flex items-center gap-1.5 rounded-full border border-fg/20 py-1 pl-2.5 pr-1.5 text-xs">
              {nameCache[code] ?? <span className="mono-figures">{code}</span>}
              <button
                type="button"
                onClick={() => remove(code)}
                aria-label={`Remove ${code}`}
                className="flex h-5 w-5 items-center justify-center rounded-full text-fg/50 hover:bg-danger/20 hover:text-danger"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="relative">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search…"
          className="h-11 w-full rounded-md border border-fg/20 bg-transparent px-3 text-base text-fg"
        />
        {data && data.length > 0 && (
          <ul className="absolute z-10 mt-1 w-full rounded-md border border-fg/20 bg-base shadow-lg">
            {data.map((item) => {
              const code = getCode(item);
              return (
                <li key={code}>
                  <button
                    type="button"
                    onClick={() => add(code)}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-fg/10"
                  >
                    <span className="mono-figures">{code}</span>
                    <span className="text-fg/40">{getName(item)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
