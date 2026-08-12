"use client";

import { useEffect, useRef, useState } from "react";

interface SelectOption {
  value: string;
  label: string;
}

interface BaseProps {
  writable: boolean;
}

// Click-to-edit text/number cell. Not writable -> plain read-only text.
// Writable -> click turns it into an input; Enter/blur commits (PATCH via
// onSave), Escape reverts without saving.
export function EditableText({
  value,
  onSave,
  writable,
  placeholder,
  mono,
  type = "text",
}: BaseProps & {
  value: string;
  onSave: (next: string) => Promise<unknown>;
  placeholder?: string;
  mono?: boolean;
  type?: "text" | "number";
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);
  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  async function commit() {
    if (draft === value) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(draft);
    } finally {
      setSaving(false);
      setEditing(false);
    }
  }

  const monoCls = mono ? "mono-figures" : "";

  if (!writable) {
    return <span className={monoCls}>{value || <span className="text-fg/30">—</span>}</span>;
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className={`-mx-1 w-full rounded px-1 py-0.5 text-left hover:bg-fg/10 ${monoCls}`}
      >
        {value || <span className="text-fg/30">{placeholder ?? "—"}</span>}
      </button>
    );
  }

  return (
    <input
      ref={ref}
      type={type}
      value={draft}
      disabled={saving}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        }
        if (e.key === "Escape") {
          setDraft(value);
          setEditing(false);
        }
      }}
      className={`h-8 w-full rounded-md border border-primary/50 bg-transparent px-2 text-sm text-fg disabled:opacity-50 ${monoCls}`}
    />
  );
}

// Dropdown that commits immediately on change — no separate edit mode needed
// since a <select> is already a click-to-open control.
export function EditableSelect({
  value,
  options,
  onSave,
  writable,
}: BaseProps & {
  value: string;
  options: SelectOption[];
  onSave: (next: string) => Promise<unknown>;
}) {
  const [saving, setSaving] = useState(false);

  if (!writable) {
    return <span>{options.find((o) => o.value === value)?.label ?? value}</span>;
  }

  return (
    <select
      value={value}
      disabled={saving}
      onChange={async (e) => {
        setSaving(true);
        try {
          await onSave(e.target.value);
        } finally {
          setSaving(false);
        }
      }}
      className="h-8 rounded-md border border-fg/20 bg-transparent px-1 text-sm text-fg disabled:opacity-50"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value} className="bg-base">
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function EditableCheckbox({
  value,
  onSave,
  writable,
}: BaseProps & {
  value: boolean;
  onSave: (next: boolean) => Promise<unknown>;
}) {
  const [saving, setSaving] = useState(false);

  if (!writable) {
    return <span>{value ? "Yes" : "No"}</span>;
  }

  return (
    <input
      type="checkbox"
      checked={value}
      disabled={saving}
      onChange={async (e) => {
        setSaving(true);
        try {
          await onSave(e.target.checked);
        } finally {
          setSaving(false);
        }
      }}
      className="h-4 w-4 accent-primary disabled:opacity-50"
    />
  );
}

// --- Detail-page label+value layout helpers ---
// Shared across every "/<entity>/[id]" detail page (task #100 — inline edit
// moved off list pages onto these). Originally defined locally inside
// operators/[id]/page.tsx; hoisted here once a second/third/fourth detail
// page needed the exact same label-over-value grid cell.

export function InfoField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-fg/50">{label}</div>
      <div className="text-sm text-fg">{value || <span className="text-fg/30">—</span>}</div>
    </div>
  );
}

export function EditableInfoField({
  label,
  value,
  writable,
  onSave,
  mono,
  suffix,
  placeholder,
  type,
}: {
  label: string;
  value: string | null;
  writable: boolean;
  onSave: (v: string) => Promise<unknown>;
  mono?: boolean;
  suffix?: string;
  placeholder?: string;
  type?: "text" | "number";
}) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-fg/50">{label}</div>
      <div className="text-sm text-fg">
        <EditableText value={value ?? ""} writable={writable} onSave={onSave} mono={mono} placeholder={placeholder} type={type} />
        {suffix && value && <span className="ml-1 text-fg/50">{suffix}</span>}
      </div>
    </div>
  );
}

export function EditableInfoCheckbox({
  label,
  value,
  writable,
  onSave,
}: {
  label: string;
  value: boolean;
  writable: boolean;
  onSave: (v: boolean) => Promise<unknown>;
}) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-fg/50">{label}</div>
      <div className="text-sm text-fg">
        <EditableCheckbox value={value} writable={writable} onSave={onSave} />
      </div>
    </div>
  );
}

export function EditableInfoSelect({
  label,
  value,
  options,
  writable,
  onSave,
}: {
  label: string;
  value: string;
  options: SelectOption[];
  writable: boolean;
  onSave: (v: string) => Promise<unknown>;
}) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-fg/50">{label}</div>
      <div className="text-sm text-fg">
        <EditableSelect value={value} options={options} writable={writable} onSave={onSave} />
      </div>
    </div>
  );
}
