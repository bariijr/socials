"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { GeoJsonGeometry, WorldOutline } from "@/lib/types";

/** "primary" = the flown/planned track (default). "violated" = a direct
 * track that actually crosses an avoided state/FIR — drawn dashed/danger so
 * it reads as "don't fly this". "alternate" = the real reroute that avoids
 * it — drawn solid/success alongside the violated one so the map visibly
 * changes trajectory instead of only reporting a distance delta. */
export type TrackVariant = "primary" | "violated" | "alternate";

export interface Track {
  points: [number, number][];
  variant?: TrackVariant;
  label?: string;
}

interface Props {
  // A single-leg caller (e.g. RoutePreviewPanel) just passes a length-1
  // array. Task #114: the public VIQ page overlays every leg of a
  // multi-leg trip in one shared viewport instead of stacking a separate
  // small map per leg. Plain [lat, lon][] arrays are also accepted for
  // backward compatibility and are treated as "primary".
  tracks: (Track | [number, number][])[];
  stateGeometry: Record<string, GeoJsonGeometry>;
  firGeometry: Record<string, GeoJsonGeometry>;
}

function normalizeTrack(t: Track | [number, number][]): Track {
  return Array.isArray(t) ? { points: t, variant: "primary" } : t;
}

const TRACK_STYLES: Record<TrackVariant, { stroke: string; dash?: string }> = {
  primary: { stroke: "stroke-fg" },
  violated: { stroke: "stroke-danger/70", dash: "6 3" },
  alternate: { stroke: "stroke-success" },
};

const WIDTH = 760;
const HEIGHT = 290;
// A whole-world view (execujet.com/locations-style overview, not a
// zoomed-to-route detail map) — fixed bounds, never a dynamic bounding
// box. Latitude cropped to where business-jet trips in this system's
// domain (Africa/ME/Europe/India, per Prompt.md) actually happen; this
// excludes most of Antarctica and the high Arctic rather than wasting
// half the canvas on ice no route in this app will ever touch.
const LON_MIN = -180;
const LON_MAX = 180;
const LAT_MIN = -58;
const LAT_MAX = 78;

type Ring = [number, number][]; // [lon, lat] pairs, GeoJSON order

function polygonRings(geom: GeoJsonGeometry): Ring[] {
  if (geom.type === "Polygon") {
    return geom.coordinates as Ring[];
  }
  // MultiPolygon.coordinates: Polygon[] where each Polygon is Ring[] —
  // one flatten merges every polygon's rings into a single list.
  return (geom.coordinates as Ring[][]).flat();
}

function project(lat: number, lon: number): [number, number] {
  const x = ((lon - LON_MIN) / (LON_MAX - LON_MIN)) * WIDTH;
  const y = HEIGHT - ((lat - LAT_MIN) / (LAT_MAX - LAT_MIN)) * HEIGHT;
  return [x, y];
}

function ringToPath(ring: Ring): string {
  return (
    ring
      .map(([lon, lat], i) => {
        const [x, y] = project(lat, lon);
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ") + " Z"
  );
}

function geomToPath(geom: GeoJsonGeometry): string {
  return polygonRings(geom).map(ringToPath).join(" ");
}

function trackToPath(trackPoints: [number, number][]): string {
  return trackPoints
    .map(([lat, lon], i) => {
      const [x, y] = project(lat, lon);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

/** Plain equirectangular world projection (linear lat/lon -> x/y) — no
 * mapping library, no API key, no tile basemap. The background layer is
 * every country's own real (heavily simplified) Natural Earth polygon,
 * fetched once from /feasibility/world-outline and cached indefinitely
 * (borders don't move). Overlaid with the actual crossed country/FIR
 * polygons and great-circle track(s) already fetched from PostGIS —
 * nothing on this map is fabricated or approximated beyond simplification
 * for a few-hundred-pixel canvas.
 */
export function RouteMap({ tracks: rawTracks, stateGeometry, firGeometry }: Props) {
  const { data: worldOutline } = useQuery({
    queryKey: ["world-outline"],
    queryFn: () => api.get<WorldOutline>("/feasibility/world-outline"),
    staleTime: Infinity,
    gcTime: Infinity,
  });

  const tracks = rawTracks.map(normalizeTrack);

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full rounded-md border border-fg/10 bg-fg/5" role="img" aria-label="Route map">
      {worldOutline &&
        Object.entries(worldOutline.countries).map(([code, geom]) => (
          <path key={`world-${code}`} d={geomToPath(geom)} className="fill-fg/[0.04] stroke-fg/10" strokeWidth={0.5} />
        ))}
      {Object.entries(stateGeometry).map(([code, geom]) => (
        <path key={`state-${code}`} d={geomToPath(geom)} className="fill-primary/15 stroke-primary/40" strokeWidth={1} />
      ))}
      {Object.entries(firGeometry).map(([code, geom]) => (
        <path
          key={`fir-${code}`}
          d={geomToPath(geom)}
          fill="none"
          className="stroke-warning/50"
          strokeWidth={1}
          strokeDasharray="4 2"
        />
      ))}
      {tracks.map((track, i) => {
        const trackPoints = track.points;
        if (trackPoints.length === 0) return null;
        const style = TRACK_STYLES[track.variant ?? "primary"];
        const path = trackToPath(trackPoints);
        const start = project(trackPoints[0][0], trackPoints[0][1]);
        const end = project(trackPoints[trackPoints.length - 1][0], trackPoints[trackPoints.length - 1][1]);
        return (
          <g key={`leg-${i}`}>
            <path d={path} fill="none" className={style.stroke} strokeWidth={2} strokeDasharray={style.dash} />
            <circle cx={start[0]} cy={start[1]} r={3.5} className="fill-success" />
            <circle cx={end[0]} cy={end[1]} r={3.5} className="fill-danger" />
            {(() => {
              const isPrimary = (track.variant ?? "primary") === "primary";
              const primaryCount = tracks.filter((t) => (t.variant ?? "primary") === "primary").length;
              const showLabel = Boolean(track.label) || (isPrimary && primaryCount > 1);
              return (
                showLabel && (
                  <text x={start[0] + 6} y={start[1] - 6} className="fill-fg/70" fontSize={10}>
                    {track.label ?? i + 1}
                  </text>
                )
              );
            })()}
          </g>
        );
      })}
    </svg>
  );
}
