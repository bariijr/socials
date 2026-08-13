"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient, UseMutationResult } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import {
  CustomServiceAssignmentRequest,
  LegInput,
  Page,
  PermitAssignment,
  ServiceAssignment,
  ServiceAssignmentRequest,
  ServiceCatalogueEntry,
  ServiceDeliveryResolved,
  ServiceMessage,
  ServiceMessageCreateRequest,
  SendServiceRequestOut,
  TripDetail,
  TripUpdateRequest,
  TRIP_STATUSES,
  Vendor,
} from "@/lib/types";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { getCurrentUserRole, canWrite, canDelete } from "@/lib/jwt";
import { formatTripSource, formatUtc } from "@/lib/format";
import { StatusChip } from "@/components/StatusChip";
import { RoutePreviewPanel } from "@/components/RoutePreviewPanel";
import { LegSummaryTable } from "@/components/LegSummaryTable";
import { LegEditor } from "@/components/LegEditor";
import { CountryName } from "@/components/CountryPicker";
import { EditableText, EditableInfoField, EditableInfoSelect } from "@/components/EditableCell";

const TABS = ["Overview", "Route", "Permits", "Services", "Crew & Pax", "Documents", "Billing", "Messages"] as const;
type Tab = (typeof TABS)[number];

const OPS_TYPE_OPTIONS = [
  { value: "", label: "(not set)" },
  { value: "PRIVATE", label: "Private" },
  { value: "MILITARY", label: "Military" },
  { value: "CHARTER", label: "Charter" },
  { value: "CARGO", label: "Cargo" },
  { value: "MEDEVAC", label: "Medevac" },
  { value: "OTHER", label: "Other" },
];

const FLIGHT_PURPOSE_OPTIONS = [
  { value: "", label: "(not set)" },
  { value: "BUSINESS", label: "Business" },
  { value: "TOURISM", label: "Tourism" },
  { value: "FERRY", label: "Ferry" },
  { value: "REPOSITION", label: "Reposition" },
  { value: "OTHER", label: "Other" },
];

const NOT_BUILT_TABS: Partial<Record<Tab, string>> = {
  Documents: "Document upload, OCR extraction and expiry tracking land in Phase 5.",
  Billing: "Rate cards and invoicing land in Phase 5.",
  Messages: "Templated dispatch to handlers/CAAs lands in Phase 6.",
};

// Task #117 — maps a GET-returned leg back into the LegInput shape
// LegEditor needs for editing. client_id/registration/leg_type/leg_status
// have no LegEditor input (true at creation time too) — seeding them here
// and never touching them in LegEditor's {...leg, ...patch} merge is what
// makes them round-trip unchanged through an edit.
function legDetailToInput(leg: TripDetail["legs"][number]): LegInput {
  return {
    dep_icao: leg.result.dep_icao,
    arr_icao: leg.result.arr_icao,
    call_sign: leg.call_sign,
    reference_datetime: leg.reference_datetime,
    required_arrival_datetime: null, // editing is always departure-driven (task #116)
    arrival_datetime_override: leg.arrival_datetime,
    avoid_states: leg.avoid_states,
    include_states: leg.include_states,
    avoid_firs: leg.avoid_firs,
    include_firs: leg.include_firs,
    filed_route: leg.result.filed_route,
    client_id: leg.client?.id ?? null,
    registration: leg.registration,
    leg_type: leg.leg_type,
    leg_status: leg.leg_status,
  };
}

function emptyLegInput(depIcao = ""): LegInput {
  return {
    dep_icao: depIcao,
    arr_icao: "",
    call_sign: null,
    reference_datetime: null,
    required_arrival_datetime: null,
    arrival_datetime_override: null,
    avoid_states: [],
    include_states: [],
    avoid_firs: [],
    include_firs: [],
    filed_route: null,
    client_id: null,
    registration: null,
    leg_type: "PRIMARY",
    leg_status: "PENDING",
  };
}

