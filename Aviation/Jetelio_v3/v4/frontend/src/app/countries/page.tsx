"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Country, Page } from "@/lib/types";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { DataTable } from "@/components/DataTable";
import { StatusChip } from "@/components/StatusChip";

export default function CountriesPage() {
  useRequireAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["countries"],
    queryFn: () => api.get<Page<Country>>("/countries?page_size=500"),
  });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Countries</h1>
      {isLoading && <p className="text-fg/60">Loading…</p>}
      {data && (
        <DataTable
          rowKey={(r) => r.iso3}
          rows={data.items}
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
