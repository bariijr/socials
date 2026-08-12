"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { PilotExitReport, ReadinessRow } from "@/lib/types";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { StatusChip } from "@/components/StatusChip";
import { ReadinessTable } from "@/components/ReadinessTable";

export default function AdminDashboardPage() {
  useRequireAuth();
  const gates = useQuery({
    queryKey: ["pilot-exit-gates"],
    queryFn: () => api.get<PilotExitReport>("/readiness/pilot-exit-gates"),
  });
  const readiness = useQuery({
    queryKey: ["data-readiness"],
    queryFn: () => api.get<ReadinessRow[]>("/readiness/data-readiness"),
  });

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-2xl font-bold">Jetelio V3 — Admin</h1>
        <p className="text-fg/60">Reference-data readiness</p>
      </header>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Pilot-exit gates</h2>
        {gates.data && (
          <div className="mb-3 flex items-center gap-3">
            <StatusChip status={gates.data.verdict} />
            <span className="text-sm text-fg/60">
              {gates.data.blocked_gate_count} of {gates.data.total_gate_count} blocked · allow_unverified_for_planning ={" "}
              {String(gates.data.allow_unverified_for_planning)}
            </span>
          </div>
        )}
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {gates.data?.gates.map((g) => (
            <div key={g.key} className="rounded-lg border border-fg/10 bg-surface p-3">
              <div className="mb-1 text-sm font-medium">{g.label}</div>
              <div className="mb-2 mono-figures text-xs text-fg/50">
                {g.verified} / {g.required}
              </div>
              <StatusChip status={g.status} />
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Data readiness</h2>
        {readiness.data && <ReadinessTable rows={readiness.data} />}
      </section>
    </div>
  );
}
