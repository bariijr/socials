"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Page, Trip, TRIP_STATUSES } from "@/lib/types";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { getCurrentUserRole, canWrite } from "@/lib/jwt";
import { formatTripSource, formatUtc } from "@/lib/format";
import { DataTable } from "@/components/DataTable";
import { StatusChip } from "@/components/StatusChip";
import { EditableSelect } from "@/components/EditableCell";

const STATUSES = TRIP_STATUSES;
const STATUS_OPTIONS = STATUSES.map((s) => ({ value: s, label: s }));

export default function TripsListPage() {
  useRequireAuth();
  const [status, setStatus] = useState<string>("");
  const queryClient = useQueryClient();
  const writable = canWrite(getCurrentUserRole());

  const { data, isLoading } = useQuery({
    queryKey: ["trips", status],
    queryFn: () => api.get<Page<Trip>>(`/trips?page_size=200${status ? `&status=${status}` : ""}`),
  });

  const patch = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) => api.patch<Trip>(`/trips/${id}`, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["trips"] }),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Trips</h1>
        <Link href="/admin/trips/new" className="h-11 rounded-md bg-primary px-4 text-sm font-semibold leading-[44px] text-fg">
          New trip
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setStatus("")}
          className={`h-9 rounded-full border px-3 text-xs ${status === "" ? "border-primary text-primary" : "border-fg/20 text-fg/60"}`}
        >
          All
        </button>
        {STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatus(s)}
            className={`h-9 rounded-full border px-3 text-xs ${status === s ? "border-primary text-primary" : "border-fg/20 text-fg/60"}`}
          >
            {s}
          </button>
        ))}
      </div>

      {isLoading && <p className="text-fg/60">Loading…</p>}
      {data && (
        <DataTable
          rowKey={(r) => r.id}
          rows={data.items}
          columns={[
            {
              header: "Trip",
              render: (r) => (
                <Link href={`/admin/trips/${r.id}`} className="hover:text-primary">
                  {r.id.slice(0, 8)}
                </Link>
              ),
            },
            { header: "Registration", render: (r) => r.aircraft_registration ?? "—" },
            {
              header: "Start date",
              priority: 2,
              render: (r) => <span className="mono-figures">{formatUtc(r.start_date)}</span>,
            },
            {
              header: "End date",
              priority: 2,
              render: (r) => <span className="mono-figures">{formatUtc(r.end_date)}</span>,
            },
            { header: "Owner:Team", priority: 3, render: (r) => r.owner_team ?? "—" },
            { header: "Source", priority: 2, render: (r) => formatTripSource(r.source) },
            {
              header: "Status",
              render: (r) =>
                writable ? (
                  <EditableSelect
                    writable
                    value={r.status}
                    options={STATUS_OPTIONS}
                    onSave={(v) => patch.mutateAsync({ id: r.id, payload: { version: r.version, status: v } })}
                  />
                ) : (
                  <StatusChip status={r.status} />
                ),
            },
            { header: "Legs", priority: 3, render: (r) => <span className="mono-figures">{r.leg_count}</span> },
            { header: "Verdict", priority: 3, render: (r) => <StatusChip status={r.overall_verdict} /> },
          ]}
        />
      )}
    </div>
  );
}
