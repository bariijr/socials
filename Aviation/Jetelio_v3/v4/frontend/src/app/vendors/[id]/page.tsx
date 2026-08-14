"use client";

import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Vendor } from "@/lib/types";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { getCurrentUserRole, canWrite } from "@/lib/jwt";
import { formatUtcDate } from "@/lib/format";
import { StatusChip } from "@/components/StatusChip";
import { EditableText, InfoField, EditableInfoField, EditableInfoSelect } from "@/components/EditableCell";
import { Breadcrumb } from "@/components/Breadcrumb";

const CAPABILITY_STATUS_OPTIONS = [
  { value: "PENDING", label: "Pending" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
  { value: "EXPIRED", label: "Expired" },
];

export default function VendorDetailPage() {
  useRequireAuth();
  const params = useParams<{ id: string }>();
  const vendorId = params.id;
  const queryClient = useQueryClient();
  const writable = canWrite(getCurrentUserRole());

  const { data: vendor, isLoading } = useQuery({
    queryKey: ["vendor", vendorId],
    queryFn: () => api.get<Vendor>(`/vendors/${vendorId}`),
  });

  const update = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.patch<Vendor>(`/vendors/${vendorId}`, payload),
    onSuccess: (updated) => queryClient.setQueryData(["vendor", vendorId], updated),
  });

  function save(field: string, value: unknown) {
    if (!vendor) return Promise.resolve();
    return update.mutateAsync({ version: vendor.version, [field]: value });
  }

  if (isLoading) return <p className="text-fg/60">Loading…</p>;
  if (!vendor) return <p className="text-danger">Vendor not found.</p>;

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: "Vendors", href: "/vendors" }, { label: vendor.name }]} />

      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">
          {writable ? <EditableText value={vendor.name} writable onSave={(v) => save("name", v)} /> : vendor.name}
        </h1>
        <span className="mono-figures text-sm text-fg/50">{vendor.billing_ref}</span>
        <StatusChip status={vendor.capability_status} />
      </header>

      <section className="grid gap-x-6 gap-y-3 rounded-lg border border-fg/10 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <EditableInfoField
          label="Preference rank"
          value={vendor.preference_rank != null ? String(vendor.preference_rank) : null}
          writable={writable}
          mono
          type="number"
          onSave={(v) => save("preference_rank", v === "" ? null : Number(v))}
        />
        <EditableInfoSelect
          label="Capability status"
          value={vendor.capability_status}
          options={CAPABILITY_STATUS_OPTIONS}
          writable={writable}
          onSave={(v) => save("capability_status", v)}
        />
        <InfoField label="Service scope" value={vendor.service_scope?.join(", ") ?? null} />
        <InfoField label="Approved by" value={vendor.approved_by} />
        <InfoField label="Approved on" value={vendor.approved_on ? formatUtcDate(vendor.approved_on) : null} />
        <InfoField label="Questionnaire sent" value={vendor.questionnaire_sent_on ? formatUtcDate(vendor.questionnaire_sent_on) : null} />
        <InfoField
          label="Questionnaire returned"
          value={vendor.questionnaire_returned_on ? formatUtcDate(vendor.questionnaire_returned_on) : null}
        />
        <InfoField label="Source" value={vendor.source_ref} />
      </section>
    </div>
  );
}
