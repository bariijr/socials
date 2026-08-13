"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import type {
  AircraftCreateRequest,
  AircraftDocumentRecord,
  AircraftDocumentType,
  AircraftRecord,
  AircraftStatus,
  AircraftUpdateRequest,
  Operator,
  OperatorDetail,
  OperatorMergeResult,
  Page as ApiPage,
} from "@/lib/types";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { getCurrentUserRole, canWrite, canDelete } from "@/lib/jwt";
import { formatUtcDate } from "@/lib/format";
import { StatusChip } from "@/components/StatusChip";
import { EditableText, InfoField, EditableInfoField } from "@/components/EditableCell";
import { CountryName, CountryPicker } from "@/components/CountryPicker";
import { SearchInput } from "@/components/SearchInput";
import { matchesQuery } from "@/lib/search";

const AIRCRAFT_STATUSES: AircraftStatus[] = ["ACTIVE", "GROUNDED", "ARCHIVED"];
const DOC_TYPES: AircraftDocumentType[] = ["REGISTRATION", "COFA", "INSURANCE", "AIRWORTHINESS", "NOISE_CERTIFICATE", "OTHER"];

const inputCls = "h-10 w-full rounded-md border border-fg/20 bg-transparent px-3 text-sm text-fg";
const labelCls = "mb-1 block text-xs text-fg/60";

function emptyAircraftDraft(operatorId: string): AircraftCreateRequest {
  return {
    registration: "",
    icao_type: "",
    manufacturer: null,
    model_series: null,
    serial_number: null,
    colors: null,
    nationality_iso3: null,
    default_callsign: null,
    home_base_icao: null,
    mtow_kg: null,
    max_pax: null,
    operator_id: operatorId,
    cofa_expiry: null,
    insurance_expiry: null,
    total_hours: null,
    total_landings: null,
    status: "ACTIVE",
  };
}

