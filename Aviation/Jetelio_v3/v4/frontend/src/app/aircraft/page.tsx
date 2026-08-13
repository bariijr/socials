"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { AircraftPerformanceItem, Page } from "@/lib/types";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { matchesQuery } from "@/lib/search";
import { DataTable } from "@/components/DataTable";
import { SearchInput } from "@/components/SearchInput";
import { StatusChip } from "@/components/StatusChip";

export default function AircraftPerformancePage() {
  useRequireAuth();
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["aircraft-performance"],
    queryFn: () => api.get<Page<AircraftPerformanceItem>>("/aircraft-performance?page_size=500"),
  });

  const rows = data?.items.filter((r) => matchesQuery(search, r.icao_type, r.manufacturer, r.model_series)) ?? [];

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Aircraft types (performance)</h1>
      <SearchInput value={search} onChange={setSearch} placeholder="Search fleet…" />
      {isLoading && <p className="text-fg/60">Loading…</p>}
      {data && (
        <DataTable
          rowKey={(r) => r.icao_type}
          rows={rows}
          columns={[
            {
              header: "ICAO type",
              render: (r) => (
                <Link href={`/aircraft/${r.icao_type}`} className="mono-figures hover:text-primary">
                  {r.icao_type}
                </Link>
              ),
            },
            { header: "Manufacturer", priority: 2, render: (r) => r.manufacturer ?? "—" },
            { header: "Model", priority: 2, render: (r) => r.model_series ?? "—" },
            {
              header: "Max range (NM)",
              priority: 3,
              render: (r) => <span className="mono-figures">{r.max_range_nm ?? "—"}</span>,
            },
            {
              header: "Practical range (NM)",
              priority: 3,
              render: (r) => <span className="mono-figures">{r.practical_range_nm?.toFixed(0) ?? "—"}</span>,
            },
            { header: "Planning status", render: (r) => <StatusChip status={r.planning_status} /> },
          ]}
        />
      )}
    </div>
  );
}
