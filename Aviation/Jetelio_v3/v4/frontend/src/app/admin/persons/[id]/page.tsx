"use client";

import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Person, PersonRoleHint } from "@/lib/types";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { getCurrentUserRole, canWrite, canDelete } from "@/lib/jwt";
import { EditableInfoField, EditableInfoSelect } from "@/components/EditableCell";
import { DocumentsPanel } from "@/components/DocumentsPanel";
import { Breadcrumb } from "@/components/Breadcrumb";

const ROLE_HINT_OPTIONS = [
  { value: "CREW", label: "Crew" },
  { value: "PAX", label: "Passenger" },
  { value: "BOTH", label: "Both" },
];

export default function PersonDetailPage() {
  useRequireAuth();
  const params = useParams<{ id: string }>();
  const personId = params.id;
  const queryClient = useQueryClient();
  const role = getCurrentUserRole();
  const writable = canWrite(role);
  const allowDelete = canDelete(role);

  const { data: person, isLoading } = useQuery({
    queryKey: ["person", personId],
    queryFn: () => api.get<Person>(`/persons/${personId}`),
  });

  const update = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.patch<Person>(`/persons/${personId}`, payload),
    onSuccess: (updated) => queryClient.setQueryData(["person", personId], updated),
  });

  function saveField(field: string, value: unknown) {
    if (!person) return Promise.resolve();
    return update.mutateAsync({ version: person.version, [field]: value });
  }

  if (isLoading) return <p className="text-fg/60">Loading…</p>;
  if (!person) return <p className="text-danger">Person not found.</p>;

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: "Persons", href: "/admin/persons" }, { label: person.full_name }]} />
      <h1 className="text-xl font-semibold">{person.full_name}</h1>

      <section className="grid gap-4 rounded-lg border border-fg/10 p-4 sm:grid-cols-2 lg:grid-cols-3">
        <EditableInfoField label="Full name" value={person.full_name} writable={writable} onSave={(v) => saveField("full_name", v)} />
        <EditableInfoSelect
          label="Role"
          value={person.role_hint}
          options={ROLE_HINT_OPTIONS}
          writable={writable}
          onSave={(v) => saveField("role_hint", v as PersonRoleHint)}
        />
        <EditableInfoField
          label="Nationality (ISO3)"
          value={person.nationality_iso3}
          writable={writable}
          onSave={(v) => saveField("nationality_iso3", v.toUpperCase() || null)}
          mono
        />
        <EditableInfoField
          label="Date of birth"
          value={person.date_of_birth}
          writable={writable}
          onSave={(v) => saveField("date_of_birth", v || null)}
          type="text"
          placeholder="YYYY-MM-DD"
        />
        <EditableInfoField
          label="Email"
          value={person.email}
          writable={writable}
          type="email"
          autoComplete="email"
          onSave={(v) => saveField("email", v || null)}
        />
        <EditableInfoField
          label="Phone"
          value={person.phone}
          writable={writable}
          type="tel"
          autoComplete="tel"
          onSave={(v) => saveField("phone", v || null)}
        />
        <EditableInfoField
          label="Passport number"
          value={person.passport_number}
          writable={writable}
          onSave={(v) => saveField("passport_number", v || null)}
          mono
        />
        <EditableInfoField
          label="Passport expiry"
          value={person.passport_expiry}
          writable={writable}
          onSave={(v) => saveField("passport_expiry", v || null)}
          placeholder="YYYY-MM-DD"
        />
        <EditableInfoField label="Notes" value={person.notes} writable={writable} onSave={(v) => saveField("notes", v || null)} />
      </section>

      <section className="rounded-lg border border-fg/10 p-4">
        <h2 className="mb-3 text-sm font-semibold text-fg/70">Documents</h2>
        <DocumentsPanel entityType="PERSON" entityId={personId} writable={writable} canDelete={allowDelete} />
      </section>
    </div>
  );
}
