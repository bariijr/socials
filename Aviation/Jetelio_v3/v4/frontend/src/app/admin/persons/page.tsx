"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Page, Person, PersonCreateRequest, PersonRoleHint } from "@/lib/types";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { getCurrentUserRole, canWrite } from "@/lib/jwt";
import { matchesQuery } from "@/lib/search";
import { DataTable } from "@/components/DataTable";
import { SearchInput } from "@/components/SearchInput";

const ROLE_HINTS: PersonRoleHint[] = ["CREW", "PAX", "BOTH"];

function emptyDraft(): PersonCreateRequest {
  return { full_name: "", role_hint: "BOTH", nationality_iso3: null };
}

export default function PersonsPage() {
  useRequireAuth();
  const writable = canWrite(getCurrentUserRole());
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<PersonCreateRequest>(emptyDraft());

  const { data, isLoading } = useQuery({
    queryKey: ["persons"],
    queryFn: () => api.get<Page<Person>>("/persons?page_size=500"),
  });

  const create = useMutation({
    mutationFn: (payload: PersonCreateRequest) => api.post<Person>("/persons", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["persons"] });
      setAdding(false);
      setDraft(emptyDraft());
    },
  });

  const rows = data?.items.filter((r) => matchesQuery(search, r.full_name, r.email, r.passport_number)) ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Persons</h1>
        {writable && (
          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            className="h-9 rounded-md border border-fg/20 px-3 text-sm text-fg/70 hover:border-fg/40"
          >
            {adding ? "Cancel" : "Add person"}
          </button>
        )}
      </div>

      {adding && (
        <div className="flex flex-wrap items-end gap-2 rounded-md border border-fg/10 bg-fg/5 p-3">
          <div>
            <label className="mb-1 block text-xs text-fg/60">Full name</label>
            <input
              value={draft.full_name}
              onChange={(e) => setDraft((d) => ({ ...d, full_name: e.target.value }))}
              className="h-9 w-56 rounded-md border border-fg/20 bg-transparent px-2 text-sm text-fg"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-fg/60">Role</label>
            <select
              value={draft.role_hint}
              onChange={(e) => setDraft((d) => ({ ...d, role_hint: e.target.value as PersonRoleHint }))}
              className="h-9 rounded-md border border-fg/20 bg-transparent px-2 text-sm text-fg"
            >
              {ROLE_HINTS.map((r) => (
                <option key={r} value={r} className="bg-base">
                  {r}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            disabled={!draft.full_name.trim() || create.isPending}
            onClick={() => create.mutate(draft)}
            className="h-9 rounded-md bg-primary px-3 text-sm font-semibold text-fg disabled:opacity-50"
          >
            {create.isPending ? "Creating…" : "Create"}
          </button>
        </div>
      )}

      <SearchInput value={search} onChange={setSearch} placeholder="Search persons…" />
      {isLoading && <p className="text-fg/60">Loading…</p>}
      {data && (
        <DataTable
          rowKey={(r) => r.id}
          rows={rows}
          columns={[
            {
              header: "Name",
              render: (r) => (
                <Link href={`/admin/persons/${r.id}`} className="hover:text-primary">
                  {r.full_name}
                </Link>
              ),
            },
            { header: "Role", priority: 2, render: (r) => r.role_hint },
            { header: "Nationality", priority: 2, render: (r) => r.nationality_iso3 ?? "—" },
            { header: "Passport", priority: 3, render: (r) => (r.passport_number ? <span className="mono-figures">{r.passport_number}</span> : "—") },
            { header: "Email", priority: 3, render: (r) => r.email ?? "—" },
          ]}
        />
      )}
    </div>
  );
}
