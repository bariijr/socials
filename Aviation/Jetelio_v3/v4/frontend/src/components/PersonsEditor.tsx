"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { PersonPublicInput, PersonRoleDefinition } from "@/lib/types";
import { CountryPicker } from "@/components/CountryPicker";

interface Props {
  persons: PersonPublicInput[];
  onChange: (persons: PersonPublicInput[]) => void;
}

export function PersonsEditor({ persons, onChange }: Props) {
  // Task #120 — self-contained fetch, same pattern as AircraftTypePicker/
  // CountryPicker (this component is used on both the public Viability IQ
  // form and the admin Trip Manager, and the public page has no other
  // page-level query to piggyback on). Public endpoint
  // (/feasibility/person-roles), not the admin-authenticated CRUD router.
  const { data: roles } = useQuery({
    queryKey: ["person-roles"],
    queryFn: () => api.get<PersonRoleDefinition[]>("/feasibility/person-roles"),
  });
  const crewRoles = (roles ?? []).filter((r) => r.is_crew);
  const paxRoles = (roles ?? []).filter((r) => !r.is_crew);

  function updatePerson(index: number, patch: Partial<PersonPublicInput>) {
    onChange(persons.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  }

  function addPerson() {
    onChange([...persons, { role: paxRoles[0]?.code ?? "PAX", nationality_iso3: "" }]);
  }

  function removePerson(index: number) {
    onChange(persons.filter((_, i) => i !== index));
  }

  return (
    <div>
      <label className="mb-1 block text-sm text-fg/60">Crew &amp; pax (role + nationality — no passport details)</label>
      <div className="space-y-2">
        {persons.map((p, i) => (
          <div key={i} className="flex items-center gap-2">
            <select
              value={p.role}
              onChange={(e) => updatePerson(i, { role: e.target.value })}
              className="h-11 rounded-md border border-fg/20 bg-transparent px-3 text-base text-fg"
            >
              <optgroup label="Crew" className="bg-base">
                {crewRoles.map((r) => (
                  <option key={r.code} value={r.code} className="bg-base">
                    {r.label}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Passengers" className="bg-base">
                {paxRoles.map((r) => (
                  <option key={r.code} value={r.code} className="bg-base">
                    {r.label}
                  </option>
                ))}
              </optgroup>
            </select>
            <input
              type="text"
              value={p.name ?? ""}
              onChange={(e) => updatePerson(i, { name: e.target.value || null })}
              placeholder="Name (optional)"
              className="h-11 w-40 rounded-md border border-fg/20 bg-transparent px-3 text-sm text-fg"
            />
            <div className="w-56">
              <CountryPicker
                value={p.nationality_iso3}
                onChange={(iso3) => updatePerson(i, { nationality_iso3: iso3 })}
                placeholder="Nationality"
              />
            </div>
            <button
              type="button"
              onClick={() => removePerson(i)}
              className="h-11 shrink-0 rounded-md border border-fg/20 px-3 text-sm text-fg/60 hover:border-danger hover:text-danger"
              aria-label={`Remove person ${i + 1}`}
            >
              Remove
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={addPerson}
        className="mt-2 h-11 rounded-md border border-fg/20 px-3 text-sm text-fg/70 hover:border-fg/40"
      >
        Add person
      </button>
    </div>
  );
}
