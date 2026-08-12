"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Page, Vendor } from "@/lib/types";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { getCurrentUserRole, canWrite } from "@/lib/jwt";
import { DataTable } from "@/components/DataTable";
import { EditableSelect } from "@/components/EditableCell";

const CAPABILITY_STATUS_OPTIONS = [
  { value: "PENDING", label: "Pending" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
  { value: "EXPIRED", label: "Expired" },
];

export default function VendorsPage() {
  useRequireAuth();
  const queryClient = useQueryClient();
  const writable = canWrite(getCurrentUserRole());

  const { data, isLoading } = useQuery({
    queryKey: ["vendors"],
    queryFn: () => api.get<Page<Vendor>>("/vendors?page_size=500"),
  });

  const patch = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) => api.patch<Vendor>(`/vendors/${id}`, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["vendors"] }),
  });

  function save(row: Vendor, field: string, value: unknown) {
    return patch.mutateAsync({ id: row.id, payload: { version: row.version, [field]: value } });
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Vendors</h1>
      {isLoading && <p className="text-fg/60">Loading…</p>}
      {data && (
        <DataTable
          rowKey={(r) => r.id}
          rows={data.items}
          columns={[
            {
              header: "Name",
              render: (r) => (
                <Link href={`/vendors/${r.id}`} className="hover:text-primary">
                  {r.name}
                </Link>
              ),
            },
            { header: "Billing ref", priority: 2, render: (r) => <span className="mono-figures">{r.billing_ref}</span> },
            {
              header: "Preference rank",
              priority: 3,
              render: (r) => <span className="mono-figures">{r.preference_rank ?? "—"}</span>,
            },
            {
              header: "Capability status",
              render: (r) => (
                <EditableSelect
                  writable={writable}
                  value={r.capability_status}
                  options={CAPABILITY_STATUS_OPTIONS}
                  onSave={(v) => save(r, "capability_status", v)}
                />
              ),
            },
          ]}
        />
      )}
    </div>
  );
}
