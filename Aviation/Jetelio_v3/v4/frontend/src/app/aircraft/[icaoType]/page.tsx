"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { AircraftPerformanceItem } from "@/lib/types";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { getCurrentUserRole, canWrite } from "@/lib/jwt";
import { StatusChip } from "@/components/StatusChip";
import { EditableInfoField, EditableInfoCheckbox, InfoField } from "@/components/EditableCell";

export default function AircraftPerformanceDetailPage() {
  useRequireAuth();
  const params = useParams<{ icaoType: string }>();
  const icaoType = params.icaoType;
  const queryClient = useQueryClient();
  const writable = canWrite(getCurrentUserRole());

  const { data: item, isLoading } = useQuery({
    queryKey: ["aircraft-performance", icaoType],
    queryFn: () => api.get<AircraftPerformanceItem>(`/aircraft-performance/${icaoType}`),
  });

  const update = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.patch<AircraftPerformanceItem>(`/aircraft-performance/${icaoType}`, payload),
    onSuccess: (updated) => queryClient.setQueryData(["aircraft-performance", icaoType], updated),
  });

  function save(field: string, value: unknown) {
    if (!item) return Promise.resolve();
    return update.mutateAsync({ version: item.version, [field]: value });
  }

  if (isLoading) return <p className="text-fg/60">Loading…</p>;
  if (!item) return <p className="text-danger">Aircraft type not found.</p>;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/aircraft" className="text-sm text-fg/50 hover:text-fg/80">
          ← Aircraft types
        </Link>
      </div>

      <header className="flex flex-wrap items-center gap-3">
        <h1 className="mono-figures text-xl font-semibold">{item.icao_type}</h1>
        <StatusChip status={item.planning_status} />
      </header>

      <section className="grid gap-x-6 gap-y-3 rounded-lg border border-fg/10 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <EditableInfoField
          label="Manufacturer"
          value={item.manufacturer}
          writable={writable}
          onSave={(v) => save("manufacturer", v || null)}
        />
        <EditableInfoField
          label="Model series"
          value={item.model_series}
          writable={writable}
          onSave={(v) => save("model_series", v || null)}
        />
        <EditableInfoField
          label="Max range (NM)"
          value={item.max_range_nm != null ? String(item.max_range_nm) : null}
          writable={writable}
          mono
          type="number"
          onSave={(v) => save("max_range_nm", v === "" ? null : Number(v))}
        />
        <InfoField label="Practical range (NM)" value={item.practical_range_nm?.toFixed(0) ?? null} />
        <EditableInfoCheckbox label="Verified" value={item.verified} writable={writable} onSave={(v) => save("verified", v)} />
      </section>
    </div>
  );
}
