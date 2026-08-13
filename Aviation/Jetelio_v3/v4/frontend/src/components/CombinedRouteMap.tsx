"use client";

import { useQueries } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { GeoJsonGeometry, RoutePreview } from "@/lib/types";
import { RouteMap, type Track } from "@/components/RouteMap";

interface LegPair {
  depIcao: string;
  arrIcao: string;
  avoidStates?: string[];
  includeStates?: string[];
  avoidFirs?: string[];
  includeFirs?: string[];
}

interface Props {
  legs: LegPair[];
}

function buildQuery(l: LegPair) {
  const params = new URLSearchParams();
  params.set("dep_icao", l.depIcao);
  params.set("arr_icao", l.arrIcao);
  for (const s of l.avoidStates ?? []) params.append("avoid_states", s);
  for (const s of l.includeStates ?? []) params.append("include_states", s);
  for (const f of l.avoidFirs ?? []) params.append("avoid_firs", f);
  for (const f of l.includeFirs ?? []) params.append("include_firs", f);
  return params.toString();
}

// Task #114: one shared map for the whole trip instead of a separate small
// "Route map" section stacked under every leg — fetches each leg's
// /feasibility/route-preview independently (same query key/cache as
// RoutePreviewPanel, so nothing re-fetches that a leg's own panel already
// warmed) and merges them client-side into one RouteMap viewport.
export function CombinedRouteMap({ legs }: Props) {
  const validLegs = legs.filter((l) => l.depIcao && l.arrIcao);

  const results = useQueries({
    queries: validLegs.map((l) => ({
      queryKey: ["route-preview", l.depIcao, l.arrIcao, l.avoidStates ?? [], l.includeStates ?? [], l.avoidFirs ?? [], l.includeFirs ?? []],
      queryFn: () => api.get<RoutePreview>(`/feasibility/route-preview?${buildQuery(l)}`),
      enabled: Boolean(l.depIcao && l.arrIcao),
    })),
  });

  if (validLegs.length === 0) return null;
  if (results.some((r) => r.isLoading)) return <p className="text-xs text-fg/50">Loading route preview…</p>;

  const loaded = results.map((r) => r.data).filter((d): d is RoutePreview => Boolean(d));
  if (loaded.length === 0) return <p className="text-xs text-fg/50">Route preview unavailable.</p>;

  // A country/FIR crossed by more than one leg (a return trip, a shared
  // overflight state) should only be drawn once — dedupe by code across
  // every leg's geometry rather than layering identical polygons N times.
  const stateGeometry: Record<string, GeoJsonGeometry> = {};
  const firGeometry: Record<string, GeoJsonGeometry> = {};
  for (const preview of loaded) {
    Object.assign(stateGeometry, preview.state_geometry);
    Object.assign(firGeometry, preview.fir_geometry);
  }

  const label = (i: number) => (loaded.length > 1 ? String(i + 1) : undefined);
  const tracks: Track[] = loaded.flatMap((p, i) => {
    if (!p.avoid_include_violated) return [{ points: p.track_points, label: label(i) }];
    const violated: Track = { points: p.track_points, variant: p.reroute?.found ? "violated" : "primary", label: label(i) };
    if (!p.reroute?.found) return [violated];
    return [violated, { points: p.reroute.track_points, variant: "alternate" }];
  });

  return <RouteMap tracks={tracks} stateGeometry={stateGeometry} firGeometry={firGeometry} />;
}
