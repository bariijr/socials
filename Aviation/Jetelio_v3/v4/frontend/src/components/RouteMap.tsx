import type { GeoJsonGeometry } from "@/lib/types";

interface Props {
  // One array of [lat, lon] points per leg — a single-leg caller (e.g.
  // RoutePreviewPanel) just passes a length-1 array. Task #114: the
  // public VIQ page overlays every leg of a multi-leg trip in one shared
  // viewport instead of stacking a separate small map per leg.
  tracks: [number, number][][];
  stateGeometry: Record<string, GeoJsonGeometry>;
  firGeometry: Record<string, GeoJsonGeometry>;
}

const WIDTH = 480;
const HEIGHT = 300;
const PADDING_FRACTION = 0.2;

type Ring = [number, number][]; // [lon, lat] pairs, GeoJSON order

function polygonRings(geom: GeoJsonGeometry): Ring[] {
  if (geom.type === "Polygon") {
    return geom.coordinates as Ring[];
  }
  // MultiPolygon.coordinates: Polygon[] where each Polygon is Ring[] —
  // one flatten merges every polygon's rings into a single list.
  return (geom.coordinates as Ring[][]).flat();
}

/** Plain equirectangular projection (linear lat/lon -> x/y), zoomed to the
 * combined bounding box of every leg's track + crossed geometry — no
 * mapping library, no API key, no basemap. Draws only real data: the
 * great-circle track(s) and the actual crossed country/FIR polygons
 * already fetched from PostGIS.
 */
export function RouteMap({ tracks, stateGeometry, firGeometry }: Props) {
  const allPoints: [number, number][] = tracks.flat();
  for (const geom of Object.values(stateGeometry)) {
    for (const ring of polygonRings(geom)) {
      for (const [lon, lat] of ring) allPoints.push([lat, lon]);
    }
  }
  if (allPoints.length === 0) return null;

  const lats = allPoints.map((p) => p[0]);
  const lons = allPoints.map((p) => p[1]);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const latPad = Math.max((maxLat - minLat) * PADDING_FRACTION, 1);
  const lonPad = Math.max((maxLon - minLon) * PADDING_FRACTION, 1);
  const boundMinLat = minLat - latPad;
  const boundMaxLat = maxLat + latPad;
  const boundMinLon = minLon - lonPad;
  const boundMaxLon = maxLon + lonPad;

  function project(lat: number, lon: number): [number, number] {
    const x = ((lon - boundMinLon) / (boundMaxLon - boundMinLon)) * WIDTH;
    const y = HEIGHT - ((lat - boundMinLat) / (boundMaxLat - boundMinLat)) * HEIGHT;
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

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full rounded-md border border-fg/10 bg-fg/5" role="img" aria-label="Route map">
      {Object.entries(stateGeometry).map(([code, geom]) => (
        <path key={`state-${code}`} d={geomToPath(geom)} className="fill-primary/10 stroke-primary/30" strokeWidth={1} />
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
      {tracks.map((trackPoints, i) => {
        if (trackPoints.length === 0) return null;
        const path = trackToPath(trackPoints);
        const start = project(trackPoints[0][0], trackPoints[0][1]);
        const end = project(trackPoints[trackPoints.length - 1][0], trackPoints[trackPoints.length - 1][1]);
        return (
          <g key={`leg-${i}`}>
            <path d={path} fill="none" className="stroke-fg" strokeWidth={2} />
            <circle cx={start[0]} cy={start[1]} r={4} className="fill-success" />
            <circle cx={end[0]} cy={end[1]} r={4} className="fill-danger" />
            {tracks.length > 1 && (
              <text x={start[0] + 6} y={start[1] - 6} className="fill-fg/70" fontSize={10}>
                {i + 1}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
