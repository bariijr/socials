import type { ReadinessRow } from "@/lib/types";

export function ReadinessTable({ rows }: { rows: ReadinessRow[] }) {
  return (
    <div className="space-y-2">
      {rows.map((row) => {
        const pct = Math.min(100, Math.max(0, row.percent_complete));
        return (
          <div key={row.dataset} className="rounded-lg border border-fg/10 p-3">
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="font-medium">{row.dataset}</span>
              <span className="mono-figures text-fg/60">
                {row.populated} / {row.total} ({pct.toFixed(2)}%)
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-fg/10">
              <div
                className={"h-full " + (pct >= 100 ? "bg-success" : pct > 0 ? "bg-warning" : "bg-danger")}
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="mt-1 text-xs text-fg/50">
              [{row.criticality}] blocks: {row.blocks}
            </div>
          </div>
        );
      })}
    </div>
  );
}