export default function OperatorDetailPage() {
  useRequireAuth();
  const params = useParams<{ id: string }>();
  const operatorId = params.id;
  const queryClient = useQueryClient();
  const role = getCurrentUserRole();
  const writable = canWrite(role);

  const [addingAircraft, setAddingAircraft] = useState(false);
  const [fleetSearch, setFleetSearch] = useState("");

  const { data: operator, isLoading: operatorLoading } = useQuery({
    queryKey: ["operator", operatorId],
    queryFn: () => api.get<OperatorDetail>(`/operators/${operatorId}`),
  });

  const { data: fleet, isLoading: fleetLoading } = useQuery({
    queryKey: ["aircraft", "operator", operatorId],
    queryFn: () => api.get<ApiPage<AircraftRecord>>(`/aircraft?operator_id=${operatorId}&page_size=500`),
  });

  const createAircraft = useMutation({
    mutationFn: (payload: AircraftCreateRequest) => api.post<AircraftRecord>("/aircraft", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["aircraft", "operator", operatorId] });
      setAddingAircraft(false);
    },
  });

  const updateOperator = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.patch<OperatorDetail>(`/operators/${operatorId}`, payload),
    onSuccess: (updated) => queryClient.setQueryData(["operator", operatorId], updated),
  });

  function saveOperatorField(field: string, value: unknown) {
    if (!operator) return Promise.resolve();
    return updateOperator.mutateAsync({ version: operator.version, [field]: value });
  }

  if (operatorLoading) return <p className="text-fg/60">Loading…</p>;
  if (!operator) return <p className="text-danger">Operator not found.</p>;

  const filteredFleet =
    fleet?.items.filter((ac) => matchesQuery(fleetSearch, ac.registration, ac.icao_type, ac.manufacturer, ac.model_series, ac.default_callsign)) ?? [];

  return (
    <div className="space-y-6">
      <div>
        <Link href="/operators" className="text-sm text-fg/50 hover:text-fg/80">
          ← Operators
        </Link>
      </div>

      <header className="space-y-1">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold">
            {writable ? (
              <EditableText value={operator.name ?? ""} writable onSave={(v) => saveOperatorField("name", v || null)} placeholder="(unnamed)" />
            ) : (
              operator.name ?? <span className="italic text-fg/40">(unnamed)</span>
            )}
          </h1>
          <StatusChip status={operator.status} />
          <StatusChip status={operator.assignable_status} />
        </div>
        {operator.quarantined && operator.quarantine_reason && (
          <p className="text-sm text-danger">Quarantined: {operator.quarantine_reason}</p>
        )}
      </header>

      <section className="grid gap-x-6 gap-y-3 rounded-lg border border-fg/10 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <EditableInfoField label="AOC number" value={operator.aoc_number} writable={writable} onSave={(v) => saveOperatorField("aoc_number", v || null)} />
        <EditableInfoField
          label="ICAO designator"
          value={operator.icao_designator}
          writable={writable}
          onSave={(v) => saveOperatorField("icao_designator", v ? v.toUpperCase() : null)}
        />
        <EditableInfoField
          label="IATA designator"
          value={operator.iata_designator}
          writable={writable}
          onSave={(v) => saveOperatorField("iata_designator", v ? v.toUpperCase() : null)}
        />
        <EditableInfoField
          label="Home base"
          value={operator.home_base_icao}
          writable={writable}
          onSave={(v) => saveOperatorField("home_base_icao", v ? v.toUpperCase() : null)}
        />
        <EditableInfoField label="Contact" value={operator.contact_name} writable={writable} onSave={(v) => saveOperatorField("contact_name", v || null)} />
        <EditableInfoField
          label="Contact phone"
          value={operator.contact_phone}
          writable={writable}
          onSave={(v) => saveOperatorField("contact_phone", v || null)}
        />
        <EditableInfoField label="OCC email" value={operator.occ_email} writable={writable} onSave={(v) => saveOperatorField("occ_email", v || null)} />
        <EditableInfoField
          label="Billing email"
          value={operator.billing_email}
          writable={writable}
          onSave={(v) => saveOperatorField("billing_email", v || null)}
        />
        <EditableInfoField
          label="Currency"
          value={operator.currency}
          writable={writable}
          onSave={(v) => saveOperatorField("currency", v ? v.toUpperCase() : null)}
        />
        <EditableInfoField label="Tax ID" value={operator.tax_id} writable={writable} onSave={(v) => saveOperatorField("tax_id", v || null)} />
        <EditableInfoField
          label="Credit limit"
          mono
          value={operator.credit_limit_minor_units != null ? String(operator.credit_limit_minor_units / 100) : null}
          suffix={operator.currency ?? ""}
          writable={writable}
          onSave={(v) => saveOperatorField("credit_limit_minor_units", v === "" ? null : Math.round(Number(v) * 100))}
        />
        <InfoField label="Source" value={operator.source_ref} />
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Fleet</h2>
          {writable && (
            <button
              type="button"
              onClick={() => setAddingAircraft((v) => !v)}
              className="h-9 rounded-md border border-fg/20 px-3 text-sm text-fg/70 hover:border-fg/40"
            >
              {addingAircraft ? "Cancel" : "Add aircraft"}
            </button>
          )}
        </div>

        {addingAircraft && (
          <AircraftForm
            initial={emptyAircraftDraft(operatorId)}
            submitLabel="Add aircraft"
            onSubmit={(payload) => createAircraft.mutateAsync({ ...payload, operator_id: operatorId })}
            onCancel={() => setAddingAircraft(false)}
            error={createAircraft.isError ? errorMessage(createAircraft.error) : null}
          />
        )}

        {fleetLoading && <p className="text-fg/60">Loading fleet…</p>}
        {fleet && fleet.items.length === 0 && !addingAircraft && (
          <p className="text-sm text-fg/50">No aircraft on file for this operator yet.</p>
        )}
        {fleet && fleet.items.length > 0 && (
          <SearchInput value={fleetSearch} onChange={setFleetSearch} placeholder="Search fleet…" />
        )}
        <div className="space-y-3">
          {filteredFleet.map((ac) => (
            <AircraftCard key={ac.id} aircraft={ac} operatorId={operatorId} writable={writable} canDeleteDocs={canDelete(role)} />
          ))}
          {fleet && fleet.items.length > 0 && filteredFleet.length === 0 && (
            <p className="text-sm text-fg/50">No aircraft match &quot;{fleetSearch}&quot;.</p>
          )}
        </div>
      </section>

      {canDelete(role) && <MergeOperatorSection operator={operator} />}
    </div>
  );
}

