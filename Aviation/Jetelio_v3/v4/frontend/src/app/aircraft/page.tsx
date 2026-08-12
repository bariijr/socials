"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { AircraftPerformanceItem, Page } from "@/lib/types";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { DataTable } from "@/components/DataTable";
import { StatusChip } from "@/components/StatusChip";

export default function AircraftPerformancePage() {
  useRequireAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["aircraft-performance"],
    queryFn: () => api.get<Page<AircraftPerformanceItem>>("/aircraft-performance?page_size=500"),
  });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Aircraft types (performance)</h1>
      {isLoading && <p className="text-fg/60">Loading…</p>}
      {data && (
        <DataTable
          rowKey={(r) => r.icao_type}
          rows={data.items}
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
