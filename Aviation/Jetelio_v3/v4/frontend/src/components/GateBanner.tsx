"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { PilotExitReport } from "@/lib/types";

export function GateBanner() {
  const { data } = useQuery({
    queryKey: ["pilot-exit-gates"],
    queryFn: () => api.get<PilotExitReport>("/readiness/pilot-exit-gates"),
    refetchInterval: 60_000,
  });

  if (!data || data.verdict === "LIVE") return null;

  return (
    <div className="sticky top-0 z-50 border-b border-warning/40 bg-warning/10 px-4 py-2 text-sm text-warning">
      <span className="font-semibold uppercase tracking-wide">PILOT MODE</span>{" "}
      — {data.blocked_gate_count} of {data.total_gate_count} pilot-exit gates blocked. All planning output is
      ADVISORY.
    </div>
  );
}
