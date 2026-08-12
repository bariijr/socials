"use client";

import type { PersonPublicInput } from "@/lib/types";
import { CountryPicker } from "@/components/CountryPicker";

interface Props {
  persons: PersonPublicInput[];
  onChange: (persons: PersonPublicInput[]) => void;
}

export function PersonsEditor({ persons, onChange }: Props) {
  function updatePerson(index: number, patch: Partial<PersonPublicInput>) {
    onChange(persons.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  }

  function addPerson() {
    onChange([...persons, { role: "PAX", nationality_iso3: "" }]);
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
              onChange={(e) => updatePerson(i, { role: e.target.value as PersonPublicInput["role"] })}
              className="h-11 rounded-md border border-fg/20 bg-transparent px-3 text-base text-fg"
            >
              <optgroup label="Crew" className="bg-base">
                <option value="PIC" className="bg-base">Pilot in Command</option>
                <option value="FO" className="bg-base">First Officer</option>
                <option value="FA" className="bg-base">Flight Attendant</option>
                <option value="MECHANIC" className="bg-base">Mechanic</option>
                <option value="ENGINEER" className="bg-base">Engineer</option>
                <option value="CREW" className="bg-base">Crew (other)</option>
              </optgroup>
              <optgroup label="Passengers" className="bg-base">
                <option value="PAX" className="bg-base">Pax</option>
                <option value="VIP" className="bg-base">VIP</option>
                <option value="PRINCIPAL" className="bg-base">Principal</option>
                <option value="OTHER" className="bg-base">Other</option>
              </optgroup>
            </select>
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
