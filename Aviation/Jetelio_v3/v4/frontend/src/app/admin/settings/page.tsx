"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUp, ArrowDown } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import type { Setting } from "@/lib/types";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { getCurrentUserRole, canDelete } from "@/lib/jwt";

// Chat-provider control panel (task #132) — the four wired trip-builder
// chat providers (app/core/chat/dispatcher.py) are driven entirely by
// named settings (app/core/settings_registry.py), editable at runtime by
// SUPER ADMIN with no deploy. This page is a focused editor for exactly
// those settings — priority order, per-provider suspend, per-provider
// timeout, shared concurrency cap — not a generic editor for every named
// setting in the registry (out of scope for what was asked).
const PROVIDERS = ["ollama", "deepseek", "anthropic", "openai"] as const;
type ProviderName = (typeof PROVIDERS)[number];

const PROVIDER_LABELS: Record<ProviderName, string> = {
  ollama: "Ollama (self-hosted)",
  deepseek: "DeepSeek",
  anthropic: "Anthropic",
  openai: "OpenAI",
};

function parseCsvOrder(value: string | undefined): ProviderName[] {
  const listed = (value ?? "")
    .split(",")
    .map((p) => p.trim().toLowerCase())
    .filter((p): p is ProviderName => (PROVIDERS as readonly string[]).includes(p));
  const rest = PROVIDERS.filter((p) => !listed.includes(p));
  return [...listed, ...rest];
}

function parseCsvSet(value: string | undefined): Set<ProviderName> {
  return new Set(
    (value ?? "")
      .split(",")
      .map((p) => p.trim().toLowerCase())
      .filter((p): p is ProviderName => (PROVIDERS as readonly string[]).includes(p)),
  );
}

