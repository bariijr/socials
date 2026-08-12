"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Operator, Page } from "@/lib/types";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { getCurrentUserRole, canWrite } from "@/lib/jwt";
import { DataTable } from "@/components/DataTable";
import { StatusChip } from "@/components/StatusChip";
import { EditableSelect } from "@/components/EditableCell";

const OPERATOR_STATUS_OPTIONS = [
  { value: "ACTIVE", label: "Active" },
  { value: "SUSPENDED", label: "Suspended" },
  { value: "ARCHIVED", label: "Archived" },
];

export default function OperatorsPage() {
  useRequireAuth();
  const queryClient = useQueryClient();
  const writable = canWrite(getCurrentUserRole());

  const { data, isLoading } = useQuery({
    queryKey: ["operators"],
    queryFn: () => api.get<Page<Operator>>("/operators?page_size=500"),
  });

  const patch = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) => api.patch<Operator>(`/operators/${id}`, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["operators"] }),
  });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Operators</h1>
      {isLoading && <p className="text-fg/60">Loading…</p>}
      {data && (
        <DataTable
          rowKey={(r) => r.id}
          rows={data.items}
          columns={[
            {
              header: "Name",
              render: (r) => (
                <Link href={`/operators/${r.id}`} className="text-primary hover:underline">
                  {r.name ?? <span className="text-fg/40 italic">(unnamed)</span>}
                </Link>
              ),
            },
            {
              header: "Status",
              priority: 2,
              render: (r) => (
                <EditableSelect
                  writable={writable}
                  value={r.status}
                  options={OPERATOR_STATUS_OPTIONS}
                  onSave={(v) => patch.mutateAsync({ id: r.id, payload: { version: r.version, status: v } })}
                />
              ),
            },
            { header: "Assignable", render: (r) => <StatusChip status={r.assignable_status} /> },
            { header: "Quarantine reason", priority: 3, render: (r) => r.quarantine_reason ?? "—" },
          ]}
        />
      )}
    </div>
  );
}
