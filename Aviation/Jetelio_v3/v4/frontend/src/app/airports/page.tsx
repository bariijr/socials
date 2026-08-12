"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Airport, Country, Page } from "@/lib/types";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { DataTable } from "@/components/DataTable";
import { StatusChip } from "@/components/StatusChip";

export default function AirportsPage() {
  useRequireAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["airports"],
    queryFn: () => api.get<Page<Airport>>("/airports?page_size=500"),
  });

  // Countries are a small bounded reference set (~195 rows) — fetched once
  // here for the Country column's iso3 -> name lookup, rather than a
  // per-row query. Always show the full name, never the bare code (#90).
  const { data: countries } = useQuery({
    queryKey: ["countries"],
    queryFn: () => api.get<Page<Country>>("/countries?page_size=500"),
  });
  const countryNames = Object.fromEntries((countries?.items ?? []).map((c) => [c.iso3, c.name]));

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Airports</h1>
      {isLoading && <p className="text-fg/60">Loading…</p>}
      {data && (
        <DataTable
          rowKey={(r) => r.icao}
          rows={data.items}
          columns={[
            { header: "ICAO", render: (r) => <span className="mono-figures">{r.icao}</span> },
            { header: "IATA", priority: 2, render: (r) => <span className="mono-figures">{r.iata ?? "—"}</span> },
            {
              header: "Name",
              render: (r) => (
                <Link href={`/airports/${r.icao}`} className="hover:text-primary">
                  {r.name}
                </Link>
              ),
            },
            { header: "City", priority: 2, render: (r) => r.city ?? "—" },
            {
              header: "Country",
              priority: 3,
              render: (r) => (r.country_iso3 ? countryNames[r.country_iso3] ?? r.country_iso3 : "—"),
            },
            { header: "Tech-stop readiness", render: (r) => <StatusChip status={r.tech_stop_readiness} /> },
          ]}
        />
      )}
    </div>
  );
}