export default function ChatProviderSettingsPage() {
  useRequireAuth();
  const role = getCurrentUserRole();
  const writable = canDelete(role); // matches the backend's require_admin gate on PATCH /settings/{key}
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery({
    queryKey: ["settings"],
    queryFn: () => api.get<Setting[]>("/settings"),
  });
  const byKey = Object.fromEntries((settings ?? []).map((s) => [s.key, s]));

  const [order, setOrder] = useState<ProviderName[] | null>(null);
  const [suspended, setSuspended] = useState<Set<ProviderName> | null>(null);
  const [timeouts, setTimeouts] = useState<Record<ProviderName, string> | null>(null);
  const [maxConcurrent, setMaxConcurrent] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Seed local editable state once settings arrive — never re-syncs on
  // every refetch afterward, so an in-progress edit isn't clobbered by
  // background refetches (same pattern as other pages' EditableText).
  useEffect(() => {
    if (!settings || order !== null) return;
    setOrder(parseCsvOrder(byKey["chat_provider_priority"]?.value));
    setSuspended(parseCsvSet(byKey["chat_provider_suspended"]?.value));
    setTimeouts({
      ollama: byKey["chat_timeout_ollama_seconds"]?.value ?? "120",
      deepseek: byKey["chat_timeout_deepseek_seconds"]?.value ?? "30",
      anthropic: byKey["chat_timeout_anthropic_seconds"]?.value ?? "30",
      openai: byKey["chat_timeout_openai_seconds"]?.value ?? "30",
    });
    setMaxConcurrent(byKey["chat_provider_max_concurrent"]?.value ?? "2");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  const patchSetting = useMutation({
    mutationFn: ({ key, value, version }: { key: string; value: string; version: number }) =>
      api.patch<Setting>(`/settings/${key}`, { value, version }),
  });

  function move(name: ProviderName, direction: -1 | 1) {
    if (!order) return;
    const idx = order.indexOf(name);
    const next = idx + direction;
    if (next < 0 || next >= order.length) return;
    const reordered = [...order];
    [reordered[idx], reordered[next]] = [reordered[next], reordered[idx]];
    setOrder(reordered);
  }

  function toggleSuspended(name: ProviderName) {
    if (!suspended) return;
    const next = new Set(suspended);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    setSuspended(next);
  }

  async function handleSave() {
    if (!order || !suspended || !timeouts || maxConcurrent === null) return;
    setSaveError(null);
    setSaved(false);
    try {
      const updates: { key: string; value: string }[] = [
        { key: "chat_provider_priority", value: order.join(",") },
        { key: "chat_provider_suspended", value: Array.from(suspended).join(",") },
        { key: "chat_provider_max_concurrent", value: maxConcurrent },
        ...PROVIDERS.map((name) => ({ key: `chat_timeout_${name}_seconds`, value: timeouts[name] })),
      ];
      for (const { key, value } of updates) {
        const current = byKey[key];
        if (!current || current.value === value) continue; // no-op, skip a needless version bump
        await patchSetting.mutateAsync({ key, value, version: current.version });
      }
      await queryClient.invalidateQueries({ queryKey: ["settings"] });
      setSaved(true);
    } catch (err) {
      setSaveError(
        err instanceof ApiError
          ? "Save failed — someone else may have changed a setting since this page loaded. Reload and try again."
          : "Could not reach the API.",
      );
    }
  }

  if (isLoading || !order || !suspended || !timeouts || maxConcurrent === null) {
    return <p className="text-fg/60">Loading…</p>;
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold">Chat providers</h1>
        <p className="text-sm text-fg/60">
          Trip-builder chat tries these providers in order, skipping any suspended, unconfigured, or currently at their
          concurrency limit, and falls through to the next on failure.
        </p>
        {!writable && <p className="mt-1 text-sm text-warning">Read-only — SUPER_ADMIN can edit these.</p>}
      </header>

      <section className="space-y-3 rounded-lg border border-fg/10 p-4">
        <h2 className="text-sm font-semibold text-fg/70">Priority &amp; availability</h2>
        <div className="space-y-2">
          {order.map((name, i) => (
            <div key={name} className="flex flex-wrap items-center gap-3 rounded-md border border-fg/10 p-3">
              <span className="mono-figures w-6 text-sm text-fg/50">{i + 1}</span>
              <span className="min-w-[10rem] flex-1 text-sm font-medium">{PROVIDER_LABELS[name]}</span>

              {writable && (
                <div className="flex gap-1">
                  <button
                    type="button"
                    disabled={i === 0}
                    onClick={() => move(name, -1)}
                    className="flex h-8 w-8 items-center justify-center rounded-md border border-fg/20 text-fg/70 hover:border-fg/40 disabled:opacity-30"
                    aria-label={`Move ${name} up`}
                  >
                    <ArrowUp className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    disabled={i === order.length - 1}
                    onClick={() => move(name, 1)}
                    className="flex h-8 w-8 items-center justify-center rounded-md border border-fg/20 text-fg/70 hover:border-fg/40 disabled:opacity-30"
                    aria-label={`Move ${name} down`}
                  >
                    <ArrowDown className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              )}

              <label className="flex items-center gap-2 text-sm text-fg/70">
                <input
                  type="checkbox"
                  checked={suspended.has(name)}
                  disabled={!writable}
                  onChange={() => toggleSuspended(name)}
                  className="h-4 w-4 accent-danger"
                />
                Suspended
              </label>

              <label className="flex items-center gap-2 text-sm text-fg/70">
                Timeout
                <input
                  type="number"
                  min={1}
                  value={timeouts[name]}
                  disabled={!writable}
                  onChange={(e) => setTimeouts({ ...timeouts, [name]: e.target.value })}
                  className="mono-figures h-8 w-20 rounded-md border border-fg/20 bg-transparent px-2 text-sm text-fg disabled:opacity-60"
                />
                s
              </label>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 border-t border-fg/10 pt-3 text-sm text-fg/70">
          <label className="flex items-center gap-2">
            Max concurrent requests per provider
            <input
              type="number"
              min={1}
              value={maxConcurrent}
              disabled={!writable}
              onChange={(e) => setMaxConcurrent(e.target.value)}
              className="mono-figures h-8 w-16 rounded-md border border-fg/20 bg-transparent px-2 text-sm text-fg disabled:opacity-60"
            />
          </label>
        </div>

        {writable && (
          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              disabled={patchSetting.isPending}
              onClick={handleSave}
              className="h-10 rounded-md bg-primary px-4 text-sm font-semibold text-fg disabled:opacity-50"
            >
              {patchSetting.isPending ? "Saving…" : "Save changes"}
            </button>
            {saved && <span className="text-sm text-fg/60">Saved.</span>}
            {saveError && <span className="text-sm text-danger">{saveError}</span>}
          </div>
        )}
      </section>
    </div>
  );
}
