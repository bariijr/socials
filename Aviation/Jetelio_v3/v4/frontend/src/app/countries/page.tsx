"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Country, Page } from "@/lib/types";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { matchesQuery } from "@/lib/search";
import { DataTable } from "@/components/DataTable";
import { SearchInput } from "@/components/SearchInput";
import { StatusChip } from "@/components/StatusChip";

export default function CountriesPage() {
  useRequireAuth();
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["countries"],
    queryFn: () => api.get<Page<Country>>("/countries?page_size=500"),
  });

  const rows = data?.items.filter((r) => matchesQuery(search, r.iso3, r.name, r.region)) ?? [];

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Countries</h1>
      <SearchInput value={search} onChange={setSearch} placeholder="Search countries…" />
      {isLoading && <p className="text-fg/60">Loading…</p>}
      {data && (
        <DataTable
          rowKey={(r) => r.iso3}
          rows={rows}
          columns={[
            { header: "ISO3", render: (r) => <span className="mono-figures">{r.iso3}</span> },
            {
              header: "Name",
              render: (r) => (
                <Link href={`/countries/${r.iso3}`} className="hover:text-primary">
                  {r.name}
                </Link>
              ),
            },
            { header: "Region", priority: 2, render: (r) => r.region ?? "—" },
            {
              header: "Std. lead time (h)",
              priority: 2,
              render: (r) => (
                <span className="mono-figures">
                  {r.standard_lead_time_hours ?? `fallback: ${r.effective_lead_time_hours}`}
                </span>
              ),
            },
            { header: "Overflight required", priority: 3, render: (r) => (r.overflight_permit_required ? "Yes" : "No") },
            { header: "Landing required", priority: 3, render: (r) => (r.landing_permit_required ? "Yes" : "No") },
            { header: "Ground handling", priority: 3, render: (r) => r.ground_handling_policy },
            { header: "Reference status", render: (r) => <StatusChip status={r.reference_status} /> },
          ]}
        />
      )}
    </div>
  );
}
