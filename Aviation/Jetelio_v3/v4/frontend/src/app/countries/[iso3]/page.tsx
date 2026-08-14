"use client";

import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Country } from "@/lib/types";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { getCurrentUserRole, canWrite } from "@/lib/jwt";
import { StatusChip } from "@/components/StatusChip";
import { EditableText, InfoField, EditableInfoField, EditableInfoCheckbox, EditableInfoSelect } from "@/components/EditableCell";
import { Breadcrumb } from "@/components/Breadcrumb";

const GROUND_HANDLING_OPTIONS = [
  { value: "MANDATORY", label: "Mandatory" },
  { value: "NOT_MANDATORY", label: "Not mandatory" },
  { value: "SELF_HANDLING_PERMITTED", label: "Self-handling permitted" },
  { value: "VERIFY", label: "Verify" },
];

const VALIDITY_UNIT_OPTIONS = [
  { value: "HOURS", label: "Hours" },
  { value: "DAYS", label: "Days" },
  { value: "WEEKS", label: "Weeks" },
  { value: "MONTHS", label: "Months" },
];

export default function CountryDetailPage() {
  useRequireAuth();
  const params = useParams<{ iso3: string }>();
  const iso3 = params.iso3;
  const queryClient = useQueryClient();
  const writable = canWrite(getCurrentUserRole());

  const { data: country, isLoading } = useQuery({
    queryKey: ["country", iso3],
    queryFn: () => api.get<Country>(`/countries/${iso3}`),
  });

  const update = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.patch<Country>(`/countries/${iso3}`, payload),
    onSuccess: (updated) => queryClient.setQueryData(["country", iso3], updated),
  });

  function save(field: string, value: unknown) {
    if (!country) return Promise.resolve();
    return update.mutateAsync({ version: country.version, [field]: value });
  }

  if (isLoading) return <p className="text-fg/60">Loading…</p>;
  if (!country) return <p className="text-danger">Country not found.</p>;

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: "Countries", href: "/countries" }, { label: country.name }]} />

      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">
          {writable ? <EditableText value={country.name} writable onSave={(v) => save("name", v)} /> : country.name}
        </h1>
        <span className="mono-figures text-sm text-fg/50">{country.iso3}</span>
        <StatusChip status={country.reference_status} />
      </header>

      <section className="grid gap-x-6 gap-y-3 rounded-lg border border-fg/10 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <InfoField label="ISO2" value={country.iso2} />
        <EditableInfoField label="Region" value={country.region} writable={writable} onSave={(v) => save("region", v || null)} />
        <EditableInfoField
          label="Standard lead time (h)"
          value={country.standard_lead_time_hours != null ? String(country.standard_lead_time_hours) : null}
          writable={writable}
          mono
          type="number"
          placeholder={country.effective_lead_time_is_fallback ? `fallback: ${country.effective_lead_time_hours}` : "—"}
          onSave={(v) => save("standard_lead_time_hours", v === "" ? null : Number(v))}
        />
        <EditableInfoField
          label="Permit validity amount"
          value={country.permit_validity_amount != null ? String(country.permit_validity_amount) : null}
          writable={writable}
          mono
          type="number"
          placeholder={
            country.effective_permit_validity_is_fallback
              ? `fallback: ${country.effective_permit_validity_amount} ${country.effective_permit_validity_unit}`
              : "—"
          }
          onSave={(v) => save("permit_validity_amount", v === "" ? null : Number(v))}
        />
        <EditableInfoSelect
          label="Permit validity unit"
          value={country.permit_validity_unit ?? "DAYS"}
          options={VALIDITY_UNIT_OPTIONS}
          writable={writable}
          onSave={(v) => save("permit_validity_unit", v)}
        />
        <EditableInfoCheckbox
          label="Overflight permit required"
          value={country.overflight_permit_required}
          writable={writable}
          onSave={(v) => save("overflight_permit_required", v)}
        />
        <EditableInfoCheckbox
          label="Landing permit required"
          value={country.landing_permit_required}
          writable={writable}
          onSave={(v) => save("landing_permit_required", v)}
        />
        <EditableInfoSelect
          label="Ground handling"
          value={country.ground_handling_policy}
          options={GROUND_HANDLING_OPTIONS}
          writable={writable}
          onSave={(v) => save("ground_handling_policy", v)}
        />
      </section>
    </div>
  );
}