function MergeOperatorSection({ operator }: { operator: OperatorDetail }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [candidate, setCandidate] = useState<Operator | null>(null);
  const [result, setResult] = useState<OperatorMergeResult | null>(null);

  const { data: allOperators } = useQuery({
    queryKey: ["operators", "all-for-merge"],
    queryFn: () => api.get<ApiPage<Operator>>("/operators?page_size=500"),
    enabled: open,
  });

  const candidates = allOperators?.items.filter((o) => o.id !== operator.id && matchesQuery(search, o.name)) ?? [];

  const merge = useMutation({
    mutationFn: () => {
      if (!candidate) return Promise.reject(new Error("No duplicate selected"));
      return api.post<OperatorMergeResult>(`/operators/${operator.id}/merge`, {
        duplicate_operator_id: candidate.id,
        keep_version: operator.version,
        duplicate_version: candidate.version,
      });
    },
    onSuccess: (merged) => {
      setResult(merged);
      setCandidate(null);
      queryClient.invalidateQueries({ queryKey: ["operator", operator.id] });
      queryClient.invalidateQueries({ queryKey: ["aircraft", "operator", operator.id] });
      queryClient.invalidateQueries({ queryKey: ["operators"] });
    },
  });

  return (
    <section className="space-y-3 rounded-lg border border-danger/30 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Merge duplicate operator</h2>
          <p className="text-sm text-fg/50">
            Fold a duplicate record (e.g. a misspelled or re-entered name) into this one. Fleet, clients, users, and service
            configs all move over; this operator&apos;s blank fields get filled in from the duplicate&apos;s real data. Not
            reversible.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setOpen((v) => !v);
            setCandidate(null);
            setResult(null);
          }}
          className="h-9 shrink-0 rounded-md border border-danger/40 px-3 text-sm text-danger hover:border-danger"
        >
          {open ? "Cancel" : "Find duplicate…"}
        </button>
      </div>

      {open && !candidate && !result && (
        <div className="space-y-2">
          <SearchInput value={search} onChange={setSearch} placeholder="Search operators to merge in…" />
          <ul className="max-h-64 divide-y divide-fg/10 overflow-y-auto rounded-md border border-fg/10 text-sm">
            {candidates.slice(0, 50).map((o) => (
              <li key={o.id}>
                <button
                  type="button"
                  onClick={() => setCandidate(o)}
                  className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-fg/5"
                >
                  <span>{o.name ?? <span className="italic text-fg/40">(unnamed)</span>}</span>
                  {o.quarantined && <span className="text-xs text-danger">quarantined</span>}
                </button>
              </li>
            ))}
            {search.trim() !== "" && candidates.length === 0 && <li className="px-3 py-2 text-fg/50">No matches.</li>}
          </ul>
        </div>
      )}

      {candidate && !result && (
        <div className="space-y-3 rounded-md border border-danger/30 bg-danger/5 p-3 text-sm">
          <p>
            Merge <span className="font-semibold">{candidate.name ?? "(unnamed)"}</span> into{" "}
            <span className="font-semibold">{operator.name ?? "(unnamed)"}</span>? {candidate.name ?? "(unnamed)"} will be
            deleted; everything pointing at it (fleet, clients, users, service configs) moves to this operator instead. This
            cannot be undone.
          </p>
          {merge.isError && <p className="text-danger">{errorMessage(merge.error)}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={merge.isPending}
              onClick={() => merge.mutate()}
              className="h-9 rounded-md bg-danger px-4 text-sm font-semibold text-white disabled:opacity-50"
            >
              {merge.isPending ? "Merging…" : "Confirm merge"}
            </button>
            <button
              type="button"
              onClick={() => setCandidate(null)}
              className="h-9 rounded-md border border-fg/20 px-3 text-sm text-fg/70 hover:border-fg/40"
            >
              Back
            </button>
          </div>
        </div>
      )}

      {result && (
        <div className="space-y-2 rounded-md border border-fg/10 bg-fg/5 p-3 text-sm">
          <p className="font-medium">Merged successfully.</p>
          <ul className="text-fg/70">
            {Object.entries(result.reassigned)
              .filter(([, count]) => count > 0)
              .map(([table, count]) => (
                <li key={table}>
                  {count} {table.replace(/_/g, " ")} reassigned
                </li>
              ))}
            {Object.values(result.reassigned).every((c) => c === 0) && <li>No related records needed reassigning.</li>}
          </ul>
          {result.fields_backfilled.length > 0 && (
            <p className="text-fg/70">Filled in from the duplicate: {result.fields_backfilled.join(", ")}</p>
          )}
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setResult(null);
            }}
            className="h-9 rounded-md border border-fg/20 px-3 text-sm text-fg/70 hover:border-fg/40"
          >
            Done
          </button>
        </div>
      )}
    </section>
  );
}

