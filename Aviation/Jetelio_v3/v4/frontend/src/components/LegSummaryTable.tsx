import { DataTable } from "@/components/DataTable";
import { formatUtc } from "@/lib/format";

export interface LegSummaryRow {
  legIndex: number;
  depIcao: string;
  fromDate: string;
  arrIcao: string;
  toDate: string;
  callSign: string | null;
  registration: string | null;
  distanceNm: number;
  eetHours: number;
}

// At-a-glance multi-leg overview shown above the detailed per-leg cards —
// aircraft type/MTOW have no per-leg override in the data model, so they're
// shown once as trip-level values; registration, call sign, and the
// from/to ICAO+date pairs are genuinely per-leg.
export function LegSummaryTable({
  aircraftIcaoType,
  mtowKg,
  rows,
}: {
  aircraftIcaoType: string | null;
  mtowKg: number | null;
  rows: LegSummaryRow[];
}) {
  return (
    <div className="space-y-2 rounded-lg border border-fg/10 p-4">
      <div className="mono-figures flex flex-wrap gap-x-6 gap-y-1 text-sm text-fg/70">
        {aircraftIcaoType && <span>Type: {aircraftIcaoType}</span>}
        {mtowKg != null && <span>MTOW: {mtowKg.toLocaleString()} kg</span>}
      </div>
      <DataTable
        rowKey={(r) => String(r.legIndex)}
        rows={rows}
        columns={[
          { header: "Leg", render: (r) => r.legIndex + 1 },
          { header: "From", render: (r) => <span className="mono-figures">{r.depIcao}</span> },
          { header: "From date", priority: 2, render: (r) => <span className="mono-figures">{formatUtc(r.fromDate)}</span> },
          { header: "To", render: (r) => <span className="mono-figures">{r.arrIcao}</span> },
          { header: "To date", priority: 2, render: (r) => <span className="mono-figures">{formatUtc(r.toDate)}</span> },
          { header: "Call sign", priority: 3, render: (r) => <span className="mono-figures">{r.callSign ?? "—"}</span> },
          { header: "Reg.", priority: 3, render: (r) => <span className="mono-figures">{r.registration ?? "—"}</span> },
          { header: "EET (h)", render: (r) => <span className="mono-figures">{r.eetHours.toFixed(1)}</span> },
          { header: "Dist (NM)", render: (r) => <span className="mono-figures">{r.distanceNm.toFixed(0)}</span> },
        ]}
      />
    </div>
  );
}
