"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Page, Party, PartyCreateRequest } from "@/lib/types";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { getCurrentUserRole, canWrite } from "@/lib/jwt";
import { matchesQuery } from "@/lib/search";
import { DataTable } from "@/components/DataTable";
import { SearchInput } from "@/components/SearchInput";

function emptyDraft(): PartyCreateRequest {
  return { name: "" };
}

export default function PartiesPage() {
  useRequireAuth();
  const writable = canWrite(getCurrentUserRole());
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<PartyCreateRequest>(emptyDraft());

  const { data, isLoading } = useQuery({
    queryKey: ["parties"],
    queryFn: () => api.get<Page<Party>>("/parties?page_size=500"),
  });

  const create = useMutation({
    mutationFn: (payload: PartyCreateRequest) => api.post<Party>("/parties", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["parties"] });
      setAdding(false);
      setDraft(emptyDraft());
    },
  });

  const rows = data?.items.filter((r) => matchesQuery(search, r.name, r.legal_name, r.contact_name)) ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Parties</h1>
        {writable && (
          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            className="h-9 rounded-md border border-fg/20 px-3 text-sm text-fg/70 hover:border-fg/40"
          >
            {adding ? "Cancel" : "Add party"}
          </button>
        )}
      </div>

      {adding && (
        <div className="flex flex-wrap items-end gap-2 rounded-md border border-fg/10 bg-fg/5 p-3">
          <div>
            <label className="mb-1 block text-xs text-fg/60">Name</label>
            <input
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              className="h-9 w-56 rounded-md border border-fg/20 bg-transparent px-2 text-sm text-fg"
            />
          </div>
          <button
            type="button"
            disabled={!draft.name.trim() || create.isPending}
            onClick={() => create.mutate(draft)}
            className="h-9 rounded-md bg-primary px-3 text-sm font-semibold text-fg disabled:opacity-50"
          >
            {create.isPending ? "Creating…" : "Create"}
          </button>
        </div>
      )}

      <SearchInput value={search} onChange={setSearch} placeholder="Search parties…" />
      {isLoading && <p className="text-fg/60">Loading…</p>}
      {data && (
        <DataTable
          rowKey={(r) => r.id}
          rows={rows}
          columns={[
            {
              header: "Name",
              render: (r) => (
                <Link href={`/admin/parties/${r.id}`} className="hover:text-primary">
                  {r.name}
                </Link>
              ),
            },
            { header: "Legal name", priority: 2, render: (r) => r.legal_name ?? "—" },
            { header: "Country", priority: 3, render: (r) => r.country_iso3 ?? "—" },
            { header: "Contact", priority: 2, render: (r) => r.contact_name ?? "—" },
          ]}
        />
      )}
    </div>
  );
}