function errorMessage(err: unknown): string {
  return err instanceof ApiError ? "Save failed — check the fields." : "Could not reach the API.";
}

function AircraftCard({
  aircraft,
  operatorId,
  writable,
  canDeleteDocs,
}: {
  aircraft: AircraftRecord;
  operatorId: string;
  writable: boolean;
  canDeleteDocs: boolean;
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [docsOpen, setDocsOpen] = useState(false);

  const updateAircraft = useMutation({
    mutationFn: (payload: AircraftUpdateRequest) => api.patch<AircraftRecord>(`/aircraft/${aircraft.id}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["aircraft", "operator", operatorId] });
      setEditing(false);
    },
  });

  return (
    <div className="rounded-lg border border-fg/10 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <span className="mono-figures text-base text-fg font-semibold">{aircraft.registration}</span>
          <span className="text-sm text-fg/60">{aircraft.icao_type}</span>
          <StatusChip status={aircraft.status} />
          {aircraft.quarantined && <StatusChip status="QUARANTINED" />}
        </div>
        <div className="flex gap-2">
          {writable && (
            <button
              type="button"
              onClick={() => setEditing((v) => !v)}
              className="h-8 rounded-md border border-fg/20 px-2.5 text-xs text-fg/70 hover:border-fg/40"
            >
              {editing ? "Cancel" : "Edit"}
            </button>
          )}
          <button
            type="button"
            onClick={() => setDocsOpen((v) => !v)}
            className="h-8 rounded-md border border-fg/20 px-2.5 text-xs text-fg/70 hover:border-fg/40"
          >
            {docsOpen ? "Hide documents" : "Documents"}
          </button>
        </div>
      </div>

      {!editing && (
        <div className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <InfoField label="Serial" value={aircraft.serial_number} />
          <InfoField label="Colors" value={aircraft.colors} />
          <InfoField label="MTOW (kg)" value={aircraft.mtow_kg != null ? aircraft.mtow_kg.toLocaleString() : null} />
          <InfoField label="Max pax" value={aircraft.max_pax != null ? String(aircraft.max_pax) : null} />
          <InfoField label="Nationality" value={aircraft.nationality_iso3 ? <CountryName iso3={aircraft.nationality_iso3} /> : null} />
          <InfoField label="Default callsign" value={aircraft.default_callsign} />
          <InfoField label="Home base" value={aircraft.home_base_icao} />
          <InfoField label="Manufacturer" value={aircraft.manufacturer} />
          <InfoField label="Model series" value={aircraft.model_series} />
          <InfoField label="COFA expiry" value={aircraft.cofa_expiry ? formatUtcDate(aircraft.cofa_expiry) : null} />
          <InfoField label="Insurance expiry" value={aircraft.insurance_expiry ? formatUtcDate(aircraft.insurance_expiry) : null} />
          <InfoField label="Total hours" value={aircraft.total_hours != null ? aircraft.total_hours.toLocaleString() : null} />
          <InfoField label="Total landings" value={aircraft.total_landings != null ? String(aircraft.total_landings) : null} />
        </div>
      )}

      {editing && (
        <div className="mt-3">
          <AircraftForm
            initial={aircraft}
            submitLabel="Save changes"
            onSubmit={(payload) => updateAircraft.mutateAsync({ ...payload, version: aircraft.version })}
            onCancel={() => setEditing(false)}
            error={updateAircraft.isError ? errorMessage(updateAircraft.error) : null}
          />
        </div>
      )}

      {docsOpen && (
        <div className="mt-4 border-t border-fg/10 pt-3">
          <AircraftDocumentsPanel aircraftId={aircraft.id} writable={writable} canDelete={canDeleteDocs} />
        </div>
      )}
    </div>
  );
}

type AircraftFormValue = AircraftCreateRequest | AircraftRecord;

// Shared shape submitted by the form — everything except operator_id (only
// meaningful on create) and version (only meaningful on update). The caller
// attaches whichever of those two applies before sending the request.
interface AircraftFormPayload {
  registration: string;
  icao_type: string;
  manufacturer: string | null;
  model_series: string | null;
  serial_number: string | null;
  colors: string | null;
  nationality_iso3: string | null;
  default_callsign: string | null;
  home_base_icao: string | null;
  mtow_kg: number | null;
  max_pax: number | null;
  cofa_expiry: string | null;
  insurance_expiry: string | null;
  total_hours: number | null;
  total_landings: number | null;
  status: AircraftStatus;
}

function AircraftForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
  error,
}: {
  initial: AircraftFormValue;
  submitLabel: string;
  onSubmit: (payload: AircraftFormPayload) => Promise<unknown>;
  onCancel: () => void;
  error: string | null;
}) {
  const [registration, setRegistration] = useState(initial.registration ?? "");
  const [icaoType, setIcaoType] = useState(initial.icao_type ?? "");
  const [manufacturer, setManufacturer] = useState(initial.manufacturer ?? "");
  const [modelSeries, setModelSeries] = useState(initial.model_series ?? "");
  const [serialNumber, setSerialNumber] = useState(initial.serial_number ?? "");
  const [colors, setColors] = useState(initial.colors ?? "");
  const [nationality, setNationality] = useState(initial.nationality_iso3 ?? "");
  const [defaultCallsign, setDefaultCallsign] = useState(initial.default_callsign ?? "");
  const [homeBase, setHomeBase] = useState(initial.home_base_icao ?? "");
  const [mtowKg, setMtowKg] = useState(initial.mtow_kg != null ? String(initial.mtow_kg) : "");
  const [maxPax, setMaxPax] = useState(initial.max_pax != null ? String(initial.max_pax) : "");
  const [cofaExpiry, setCofaExpiry] = useState(initial.cofa_expiry ?? "");
  const [insuranceExpiry, setInsuranceExpiry] = useState(initial.insurance_expiry ?? "");
  const [totalHours, setTotalHours] = useState(initial.total_hours != null ? String(initial.total_hours) : "");
  const [totalLandings, setTotalLandings] = useState(initial.total_landings != null ? String(initial.total_landings) : "");
  const [status, setStatus] = useState<AircraftStatus>(initial.status ?? "ACTIVE");
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = registration.trim() !== "" && icaoType.trim() !== "";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await onSubmit({
        registration: registration.trim().toUpperCase(),
        icao_type: icaoType.trim().toUpperCase(),
        manufacturer: manufacturer || null,
        model_series: modelSeries || null,
        serial_number: serialNumber ? serialNumber.toUpperCase() : null,
        colors: colors || null,
        nationality_iso3: nationality ? nationality.toUpperCase() : null,
        default_callsign: defaultCallsign ? defaultCallsign.toUpperCase() : null,
        home_base_icao: homeBase ? homeBase.toUpperCase() : null,
        mtow_kg: mtowKg ? Number(mtowKg) : null,
        max_pax: maxPax ? Number(maxPax) : null,
        cofa_expiry: cofaExpiry || null,
        insurance_expiry: insuranceExpiry || null,
        total_hours: totalHours ? Number(totalHours) : null,
        total_landings: totalLandings ? Number(totalLandings) : null,
        status,
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-md border border-fg/10 bg-fg/5 p-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className={labelCls}>Registration</label>
          <input className={`mono-figures ${inputCls}`} value={registration} onChange={(e) => setRegistration(e.target.value.toUpperCase())} required />
        </div>
        <div>
          <label className={labelCls}>ICAO type</label>
          <input className={`mono-figures ${inputCls}`} value={icaoType} onChange={(e) => setIcaoType(e.target.value.toUpperCase())} required />
        </div>
        <div>
          <label className={labelCls}>Manufacturer</label>
          <input className={inputCls} value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Model series</label>
          <input className={inputCls} value={modelSeries} onChange={(e) => setModelSeries(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Serial number</label>
          <input className={`mono-figures ${inputCls}`} value={serialNumber} onChange={(e) => setSerialNumber(e.target.value.toUpperCase())} />
        </div>
        <div>
          <label className={labelCls}>Colors</label>
          <input className={inputCls} value={colors} onChange={(e) => setColors(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Nationality</label>
          <CountryPicker value={nationality} onChange={setNationality} />
        </div>
        <div>
          <label className={labelCls}>Default callsign</label>
          <input className={`mono-figures ${inputCls}`} value={defaultCallsign} onChange={(e) => setDefaultCallsign(e.target.value.toUpperCase())} />
        </div>
        <div>
          <label className={labelCls}>Home base (ICAO)</label>
          <input className={`mono-figures ${inputCls}`} maxLength={4} value={homeBase} onChange={(e) => setHomeBase(e.target.value.toUpperCase())} />
        </div>
        <div>
          <label className={labelCls}>MTOW (kg)</label>
          <input type="number" min={0} className={`mono-figures ${inputCls}`} value={mtowKg} onChange={(e) => setMtowKg(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Max pax</label>
          <input type="number" min={0} className={`mono-figures ${inputCls}`} value={maxPax} onChange={(e) => setMaxPax(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Status</label>
          <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value as AircraftStatus)}>
            {AIRCRAFT_STATUSES.map((s) => (
              <option key={s} value={s} className="bg-base">
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>COFA expiry</label>
          <input type="date" className={`mono-figures ${inputCls}`} value={cofaExpiry} onChange={(e) => setCofaExpiry(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Insurance expiry</label>
          <input type="date" className={`mono-figures ${inputCls}`} value={insuranceExpiry} onChange={(e) => setInsuranceExpiry(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Total hours</label>
          <input type="number" min={0} step="0.1" className={`mono-figures ${inputCls}`} value={totalHours} onChange={(e) => setTotalHours(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Total landings</label>
          <input type="number" min={0} className={`mono-figures ${inputCls}`} value={totalLandings} onChange={(e) => setTotalLandings(e.target.value)} />
        </div>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={!canSubmit || submitting}
          className="h-9 rounded-md bg-primary px-4 text-sm font-semibold text-fg disabled:opacity-50"
        >
          {submitting ? "Saving…" : submitLabel}
        </button>
        <button type="button" onClick={onCancel} className="h-9 rounded-md border border-fg/20 px-3 text-sm text-fg/70 hover:border-fg/40">
          Cancel
        </button>
      </div>
    </form>
  );
}

function AircraftDocumentsPanel({
  aircraftId,
  writable,
  canDelete: allowDelete,
}: {
  aircraftId: string;
  writable: boolean;
  canDelete: boolean;
}) {
  const queryClient = useQueryClient();
  const [docType, setDocType] = useState<AircraftDocumentType>("OTHER");
  const [expiryDate, setExpiryDate] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const { data: docs, isLoading } = useQuery({
    queryKey: ["aircraft-documents", aircraftId],
    queryFn: () => api.get<AircraftDocumentRecord[]>(`/aircraft/${aircraftId}/documents`),
  });

  const upload = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("No file selected");
      const formData = new FormData();
      formData.append("doc_type", docType);
      if (expiryDate) formData.append("expiry_date", expiryDate);
      formData.append("file", file);
      return api.upload<AircraftDocumentRecord>(`/aircraft/${aircraftId}/documents`, formData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["aircraft-documents", aircraftId] });
      setFile(null);
      setExpiryDate("");
      setUploadError(null);
    },
    onError: (err) => setUploadError(err instanceof ApiError ? "Upload failed — check the file and try again." : "Could not reach the API."),
  });

  const remove = useMutation({
    mutationFn: (docId: string) => api.del<void>(`/aircraft/${aircraftId}/documents/${docId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["aircraft-documents", aircraftId] }),
  });

  async function handleDownload(doc: AircraftDocumentRecord) {
    setDownloadingId(doc.id);
    try {
      const blob = await api.download(`/aircraft/${aircraftId}/documents/${doc.id}/download`);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = doc.filename;
      a.click();
      window.URL.revokeObjectURL(url);
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <div className="space-y-3">
      {writable && (
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className={labelCls}>Type</label>
            <select className={`h-9 ${inputCls}`} value={docType} onChange={(e) => setDocType(e.target.value as AircraftDocumentType)}>
              {DOC_TYPES.map((t) => (
                <option key={t} value={t} className="bg-base">
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Expiry (optional)</label>
            <input type="date" className={`mono-figures h-9 ${inputCls}`} value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>File</label>
            <input
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block text-sm text-fg/70 file:mr-2 file:h-9 file:rounded-md file:border file:border-fg/20 file:bg-transparent file:px-3 file:text-sm file:text-fg/70"
            />
          </div>
          <button
            type="button"
            disabled={!file || upload.isPending}
            onClick={() => upload.mutate()}
            className="h-9 rounded-md bg-primary px-3 text-sm font-semibold text-fg disabled:opacity-50"
          >
            {upload.isPending ? "Uploading…" : "Upload"}
          </button>
        </div>
      )}
      {uploadError && <p className="text-sm text-danger">{uploadError}</p>}

      {isLoading && <p className="text-sm text-fg/50">Loading documents…</p>}
      {docs && docs.length === 0 && <p className="text-sm text-fg/50">No documents on file.</p>}
      {docs && docs.length > 0 && (
        <ul className="divide-y divide-fg/10 text-sm">
          {docs.map((doc) => (
            <li key={doc.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div>
                <span className="font-medium">{doc.filename}</span>
                <span className="ml-2 text-xs text-fg/50">{doc.doc_type}</span>
                {doc.expiry_date && <span className="ml-2 text-xs text-fg/50">expires {doc.expiry_date}</span>}
                {doc.file_size_bytes != null && (
                  <span className="ml-2 text-xs text-fg/40">{(doc.file_size_bytes / 1024).toFixed(0)} KB</span>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleDownload(doc)}
                  disabled={downloadingId === doc.id}
                  className="h-8 rounded-md border border-fg/20 px-2.5 text-xs text-fg/70 hover:border-fg/40 disabled:opacity-50"
                >
                  {downloadingId === doc.id ? "…" : "Download"}
                </button>
                {allowDelete && (
                  <button
                    type="button"
                    onClick={() => remove.mutate(doc.id)}
                    disabled={remove.isPending}
                    className="h-8 rounded-md border border-danger/40 px-2.5 text-xs text-danger hover:border-danger disabled:opacity-50"
                  >
                    Delete
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
