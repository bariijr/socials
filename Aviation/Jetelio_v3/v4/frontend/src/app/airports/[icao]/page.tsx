"use client";

import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Airport } from "@/lib/types";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { getCurrentUserRole, canWrite } from "@/lib/jwt";
import { StatusChip } from "@/components/StatusChip";
import { EditableText, InfoField, EditableInfoField } from "@/components/EditableCell";
import { CountryName, CountryPicker } from "@/components/CountryPicker";
import { Breadcrumb } from "@/components/Breadcrumb";

export default function AirportDetailPage() {
  useRequireAuth();
  const params = useParams<{ icao: string }>();
  const icao = params.icao;
  const queryClient = useQueryClient();
  const writable = canWrite(getCurrentUserRole());

  const { data: airport, isLoading } = useQuery({
    queryKey: ["airport", icao],
    queryFn: () => api.get<Airport>(`/airports/${icao}`),
  });

  const update = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.patch<Airport>(`/airports/${icao}`, payload),
    onSuccess: (updated) => queryClient.setQueryData(["airport", icao], updated),
  });

  function save(field: string, value: unknown) {
    if (!airport) return Promise.resolve();
    return update.mutateAsync({ version: airport.version, [field]: value });
  }

  if (isLoading) return <p className="text-fg/60">Loading…</p>;
  if (!airport) return <p className="text-danger">Airport not found.</p>;

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: "Airports", href: "/airports" }, { label: airport.name }]} />

      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">
          {writable ? <EditableText value={airport.name} writable onSave={(v) => save("name", v)} /> : airport.name}
        </h1>
        <span className="mono-figures text-sm text-fg/50">{airport.icao}</span>
        <StatusChip status={airport.tech_stop_readiness} />
      </header>

      <section className="grid gap-x-6 gap-y-3 rounded-lg border border-fg/10 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <EditableInfoField
          label="IATA"
          value={airport.iata}
          writable={writable}
          mono
          onSave={(v) => save("iata", v ? v.toUpperCase() : null)}
        />
        <EditableInfoField label="City" value={airport.city} writable={writable} onSave={(v) => save("city", v || null)} />
        <div>
          <div className="text-xs uppercase tracking-wide text-fg/50">Country</div>
          {writable ? (
            <CountryPicker value={airport.country_iso3 ?? ""} onChange={(v) => save("country_iso3", v || null)} />
          ) : (
            <div className="text-sm text-fg">
              {airport.country_iso3 ? <CountryName iso3={airport.country_iso3} /> : <span className="text-fg/30">—</span>}
            </div>
          )}
        </div>
        <InfoField label="Latitude" value={airport.lat} />
        <InfoField label="Longitude" value={airport.lon} />
      </section>
    </div>
  );
}