export default function TripDetailPage() {
  useRequireAuth();
  const params = useParams<{ id: string }>();
  const tripId = params.id;
  const queryClient = useQueryClient();
  const role = getCurrentUserRole();
  const writable = canWrite(role);

  const [tab, setTab] = useState<Tab>("Overview");
  const [notesDraft, setNotesDraft] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  // Task #117 — only one leg editable (or one new leg being added) at a
  // time, avoiding per-row local-state duplication.
  const [editingLegId, setEditingLegId] = useState<string | null>(null);
  const [draftLeg, setDraftLeg] = useState<LegInput | null>(null);
  const [addingLeg, setAddingLeg] = useState(false);
  const [newLeg, setNewLeg] = useState<LegInput | null>(null);
  const [downloadingPnr, setDownloadingPnr] = useState(false);

  const { data: trip, isLoading } = useQuery({
    queryKey: ["trip", tripId],
    queryFn: () => api.get<TripDetail>(`/trips/${tripId}`),
  });

  // Small, bounded reference sets — fetched once here rather than per-row,
  // same rationale as airports/page.tsx's country-name lookup (#90).
  const { data: serviceCatalogue } = useQuery({
    queryKey: ["service-catalogue"],
    queryFn: () => api.get<Page<ServiceCatalogueEntry>>("/service-catalogue?page_size=500"),
  });
  const { data: vendors } = useQuery({
    queryKey: ["vendors"],
    queryFn: () => api.get<Page<Vendor>>("/vendors?page_size=500"),
  });
  const vendorNames = Object.fromEntries((vendors?.items ?? []).map((v) => [v.id, v.name]));
  const catalogueByCode = Object.fromEntries((serviceCatalogue?.items ?? []).map((c) => [c.code, c]));
  const catalogueById = Object.fromEntries((serviceCatalogue?.items ?? []).map((c) => [c.id, c]));
  const subServicesByParentCode = (serviceCatalogue?.items ?? [])
    .filter((c) => c.level === "SUB-SERVICE" && c.parent_service_id)
    .reduce<Record<string, ServiceCatalogueEntry[]>>((acc, c) => {
      const parentCode = catalogueById[c.parent_service_id!]?.code;
      if (parentCode) (acc[parentCode] ??= []).push(c);
      return acc;
    }, {});

  const updateTrip = useMutation({
    mutationFn: (payload: TripUpdateRequest) => api.patch<TripDetail>(`/trips/${tripId}`, payload),
    onSuccess: (updated) => {
      queryClient.setQueryData(["trip", tripId], updated);
      setActionError(null);
    },
    onError: (err) => setActionError(err instanceof ApiError ? "Could not update the trip." : "Could not reach the API"),
  });

  const updateServiceAssignment = useMutation({
    mutationFn: ({ legId, serviceCode, icao, payload }: { legId: string; serviceCode: string; icao: string; payload: ServiceAssignmentRequest }) =>
      api.put<TripDetail>(`/trips/${tripId}/legs/${legId}/service-assignments/${serviceCode}/${icao}`, payload),
    onSuccess: (updated) => queryClient.setQueryData(["trip", tripId], updated),
  });

  const addCustomService = useMutation({
    mutationFn: ({ legId, payload }: { legId: string; payload: CustomServiceAssignmentRequest }) =>
      api.post<TripDetail>(`/trips/${tripId}/legs/${legId}/services/custom`, payload),
    onSuccess: (updated) => queryClient.setQueryData(["trip", tripId], updated),
  });

  const removeCustomService = useMutation({
    mutationFn: ({ legId, serviceCode, icao }: { legId: string; serviceCode: string; icao: string }) =>
      api.del<TripDetail>(`/trips/${tripId}/legs/${legId}/services/custom/${serviceCode}/${icao}`),
    onSuccess: (updated) => queryClient.setQueryData(["trip", tripId], updated),
  });

  const sendServices = useMutation({
    mutationFn: ({ legId, items }: { legId: string; items: { service_code: string; icao: string }[] }) =>
      api.post<SendServiceRequestOut[]>(`/trips/${tripId}/legs/${legId}/services/send`, { items }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["trip", tripId] }),
  });

  // Task #117 — leg add/edit/remove, wired to endpoints that already
  // existed (add_leg/update_leg/remove_leg) but nothing on this page
  // called before now.
  const addLeg = useMutation({
    mutationFn: (payload: LegInput) => api.post<TripDetail>(`/trips/${tripId}/legs`, payload),
    onSuccess: (updated) => {
      queryClient.setQueryData(["trip", tripId], updated);
      setAddingLeg(false);
    },
  });

  const updateLeg = useMutation({
    mutationFn: ({ legId, payload }: { legId: string; payload: LegInput }) =>
      api.patch<TripDetail>(`/trips/${tripId}/legs/${legId}`, payload),
    onSuccess: (updated) => {
      queryClient.setQueryData(["trip", tripId], updated);
      setEditingLegId(null);
    },
  });

  const removeLeg = useMutation({
    mutationFn: (legId: string) => api.del<TripDetail>(`/trips/${tripId}/legs/${legId}`),
    onSuccess: (updated) => queryClient.setQueryData(["trip", tripId], updated),
  });

  async function downloadPnr() {
    setDownloadingPnr(true);
    try {
      const blob = await api.download(`/trips/${tripId}/pnr.pdf`);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `jetelio-pnr-${tripId.slice(0, 8)}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
    } finally {
      setDownloadingPnr(false);
    }
  }

  if (isLoading) return <p className="text-fg/60">Loading…</p>;
  if (!trip) return <p className="text-danger">Trip not found.</p>;

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold">Trip {trip.id.slice(0, 8)}</h1>
          <StatusChip status={trip.status} />
          <StatusChip status={trip.overall_verdict} />
          <button
            type="button"
            onClick={downloadPnr}
            disabled={downloadingPnr}
            className="ml-auto h-9 rounded-md border border-accent/30 px-3 text-sm text-fg/70 transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
          >
            {downloadingPnr ? "Preparing…" : "Download PNR"}
          </button>
        </div>
        {trip.next_deadline && (
          <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
            Next deadline: {formatUtc(trip.next_deadline)}
          </div>
        )}
        {actionError && <p className="text-sm text-danger">{actionError}</p>}
        {writable && (
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm text-fg/60">Status:</label>
              <select
                value={trip.status}
                onChange={(e) => updateTrip.mutate({ version: trip.version, status: e.target.value })}
                className="h-9 rounded-md border border-fg/20 bg-transparent px-2 text-sm text-fg"
              >
                {TRIP_STATUSES.map((s) => (
                  <option key={s} value={s} className="bg-base">
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </header>

      <nav className="flex flex-wrap gap-2 border-b border-fg/10 pb-2">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`h-9 rounded-full px-3 text-sm ${tab === t ? "bg-primary text-fg" : "text-fg/60 hover:bg-fg/10"}`}
          >
            {t}
          </button>
        ))}
      </nav>

      {tab === "Overview" && (
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-3">
            <section className="space-y-3 rounded-lg border border-fg/10 p-4">
              <h2 className="text-sm font-semibold text-fg/70">Flight details</h2>
              <div className="grid gap-3">
                <div>
                  <div className="text-xs uppercase tracking-wide text-fg/50">Source</div>
                  <div className="text-sm text-fg">{formatTripSource(trip.source)}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-fg/50">Aircraft type</div>
                  <div className="mono-figures text-sm text-fg">{trip.legs[0]?.aircraft_icao_type ?? "—"}</div>
                </div>
                <EditableInfoField
                  label="Registration"
                  value={trip.aircraft_registration}
                  writable={writable}
                  mono
                  onSave={(v) => updateTrip.mutateAsync({ version: trip.version, aircraft_registration: v || null })}
                />
                <EditableInfoField
                  label="MTOW"
                  value={trip.entered_mtow_kg != null ? String(trip.entered_mtow_kg) : null}
                  writable={writable}
                  mono
                  type="number"
                  suffix="kg"
                  onSave={(v) => updateTrip.mutateAsync({ version: trip.version, entered_mtow_kg: v === "" ? null : Number(v) })}
                />
                <EditableInfoField
                  label="Serial number"
                  value={trip.serial_number}
                  writable={writable}
                  mono
                  onSave={(v) => updateTrip.mutateAsync({ version: trip.version, serial_number: v || null })}
                />
                <EditableInfoField
                  label="Colors"
                  value={trip.colors}
                  writable={writable}
                  onSave={(v) => updateTrip.mutateAsync({ version: trip.version, colors: v || null })}
                />
              </div>
            </section>

            <section className="space-y-3 rounded-lg border border-fg/10 p-4">
              <h2 className="text-sm font-semibold text-fg/70">Operator &amp; purpose</h2>
              <div className="grid gap-3">
                <EditableInfoField
                  label="Operator / airline"
                  value={trip.operator_airline_name}
                  writable={writable}
                  onSave={(v) => updateTrip.mutateAsync({ version: trip.version, operator_airline_name: v || null })}
                />
                <EditableInfoSelect
                  label="Ops type"
                  value={trip.ops_type ?? ""}
                  options={OPS_TYPE_OPTIONS}
                  writable={writable}
                  onSave={(v) => updateTrip.mutateAsync({ version: trip.version, ops_type: (v || null) as TripDetail["ops_type"] })}
                />
                <EditableInfoSelect
                  label="Flight purpose"
                  value={trip.flight_purpose ?? ""}
                  options={FLIGHT_PURPOSE_OPTIONS}
                  writable={writable}
                  onSave={(v) => updateTrip.mutateAsync({ version: trip.version, flight_purpose: (v || null) as TripDetail["flight_purpose"] })}
                />
                <EditableInfoField
                  label="Owner team"
                  value={trip.owner_team}
                  writable={writable}
                  placeholder="Unassigned"
                  onSave={(v) => updateTrip.mutateAsync({ version: trip.version, owner_team: v || null })}
                />
              </div>
            </section>

            <section className="space-y-3 rounded-lg border border-fg/10 p-4">
              <h2 className="text-sm font-semibold text-fg/70">Requester contact</h2>
              <div className="grid gap-3">
                <EditableInfoField
                  label="Requested by"
                  value={trip.requested_by_name}
                  writable={writable}
                  onSave={(v) => updateTrip.mutateAsync({ version: trip.version, requested_by_name: v || undefined })}
                />
                <EditableInfoField
                  label="Contact email"
                  value={trip.requested_by_email}
                  writable={writable}
                  onSave={(v) => updateTrip.mutateAsync({ version: trip.version, requested_by_email: v || undefined })}
                />
                <EditableInfoField
                  label="Contact phone"
                  value={trip.requested_by_phone}
                  writable={writable}
                  mono
                  onSave={(v) => updateTrip.mutateAsync({ version: trip.version, requested_by_phone: v || undefined })}
                />
                <div>
                  <div className="text-xs uppercase tracking-wide text-fg/50">On file since</div>
                  <div className="mono-figures text-sm text-fg">{formatUtc(trip.created_at)}</div>
                </div>
              </div>
            </section>
          </div>

          <section className="space-y-2 rounded-lg border border-fg/10 p-4">
            <h2 className="text-sm font-semibold text-fg/70">Notes</h2>
            <textarea
              value={notesDraft ?? trip.notes ?? ""}
              onChange={(e) => setNotesDraft(e.target.value)}
              disabled={!writable}
              rows={3}
              className="w-full rounded-md border border-fg/20 bg-transparent px-3 py-2 text-base text-fg disabled:opacity-60"
            />
            {writable && notesDraft !== null && notesDraft !== (trip.notes ?? "") && (
              <button
                type="button"
                onClick={() => {
                  updateTrip.mutate({ version: trip.version, notes: notesDraft });
                  setNotesDraft(null);
                }}
                className="h-9 rounded-md border border-fg/20 px-3 text-sm hover:border-fg/40"
              >
                Save notes
              </button>
            )}
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-fg/70">All legs for this trip</h2>
            <LegSummaryTable
              aircraftIcaoType={trip.legs[0]?.aircraft_icao_type ?? null}
              mtowKg={trip.entered_mtow_kg}
              rows={trip.legs.map((leg, i) => ({
                legIndex: i,
                depIcao: leg.result.dep_icao,
                fromDate: leg.reference_datetime,
                arrIcao: leg.result.arr_icao,
                toDate: leg.arrival_datetime,
                callSign: leg.call_sign,
                registration: leg.registration ?? trip.aircraft_registration,
                distanceNm: leg.result.route.distance_nm,
                eetHours: leg.result.route.eet_hours,
              }))}
            />
          </section>
        </div>
      )}

      {tab === "Route" && (
        <div className="space-y-4">
          {trip.legs.map((leg) =>
            editingLegId === leg.id && draftLeg ? (
              <section key={leg.id} className="space-y-3 rounded-lg border border-accent/40 p-4">
                <h2 className="font-semibold">Editing leg {leg.leg_index + 1}</h2>
                <LegEditor index={0} leg={draftLeg} onChange={setDraftLeg} onRemove={() => {}} canRemove={false} />
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={updateLeg.isPending}
                    onClick={() => updateLeg.mutate({ legId: leg.id, payload: draftLeg })}
                    className="h-11 rounded-md bg-primary px-4 text-sm font-semibold text-fg disabled:opacity-50"
                  >
                    {updateLeg.isPending ? "Saving…" : "Save leg"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingLegId(null);
                      setDraftLeg(null);
                    }}
                    className="h-11 rounded-md border border-fg/20 px-4 text-sm text-fg/70 hover:border-fg/40"
                  >
                    Cancel
                  </button>
                </div>
                {updateLeg.isError && (
                  <p className="text-sm text-danger">
                    {updateLeg.error instanceof ApiError ? "Could not save — check the leg's fields." : "Could not reach the API."}
                  </p>
                )}
              </section>
            ) : (
              <section key={leg.id} className="space-y-3 rounded-lg border border-fg/10 p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="font-semibold">
                    Leg {leg.leg_index + 1}: {leg.result.dep_icao} → {leg.result.arr_icao}
                  </h2>
                  <StatusChip status={leg.result.verdict} />
                  {leg.call_sign && <span className="mono-figures text-xs text-fg/50">Call sign: {leg.call_sign}</span>}
                  {leg.client && <span className="text-xs text-fg/50">Bill-to: {leg.client.bill_to_legal_name}</span>}
                  {writable && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingLegId(leg.id);
                        setDraftLeg(legDetailToInput(leg));
                        setAddingLeg(false);
                      }}
                      className="ml-auto h-9 rounded-md border border-fg/20 px-3 text-sm text-fg/70 hover:border-fg/40"
                    >
                      Edit
                    </button>
                  )}
                  {canDelete(role) && trip.legs.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeLeg.mutate(leg.id)}
                      className="h-9 rounded-md border border-danger/40 px-3 text-sm text-danger hover:border-danger"
                    >
                      Remove
                    </button>
                  )}
                </div>
                <p className="mono-figures text-xs text-fg/50">
                  {formatUtc(leg.result.reference_datetime)} → {formatUtc(leg.result.arrival_datetime)}
                </p>
                {leg.result.reasons.length > 0 && (
                  <ul className="space-y-1 rounded-md border border-fg/10 bg-fg/5 p-3 text-sm text-fg/80">
                    {leg.result.reasons.map((reason, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="text-fg/40">—</span>
                        <span>{reason}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <RoutePreviewPanel
                  depIcao={leg.result.dep_icao}
                  arrIcao={leg.result.arr_icao}
                  referenceDatetime={leg.reference_datetime}
                  avoidStates={leg.avoid_states}
                  includeStates={leg.include_states}
                  avoidFirs={leg.avoid_firs}
                  includeFirs={leg.include_firs}
                />
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <StatusChip status={leg.result.capability.planning_status} />
                  {leg.result.capability.exceeds !== null && (
                    <span className={leg.result.capability.exceeds ? "text-danger" : "text-fg/60"}>
                      {leg.result.capability.exceeds ? "Exceeds practical range" : "Within practical range"}
                    </span>
                  )}
                </div>
              </section>
            ),
          )}

          {writable && !addingLeg && (
            <button
              type="button"
              onClick={() => {
                const last = trip.legs[trip.legs.length - 1];
                setNewLeg(emptyLegInput(last?.result.arr_icao ?? ""));
                setAddingLeg(true);
                setEditingLegId(null);
              }}
              className="h-11 rounded-md border border-fg/20 px-4 text-sm text-fg/70 hover:border-fg/40"
            >
              Add leg
            </button>
          )}

          {addingLeg && newLeg && (
            <section className="space-y-3 rounded-lg border border-accent/40 p-4">
              <h2 className="font-semibold">New leg</h2>
              <LegEditor index={0} leg={newLeg} onChange={setNewLeg} onRemove={() => {}} canRemove={false} />
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={addLeg.isPending}
                  onClick={() => addLeg.mutate(newLeg)}
                  className="h-11 rounded-md bg-primary px-4 text-sm font-semibold text-fg disabled:opacity-50"
                >
                  {addLeg.isPending ? "Adding…" : "Add leg"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAddingLeg(false);
                    setNewLeg(null);
                  }}
                  className="h-11 rounded-md border border-fg/20 px-4 text-sm text-fg/70 hover:border-fg/40"
                >
                  Cancel
                </button>
              </div>
              {addLeg.isError && (
                <p className="text-sm text-danger">
                  {addLeg.error instanceof ApiError ? "Could not add — check the leg's fields." : "Could not reach the API."}
                </p>
              )}
            </section>
          )}
        </div>
      )}

      {tab === "Permits" &&
        trip.legs.map((leg) => (
          <section key={leg.id} className="space-y-3 rounded-lg border border-fg/10 p-4">
            <h2 className="font-semibold">
              Leg {leg.leg_index + 1}: {leg.result.dep_icao} → {leg.result.arr_icao}
            </h2>
            {leg.result.filed_route && (
              <p className="mono-figures rounded-md border border-fg/10 bg-fg/5 p-2 text-xs">
                Filed route: {leg.result.filed_route}
              </p>
            )}
            <div className="space-y-2">
              {leg.permit_assignments.map((p) => (
                <PermitRow
                  key={`${p.service_code}-${p.country_iso3}`}
                  tripId={tripId}
                  legId={leg.id}
                  permit={p}
                  writable={writable}
                  canDeleteAccess={canDelete(role)}
                  vendorNames={vendorNames}
                  updateServiceAssignment={updateServiceAssignment}
                  removeCustomService={removeCustomService}
                  sendServices={sendServices}
                />
              ))}
              <ul className="space-y-1 text-sm">
                {leg.result.permits.ground_handling_orders.map((g) => (
                  <li key={`gh-${g.country_iso3}`} className="flex items-center justify-between gap-2">
                    <span>Ground handling — {g.country_name}</span>
                    <StatusChip status={g.deadline.deadline_status} />
                  </li>
                ))}
              </ul>
              {leg.permit_assignments.length === 0 && leg.result.permits.ground_handling_orders.length === 0 && (
                <p className="text-sm text-fg/50">No permits required.</p>
              )}
            </div>
            {/* task #124 — permits are now auto-committed to a viable
                alternate route the moment one exists, so this warning only
                ever fires when no viable alternate was found (a real
                NOT_FEASIBLE case). A successful auto-reroute gets a
                separate, non-warning info block below instead. */}
            {(leg.result.permits.state_avoid_include.violated || leg.result.permits.fir_avoid_include.violated) && (
              <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
                {leg.result.permits.state_avoid_include.avoided_transited.length > 0 && (
                  <p>Avoided state(s) transited: {leg.result.permits.state_avoid_include.avoided_transited.join(", ")}</p>
                )}
                {leg.result.permits.state_avoid_include.required_missed.length > 0 && (
                  <p>Required state(s) not transited: {leg.result.permits.state_avoid_include.required_missed.join(", ")}</p>
                )}
                {leg.result.permits.fir_avoid_include.avoided_transited.length > 0 && (
                  <p>Avoided FIR(s) transited: {leg.result.permits.fir_avoid_include.avoided_transited.join(", ")}</p>
                )}
                {leg.result.permits.fir_avoid_include.required_missed.length > 0 && (
                  <p>Required FIR(s) not transited: {leg.result.permits.fir_avoid_include.required_missed.join(", ")}</p>
                )}
                <p className="mt-1 text-fg/70">No viable alternate route found.</p>
              </div>
            )}
            {leg.result.reroute?.found && (
              <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm text-fg/70">
                Route automatically adjusted to satisfy avoid/include constraints — adds ~
                {leg.result.reroute.extra_distance_nm?.toFixed(0)} NM
                {leg.result.reroute.extra_time_hours && ` (+${leg.result.reroute.extra_time_hours.toFixed(1)} h)`} vs. the
                direct track. Permits above already reflect the route actually flown.
              </div>
            )}
          </section>
        ))}

      {tab === "Services" &&
        trip.legs.map((leg) => (
          <section key={leg.id} className="space-y-3 rounded-lg border border-fg/10 p-4">
            <h2 className="font-semibold">
              Leg {leg.leg_index + 1}: {leg.result.dep_icao} → {leg.result.arr_icao}
            </h2>

            <ServiceAssignmentsSection
              tripId={tripId}
              leg={leg}
              writable={writable}
              canDeleteAccess={canDelete(role)}
              catalogueByCode={catalogueByCode}
              subServicesByParentCode={subServicesByParentCode}
              vendorNames={vendorNames}
              updateServiceAssignment={updateServiceAssignment}
              addCustomService={addCustomService}
              removeCustomService={removeCustomService}
              sendServices={sendServices}
            />

            <div className="border-t border-fg/10 pt-3">
              <h3 className="mb-2 text-sm font-semibold text-fg/70">Navigation fees — client quote/estimate</h3>
              {leg.nav_fees ? (
                <div className="space-y-2">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-fg/50">
                          <th className="pb-1 pr-2">FIR</th>
                          <th className="pb-1 pr-2">Provider</th>
                          <th className="pb-1 pr-2">Distance (NM)</th>
                          <th className="pb-1 pr-2">Fee (USD)</th>
                          <th className="pb-1">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {leg.nav_fees.items.map((i) => (
                          <tr key={i.fir_code} className="border-t border-fg/5">
                            <td className="mono-figures py-1 pr-2">{i.fir_name ?? i.fir_code}</td>
                            <td className="py-1 pr-2">{i.provider_name ?? "—"}</td>
                            <td className="mono-figures py-1 pr-2">
                              {i.chargeable_distance_nm !== null ? i.chargeable_distance_nm.toFixed(0) : "—"}
                            </td>
                            <td className="mono-figures py-1 pr-2">
                              {i.fee_usd !== null ? `$${i.fee_usd.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "—"}
                            </td>
                            <td className="py-1">
                              <StatusChip status={i.status} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {leg.nav_fees.fully_priced && leg.nav_fees.total_usd !== null ? (
                    <div className="mono-figures flex flex-wrap gap-4 text-sm text-fg/70">
                      <span>Subtotal: ${leg.nav_fees.subtotal_usd!.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                      <span>
                        Margin ({leg.nav_fees.margin_percent}%): ${leg.nav_fees.margin_usd!.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </span>
                      <span className="font-semibold text-fg">
                        Total: ${leg.nav_fees.total_usd.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  ) : (
                    <p className="text-sm text-warning">
                      Quote incomplete — add a navigation fee provider rate for every FIR marked "{leg.nav_fees.items.find((i) => i.fee_usd === null)?.status}" above before sharing this estimate with a client.
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-fg/50">
                  Nav fees not computed — aircraft MTOW is unknown for this type. Verify aircraft performance data to enable.
                </p>
              )}
            </div>

            <div className="border-t border-fg/10 pt-3">
              <h3 className="mb-2 text-sm font-semibold text-fg/70">Permit &amp; CAA fees — client quote/estimate</h3>
              {leg.permit_fees ? (
                <div className="space-y-2">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-fg/50">
                          <th className="pb-1 pr-2">Country</th>
                          <th className="pb-1 pr-2">Permit type</th>
                          <th className="pb-1 pr-2">CAA fee</th>
                          <th className="pb-1 pr-2">nafisat</th>
                          <th className="pb-1 pr-2">JTL</th>
                          <th className="pb-1">Line total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {leg.permit_fees.items.map((i, idx) => (
                          <tr key={`${i.country_iso3}-${i.permit_type}-${idx}`} className="border-t border-fg/5">
                            <td className="py-1 pr-2">{i.country_name}</td>
                            <td className="py-1 pr-2">{i.permit_type.replace(/_/g, " ")}</td>
                            <td className="mono-figures py-1 pr-2">
                              {i.caa_fee_usd !== null ? (
                                `$${i.caa_fee_usd.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                              ) : (
                                <StatusChip status={i.caa_status} />
                              )}
                            </td>
                            <td className="mono-figures py-1 pr-2">
                              {i.nafisat_fee_usd !== null ? (
                                `$${i.nafisat_fee_usd.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                              ) : (
                                <StatusChip status={i.nafisat_status} />
                              )}
                            </td>
                            <td className="mono-figures py-1 pr-2">${i.jtl_fee_usd.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                            <td className="mono-figures py-1">
                              {i.line_total_usd !== null ? `$${i.line_total_usd.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {leg.permit_fees.fully_priced && leg.permit_fees.total_usd !== null ? (
                    <div className="mono-figures flex flex-wrap gap-4 text-sm text-fg/70">
                      <span>CAA: ${leg.permit_fees.caa_subtotal_usd!.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                      <span>nafisat: ${leg.permit_fees.nafisat_subtotal_usd!.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                      <span>JTL: ${leg.permit_fees.jtl_subtotal_usd.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                      <span className="font-semibold text-fg">
                        Total: ${leg.permit_fees.total_usd.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  ) : (
                    <p className="text-sm text-warning">
                      Quote incomplete — add a CAA/nafisat fee provider rate for every line item above marked "NO PROVIDER CONFIGURED - RATE NEEDED" before sharing this estimate with a client.
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-fg/50">
                  Permit fees not computed — aircraft MTOW is unknown for this type. Verify aircraft performance data to enable.
                </p>
              )}
            </div>
          </section>
        ))}

      {tab === "Crew & Pax" &&
        trip.legs.map((leg) => (
          <section key={leg.id} className="space-y-3 rounded-lg border border-fg/10 p-4">
            <h2 className="font-semibold">
              Leg {leg.leg_index + 1}: {leg.result.dep_icao} → {leg.result.arr_icao}
            </h2>
            <ul className="space-y-1 text-sm">
              {leg.result.credentials.persons.map((p) => (
                <li key={p.person_id} className="flex items-center justify-between gap-2">
                  <span>
                    {p.role} — <CountryName iso3={p.nationality_iso3} />
                  </span>
                  <span className="text-fg/60">{p.visa_requirement.replace(/_/g, " ")}</span>
                </li>
              ))}
              {leg.result.credentials.persons.length === 0 && <p className="text-fg/50">No crew/pax recorded.</p>}
            </ul>
            <p className="text-xs text-fg/50">
              Souls on board: {leg.result.credentials.souls_on_board_total}
              {leg.result.credentials.souls_on_board_exceeds_max_pax && <span className="ml-1 text-danger">exceeds max pax</span>}
            </p>
          </section>
        ))}

      {NOT_BUILT_TABS[tab] && (
        <section className="rounded-lg border border-fg/10 p-8 text-center text-sm text-fg/50">{NOT_BUILT_TABS[tab]}</section>
      )}
    </div>
  );
}

// --- Services tab (task #105) ---
// Groups a leg's service_assignments (StatusChip per line, resolved
// vendor/channel via task #86, an expandable message thread via task #102,
// a "Format & send" per line via task #104, multi-select "Send selected",
// and an "Add sub-service" control for the manually-added extras task #105
// introduced). Sub-services (catalogue SUB-SERVICE rows) are shown grouped
// under their parent's code purely for the "Add" picker's context — the
// engine never generates them as auto line items (see Prompt.md §4.17/§9),
// so grouping only ever applies to manually-added ones.

type UpdateServiceAssignmentMutation = UseMutationResult<
  TripDetail,
  Error,
  { legId: string; serviceCode: string; icao: string; payload: ServiceAssignmentRequest }
>;
type AddCustomServiceMutation = UseMutationResult<TripDetail, Error, { legId: string; payload: CustomServiceAssignmentRequest }>;
type RemoveCustomServiceMutation = UseMutationResult<TripDetail, Error, { legId: string; serviceCode: string; icao: string }>;
type SendServicesMutation = UseMutationResult<
  SendServiceRequestOut[],
  Error,
  { legId: string; items: { service_code: string; icao: string }[] }
>;

interface ServiceAssignmentsSectionProps {
  tripId: string;
  leg: TripDetail["legs"][number];
  writable: boolean;
  canDeleteAccess: boolean;
  catalogueByCode: Record<string, ServiceCatalogueEntry>;
  subServicesByParentCode: Record<string, ServiceCatalogueEntry[]>;
  vendorNames: Record<string, string>;
  updateServiceAssignment: UpdateServiceAssignmentMutation;
  addCustomService: AddCustomServiceMutation;
  removeCustomService: RemoveCustomServiceMutation;
  sendServices: SendServicesMutation;
}

function ServiceAssignmentsSection({
  tripId,
  leg,
  writable,
  canDeleteAccess,
  catalogueByCode,
  subServicesByParentCode,
  vendorNames,
  updateServiceAssignment,
  addCustomService,
  removeCustomService,
  sendServices,
}: ServiceAssignmentsSectionProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [addingService, setAddingService] = useState(false);
  const [newServiceCode, setNewServiceCode] = useState("");
  const [newServiceIcao, setNewServiceIcao] = useState(leg.result.dep_icao);

  function toggleSelected(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const allSubServices = Object.values(subServicesByParentCode).flat();

  return (
    <div className="space-y-2">
      <div className="space-y-2">
        {leg.service_assignments.map((s) => {
          const key = `${s.service_code}:${s.icao}`;
          return (
            <ServiceRow
              key={key}
              tripId={tripId}
              legId={leg.id}
              assignment={s}
              writable={writable}
              canDeleteAccess={canDeleteAccess}
              vendorNames={vendorNames}
              selected={selected.has(key)}
              onToggleSelected={() => toggleSelected(key)}
              updateServiceAssignment={updateServiceAssignment}
              removeCustomService={removeCustomService}
              sendServices={sendServices}
            />
          );
        })}
        {leg.service_assignments.length === 0 && <p className="text-sm text-fg/50">No ground services required.</p>}
      </div>

      {writable && (
        <div className="flex flex-wrap items-center gap-2 border-t border-fg/10 pt-2">
          <button
            type="button"
            disabled={selected.size === 0 || sendServices.isPending}
            onClick={() =>
              sendServices.mutate({
                legId: leg.id,
                items: Array.from(selected).map((key) => {
                  const [service_code, icao] = key.split(":");
                  return { service_code, icao };
                }),
              })
            }
            className="h-9 rounded-md bg-primary px-3 text-sm font-semibold text-fg disabled:opacity-50"
          >
            {sendServices.isPending ? "Sending…" : `Send selected (${selected.size})`}
          </button>
          <button
            type="button"
            onClick={() => setAddingService((v) => !v)}
            className="h-9 rounded-md border border-fg/20 px-3 text-sm text-fg/70 hover:border-fg/40"
          >
            {addingService ? "Cancel" : "Add sub-service"}
          </button>
        </div>
      )}

      {addingService && (
        <div className="flex flex-wrap items-end gap-2 rounded-md border border-fg/10 bg-fg/5 p-3">
          <div>
            <label className="mb-1 block text-xs text-fg/60">Service</label>
            <select
              value={newServiceCode}
              onChange={(e) => setNewServiceCode(e.target.value)}
              className="h-9 min-w-[16rem] rounded-md border border-fg/20 bg-transparent px-2 text-sm text-fg"
            >
              <option value="" className="bg-base">
                Select a service…
              </option>
              {allSubServices.map((c) => (
                <option key={c.id} value={c.code} className="bg-base">
                  {c.name} ({c.code})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-fg/60">Airport</label>
            <select
              value={newServiceIcao}
              onChange={(e) => setNewServiceIcao(e.target.value)}
              className="h-9 rounded-md border border-fg/20 bg-transparent px-2 text-sm text-fg"
            >
              <option value={leg.result.dep_icao} className="bg-base">
                {leg.result.dep_icao} (departure)
              </option>
              <option value={leg.result.arr_icao} className="bg-base">
                {leg.result.arr_icao} (arrival)
              </option>
            </select>
          </div>
          <button
            type="button"
            disabled={!newServiceCode || addCustomService.isPending}
            onClick={() =>
              addCustomService.mutate(
                { legId: leg.id, payload: { service_code: newServiceCode, icao: newServiceIcao } },
                { onSuccess: () => setAddingService(false) },
              )
            }
            className="h-9 rounded-md bg-primary px-3 text-sm font-semibold text-fg disabled:opacity-50"
          >
            {addCustomService.isPending ? "Adding…" : "Add"}
          </button>
          {addCustomService.isError && (
            <p className="w-full text-sm text-danger">
              {addCustomService.error instanceof ApiError ? "Could not add — already on this leg or invalid." : "Could not reach the API."}
            </p>
          )}
        </div>
      )}
      {/* catalogueByCode is currently only used by ServiceRow for display-name
          fallback when service_name is absent from the assignment itself. */}
      {Object.keys(catalogueByCode).length === 0 && null}
    </div>
  );
}

function ServiceRow({
  tripId,
  legId,
  assignment,
  writable,
  canDeleteAccess,
  vendorNames,
  selected,
  onToggleSelected,
  showCheckbox = true,
  updateServiceAssignment,
  removeCustomService,
  sendServices,
}: {
  tripId: string;
  legId: string;
  assignment: ServiceAssignment;
  writable: boolean;
  canDeleteAccess: boolean;
  vendorNames: Record<string, string>;
  selected: boolean;
  onToggleSelected: () => void;
  showCheckbox?: boolean;
  updateServiceAssignment: UpdateServiceAssignmentMutation;
  removeCustomService: RemoveCustomServiceMutation;
  sendServices: SendServicesMutation;
}) {
  const [threadOpen, setThreadOpen] = useState(false);

  // country_iso3 is only meaningful when assignment.icao is really a
  // 3-letter country code (task #115 permits) — passed unconditionally
  // here since a 4-letter GROUND icao can never match a
  // VendorCoverageCountry row anyway (always exactly 3 letters), so this
  // is a no-op fallback for every existing GROUND caller.
  const { data: resolved } = useQuery({
    queryKey: ["service-delivery-resolve", legId, assignment.service_code, assignment.icao],
    queryFn: () =>
      api.get<ServiceDeliveryResolved>(
        `/service-delivery-configs/resolve?leg_id=${legId}&service_code=${assignment.service_code}&country_iso3=${assignment.icao}`,
      ),
  });
  const resolvedVendorId = resolved?.config?.vendor_id ?? resolved?.fallback_vendor_id ?? null;
  const vendorName = resolvedVendorId ? vendorNames[resolvedVendorId] ?? resolvedVendorId : null;

  const sendResult = sendServices.data?.find((r) => r.service_code === assignment.service_code && r.icao === assignment.icao);

  return (
    <div className="rounded-md border border-fg/10 p-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {writable && showCheckbox && <input type="checkbox" checked={selected} onChange={onToggleSelected} className="h-4 w-4 accent-primary" />}
        <span className="mono-figures w-16">{assignment.icao}</span>
        <span className="flex-1">
          {assignment.service_name ?? assignment.service_code}
          {assignment.manual && <span className="ml-1 text-xs text-fg/40">(added)</span>}
        </span>
        <StatusChip status={assignment.status} />
        {vendorName && <span className="text-xs text-fg/50">via {vendorName}{resolved?.matched_scope ? ` (${resolved.matched_scope})` : ""}</span>}
        {assignment.confirmation_number && <span className="mono-figures text-xs text-fg/50">#{assignment.confirmation_number}</span>}

        <select
          value={assignment.provider ?? ""}
          disabled={!writable}
          onChange={(e) =>
            updateServiceAssignment.mutate({
              legId,
              serviceCode: assignment.service_code,
              icao: assignment.icao,
              payload: {
                provider: e.target.value,
                vendor_id: assignment.vendor_id ?? undefined,
                notes: assignment.notes ?? undefined,
                status: assignment.status,
                confirmation_number: assignment.confirmation_number ?? undefined,
              },
            })
          }
          className="h-8 rounded-md border border-fg/20 bg-transparent px-2 text-xs text-fg disabled:opacity-60"
        >
          <option value="" className="bg-base">Unassigned</option>
          <option value="JETELIO" className="bg-base">Jetelio</option>
          <option value="OWN" className="bg-base">Own</option>
          <option value="THIRD_PARTY" className="bg-base">Third party</option>
        </select>

        {writable && (
          <button
            type="button"
            disabled={sendServices.isPending}
            onClick={() => sendServices.mutate({ legId, items: [{ service_code: assignment.service_code, icao: assignment.icao }] })}
            className="h-8 rounded-md border border-accent/40 px-2 text-xs text-accent hover:border-accent disabled:opacity-50"
          >
            Format &amp; send
          </button>
        )}
        <button
          type="button"
          onClick={() => setThreadOpen((v) => !v)}
          className="h-8 rounded-md border border-fg/20 px-2 text-xs text-fg/70 hover:border-fg/40"
        >
          {threadOpen ? "Hide messages" : "Messages"}
        </button>
        {writable && assignment.manual && (
          <button
            type="button"
            onClick={() => removeCustomService.mutate({ legId, serviceCode: assignment.service_code, icao: assignment.icao })}
            className="h-8 rounded-md border border-danger/40 px-2 text-xs text-danger hover:border-danger"
          >
            Remove
          </button>
        )}
      </div>

      {sendResult && !sendResult.sent && <p className="mt-1 text-xs text-danger">{sendResult.error}</p>}

      {threadOpen && (
        <div className="mt-2 border-t border-fg/10 pt-2">
          <MessageThread
            tripId={tripId}
            legId={legId}
            serviceCode={assignment.service_code}
            icao={assignment.icao}
            writable={writable}
            canDeleteAccess={canDeleteAccess}
          />
        </div>
      )}
    </div>
  );
}

// --- Permits tab (task #115) ---
// Overflight/landing permits reuse ServiceRow's status/vendor/send/message
// machinery wholesale (same service_assignments column, same send/message
// endpoints — see backend/app/services/trip_service.py's
// _permit_assignments_out and Prompt.md's writeup for why country_iso3
// fills the icao slot for these). PermitRow just adapts a PermitAssignment
// into a ServiceAssignment-shaped object and adds the deadline-ladder
// header ServiceRow doesn't know about; the checkbox/batch-select bar
// stays Services-tab-only (hidden here via showCheckbox={false}).
function PermitRow({
  tripId,
  legId,
  permit,
  writable,
  canDeleteAccess,
  vendorNames,
  updateServiceAssignment,
  removeCustomService,
  sendServices,
}: {
  tripId: string;
  legId: string;
  permit: PermitAssignment;
  writable: boolean;
  canDeleteAccess: boolean;
  vendorNames: Record<string, string>;
  updateServiceAssignment: UpdateServiceAssignmentMutation;
  removeCustomService: RemoveCustomServiceMutation;
  sendServices: SendServicesMutation;
}) {
  const assignment: ServiceAssignment = {
    service_code: permit.service_code,
    icao: permit.country_iso3,
    service_name: `${permit.country_name} — ${permit.service_code === "OVF" ? "Overflight" : "Landing"} permit`,
    provider: permit.provider,
    vendor_id: permit.vendor_id,
    notes: permit.notes,
    status: permit.status,
    confirmation_number: permit.confirmation_number,
    granted_at: permit.granted_at,
    valid_until: permit.valid_until,
    manual: false,
  };

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-fg/50">
        <span className="mono-figures">
          {formatUtc(permit.entry_datetime)}
          {permit.service_code === "OVF" ? ` → ${formatUtc(permit.exit_datetime)}` : ""}
        </span>
        <StatusChip status={permit.deadline.deadline_status} />
      </div>
      <ServiceRow
        tripId={tripId}
        legId={legId}
        assignment={assignment}
        writable={writable}
        canDeleteAccess={canDeleteAccess}
        vendorNames={vendorNames}
        selected={false}
        onToggleSelected={() => {}}
        showCheckbox={false}
        updateServiceAssignment={updateServiceAssignment}
        removeCustomService={removeCustomService}
        sendServices={sendServices}
      />
    </div>
  );
}

function MessageThread({
  tripId,
  legId,
  serviceCode,
  icao,
  writable,
  canDeleteAccess,
}: {
  tripId: string;
  legId: string;
  serviceCode: string;
  icao: string;
  writable: boolean;
  canDeleteAccess: boolean;
}) {
  const queryClient = useQueryClient();
  const [noteDraft, setNoteDraft] = useState("");
  const queryKey = ["service-messages", tripId, legId, serviceCode, icao];
  const messagesUrl = `/trips/${tripId}/legs/${legId}/services/${serviceCode}/${icao}/messages`;

  const { data: messages, isLoading } = useQuery({
    queryKey,
    queryFn: () => api.get<ServiceMessage[]>(messagesUrl),
  });

  const addNote = useMutation({
    mutationFn: (payload: ServiceMessageCreateRequest) => api.post<ServiceMessage>(messagesUrl, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      setNoteDraft("");
    },
  });

  const deleteMessage = useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) => api.del<void>(`${messagesUrl}/${id}?version=${version}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  return (
    <div className="space-y-2 text-xs">
      {isLoading && <p className="text-fg/50">Loading messages…</p>}
      {messages && messages.length === 0 && <p className="text-fg/50">No messages yet.</p>}
      {messages && messages.length > 0 && (
        <ul className="space-y-1.5">
          {messages.map((m) => (
            <li key={m.id} className="rounded border border-fg/10 p-2">
              <div className="flex flex-wrap items-center gap-2 text-fg/50">
                <StatusChip status={m.direction} />
                {m.channel && <span>{m.channel}</span>}
                <span>{m.sent_by_name ?? "—"}</span>
                <span className="ml-auto mono-figures">{formatUtc(m.created_at)}</span>
                {canDeleteAccess && (
                  <button type="button" onClick={() => deleteMessage.mutate({ id: m.id, version: m.version })} className="text-danger hover:underline">
                    Delete
                  </button>
                )}
              </div>
              {m.subject && <div className="mt-1 font-medium text-fg">{m.subject}</div>}
              <div className="mt-1 whitespace-pre-wrap text-fg/80">{m.body}</div>
            </li>
          ))}
        </ul>
      )}
      {writable && (
        <div className="flex gap-2">
          <input
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            placeholder="Manual status update, e.g. 'Permit will be ready in 72hrs'"
            className="h-8 flex-1 rounded-md border border-fg/20 bg-transparent px-2 text-xs text-fg"
          />
          <button
            type="button"
            disabled={!noteDraft.trim() || addNote.isPending}
            onClick={() => addNote.mutate({ direction: "MANUAL_NOTE", body: noteDraft.trim() })}
            className="h-8 rounded-md border border-fg/20 px-2 text-xs text-fg/70 hover:border-fg/40 disabled:opacity-50"
          >
            Add note
          </button>
        </div>
      )}
    </div>
  );
}
