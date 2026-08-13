"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { PartyDetail, PartyRoleCreateRequest } from "@/lib/types";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { getCurrentUserRole, canWrite, canDelete } from "@/lib/jwt";
import { EditableInfoField } from "@/components/EditableCell";
import { DocumentsPanel } from "@/components/DocumentsPanel";

// Only AGENT/WALK_IN are addable here — OPERATOR/CLIENT/VENDOR roles link
// to a real existing Operator/Client/Vendor row (party_roles.operator_id
// etc, exactly one of the three, per app/schemas/party.py's validation),
// and this app has no Operator/Client/Vendor picker component yet to
// support that safely; existing roles of any type still display below.
const ADDABLE_ROLES = ["AGENT", "WALK_IN"] as const;

export default function PartyDetailPage() {
  useRequireAuth();
  const params = useParams<{ id: string }>();
  const partyId = params.id;
  const queryClient = useQueryClient();
  const role = getCurrentUserRole();
  const writable = canWrite(role);
  const allowDelete = canDelete(role);
  const [addingRole, setAddingRole] = useState(false);
  const [newRoleType, setNewRoleType] = useState<(typeof ADDABLE_ROLES)[number]>("AGENT");

  const { data: party, isLoading } = useQuery({
    queryKey: ["party", partyId],
    queryFn: () => api.get<PartyDetail>(`/parties/${partyId}`),
  });

  const update = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.patch<PartyDetail>(`/parties/${partyId}`, payload),
    onSuccess: (updated) => queryClient.setQueryData(["party", partyId], updated),
  });

  const addRole = useMutation({
    mutationFn: () => {
      const payload: PartyRoleCreateRequest = { party_id: partyId, role: newRoleType };
      return api.post(`/party-roles`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["party", partyId] });
      setAddingRole(false);
    },
  });

  function saveField(field: string, value: unknown) {
    if (!party) return Promise.resolve();
    return update.mutateAsync({ version: party.version, [field]: value });
  }

  if (isLoading) return <p className="text-fg/60">Loading…</p>;
  if (!party) return <p className="text-danger">Party not found.</p>;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/parties" className="text-sm text-fg/50 hover:text-fg/80">
          ← Parties
        </Link>
      </div>
      <h1 className="text-xl font-semibold">{party.name}</h1>

      <section className="grid gap-4 rounded-lg border border-fg/10 p-4 sm:grid-cols-2 lg:grid-cols-3">
        <EditableInfoField label="Name" value={party.name} writable={writable} onSave={(v) => saveField("name", v)} />
        <EditableInfoField label="Legal name" value={party.legal_name} writable={writable} onSave={(v) => saveField("legal_name", v || null)} />
        <EditableInfoField
          label="Country (ISO3)"
          value={party.country_iso3}
          writable={writable}
          onSave={(v) => saveField("country_iso3", v.toUpperCase() || null)}
          mono
        />
        <EditableInfoField label="Address" value={party.address} writable={writable} onSave={(v) => saveField("address", v || null)} />
        <EditableInfoField label="Contact name" value={party.contact_name} writable={writable} onSave={(v) => saveField("contact_name", v || null)} />
        <EditableInfoField label="Contact email" value={party.contact_email} writable={writable} onSave={(v) => saveField("contact_email", v || null)} />
        <EditableInfoField label="Contact phone" value={party.contact_phone} writable={writable} onSave={(v) => saveField("contact_phone", v || null)} />
        <EditableInfoField label="Notes" value={party.notes} writable={writable} onSave={(v) => saveField("notes", v || null)} />
      </section>

      <section className="rounded-lg border border-fg/10 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-fg/70">Roles</h2>
          {writable && (
            <button
              type="button"
              onClick={() => setAddingRole((v) => !v)}
              className="h-8 rounded-md border border-fg/20 px-2.5 text-xs text-fg/70 hover:border-fg/40"
            >
              {addingRole ? "Cancel" : "Add role"}
            </button>
          )}
        </div>
        {addingRole && (
          <div className="mb-3 flex flex-wrap items-end gap-2 rounded-md border border-fg/10 bg-fg/5 p-3">
            <div>
              <label className="mb-1 block text-xs text-fg/60">Role</label>
              <select
                value={newRoleType}
                onChange={(e) => setNewRoleType(e.target.value as (typeof ADDABLE_ROLES)[number])}
                className="h-9 rounded-md border border-fg/20 bg-transparent px-2 text-sm text-fg"
              >
                {ADDABLE_ROLES.map((r) => (
                  <option key={r} value={r} className="bg-base">
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              disabled={addRole.isPending}
              onClick={() => addRole.mutate()}
              className="h-9 rounded-md bg-primary px-3 text-sm font-semibold text-fg disabled:opacity-50"
            >
              {addRole.isPending ? "Adding…" : "Add"}
            </button>
          </div>
        )}
        {party.roles.length === 0 ? (
          <p className="text-sm text-fg/50">No roles linked.</p>
        ) : (
          <ul className="divide-y divide-fg/10 text-sm">
            {party.roles.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 py-2">
                <span className="font-medium">{r.role}</span>
                <span className="text-fg/60">{r.linked_name ?? "—"}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-fg/10 p-4">
        <h2 className="mb-3 text-sm font-semibold text-fg/70">Documents</h2>
        <DocumentsPanel entityType="PARTY" entityId={partyId} writable={writable} canDelete={allowDelete} />
      </section>
    </div>
  );
}
