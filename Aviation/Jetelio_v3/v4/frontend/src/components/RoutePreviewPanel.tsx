"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { formatUtc } from "@/lib/format";
import type { RoutePreview } from "@/lib/types";
import { RouteMap } from "@/components/RouteMap";

interface Props {
  depIcao: string;
  arrIcao: string;
  /** ISO departure date/time — when given, arrival is computed as
   * departure + EET and displayed alongside distance/EET. */
  referenceDatetime?: string;
  /** Fires whenever a fresh eet_hours is available for this dep/arr pair —
   * lets a parent (LegEditor's time-driver toggle) live-sync the other
   * date field without duplicating this query. */
  onEetHours?: (eetHours: number) => void;
  // Split so callers can render the distance/EET/states text inline (where
  // the leg is being edited) while the map graphic itself is collected into
  // one section below everything else on the page — see LegEditor (stats
  // only) vs. the per-page "Route maps" section (map only) that consumes
  // these same dep/arr pairs.
  showStats?: boolean;
  showMap?: boolean;
}

export function RoutePreviewPanel({ depIcao, arrIcao, referenceDatetime, onEetHours, showStats = true, showMap = true }: Props) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["route-preview", depIcao, arrIcao],
    queryFn: () =>
      api.get<RoutePreview>(`/feasibility/route-preview?dep_icao=${encodeURIComponent(depIcao)}&arr_icao=${encodeURIComponent(arrIcao)}`),
    enabled: Boolean(depIcao && arrIcao),
  });

  useEffect(() => {
    if (data) onEetHours?.(data.eet_hours);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  if (!depIcao || !arrIcao) return null;
  if (isLoading) return <p className="text-xs text-fg/50">Loading route preview…</p>;
  if (isError || !data) return <p className="text-xs text-fg/50">Route preview unavailable for this pairing.</p>;

  const departure = referenceDatetime ? new Date(referenceDatetime) : null;
  const arrival = departure && !Number.isNaN(departure.getTime()) ? new Date(departure.getTime() + data.eet_hours * 3600_000) : null;

  return (
    <div className="space-y-2 rounded-md border border-fg/10 p-3">
      {showStats && (
        <>
          <div className="mono-figures flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg/60">
            <span>Distance: {data.distance_nm.toFixed(0)} NM</span>
            <span>EET: {data.eet_hours.toFixed(1)} h</span>
            <span>States: {data.states.map((s) => s.name).join(", ") || "—"}</span>
            {data.firs.length > 0 && <span>FIRs: {data.firs.map((f) => f.name ?? f.icao_fir_code).join(", ")}</span>}
          </div>
          {departure && arrival && (
            <div className="mono-figures flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg/60">
              <span>Departure: {formatUtc(departure.toISOString())}</span>
              <span>Arrival: {formatUtc(arrival.toISOString())}</span>
            </div>
          )}
        </>
      )}
      {showMap && <RouteMap tracks={[data.track_points]} stateGeometry={data.state_geometry} firGeometry={data.fir_geometry} />}
    </div>
  );
}
