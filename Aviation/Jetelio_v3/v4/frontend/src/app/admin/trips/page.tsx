"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Page, Trip, TRIP_STATUSES } from "@/lib/types";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { getCurrentUserRole, canWrite } from "@/lib/jwt";
import { formatTripSource, formatUtc } from "@/lib/format";
import { matchesQuery } from "@/lib/search";
import { DataTable } from "@/components/DataTable";
import { SearchInput } from "@/components/SearchInput";
import { StatusChip } from "@/components/StatusChip";
import { EditableSelect } from "@/components/EditableCell";

const STATUSES = TRIP_STATUSES;
const STATUS_OPTIONS = STATUSES.map((s) => ({ value: s, label: s }));

export default function TripsListPage() {
  useRequireAuth();
  const [status, setStatus] = useState<string>("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<string>(STATUSES[0]);
  const queryClient = useQueryClient();
  const writable = canWrite(getCurrentUserRole());

  const { data, isLoading } = useQuery({
    queryKey: ["trips", status],
    queryFn: () => api.get<Page<Trip>>(`/trips?page_size=200${status ? `&status=${status}` : ""}`),
  });

  const rows =
    data?.items.filter((r) => matchesQuery(search, r.id, r.aircraft_registration, r.owner_team, r.source)) ?? [];

  const patch = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) => api.patch<Trip>(`/trips/${id}`, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["trips"] }),
  });

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll(visible: Trip[]) {
    setSelected((prev) => {
      const allSelected = visible.length > 0 && visible.every((r) => prev.has(r.id));
      return allSelected ? new Set() : new Set(visible.map((r) => r.id));
    });
  }

  const bulkUpdate = useMutation({
    mutationFn: async () => {
      const targets = rows.filter((r) => selected.has(r.id));
      await Promise.all(targets.map((r) => api.patch<Trip>(`/trips/${r.id}`, { version: r.version, status: bulkStatus })));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trips"] });
      setSelected(new Set());
    },
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

      <SearchInput value={search} onChange={setSearch} placeholder="Search trips…" />

      {writable && selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
          <span className="text-fg/70">{selected.size} selected</span>
          <select
            value={bulkStatus}
            onChange={(e) => setBulkStatus(e.target.value)}
            className="h-9 rounded-md border border-fg/20 bg-transparent px-2 text-sm text-fg"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s} className="bg-base">
                {s}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={bulkUpdate.isPending}
            onClick={() => bulkUpdate.mutate()}
            className="h-9 rounded-md bg-primary px-3 text-sm font-semibold text-fg disabled:opacity-50"
          >
            {bulkUpdate.isPending ? "Updating…" : `Set status: ${bulkStatus}`}
          </button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="h-9 rounded-md border border-fg/20 px-3 text-sm text-fg/70 hover:border-fg/40"
          >
            Clear
          </button>
        </div>
      )}

      {isLoading && <p className="text-fg/60">Loading…</p>}
      {data && (
        <DataTable
          rowKey={(r) => r.id}
          rows={rows}
          emptyMessage={search.trim() ? `No trips match "${search}".` : "No trips yet."}
          bulkSelect={
            writable ? { selectedKeys: selected, onToggleRow: toggleRow, onToggleAll: toggleAll } : undefined
          }
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
