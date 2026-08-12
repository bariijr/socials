"""PostGIS ST_Contains resolution — the one place this query lives.

Engine 1 samples a leg's great-circle track into 50+ points and needs to
know which country/FIR each falls in. Doing that as one point at a time
would be 50+ round trips per leg; instead every point is unnested into a
single batched query per table (country_geometry, fir_boundaries) so
resolving a whole leg costs exactly two round trips, keeping the "ten-leg
trip recomputed in under 500ms" target realistic.
"""

import json as _json
from dataclasses import dataclass

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

_BATCH_CONTAINS_SQL = """
    WITH pts AS (
        SELECT * FROM unnest(
            CAST(:idxs AS int[]), CAST(:lats AS double precision[]), CAST(:lons AS double precision[])
        ) AS t(idx, lat, lon)
    )
    SELECT DISTINCT ON (pts.idx) pts.idx AS point_index, g.{code_col} AS code, g.{name_col} AS name
    FROM pts
    JOIN {table} g
      ON ST_Contains(g.geom, ST_SetSRID(ST_MakePoint(pts.lon, pts.lat), 4326))
    ORDER BY pts.idx, g.{code_col}
"""


@dataclass(frozen=True)
class GeoHit:
    point_index: int
    code: str
    name: str | None = None


async def _resolve_hits(
    session: AsyncSession, lats: list[float], lons: list[float], *, table: str, code_col: str, name_col: str
) -> list[GeoHit]:
    if not lats:
        return []
    stmt = text(_BATCH_CONTAINS_SQL.format(table=table, code_col=code_col, name_col=name_col))
    result = await session.execute(
        stmt, {"idxs": list(range(len(lats))), "lats": lats, "lons": lons}
    )
    return [GeoHit(point_index=row.point_index, code=row.code, name=row.name) for row in result]


async def resolve_country_hits(session: AsyncSession, lats: list[float], lons: list[float]) -> list[GeoHit]:
    return await _resolve_hits(session, lats, lons, table="country_geometry", code_col="iso3", name_col="iso3")


async def resolve_fir_hits(session: AsyncSession, lats: list[float], lons: list[float]) -> list[GeoHit]:
    return await _resolve_hits(session, lats, lons, table="fir_boundaries", code_col="icao_fir_code", name_col="name")


_SIMPLIFIED_GEOMETRY_SQL = """
    SELECT {code_col} AS code, ST_AsGeoJSON(ST_SimplifyPreserveTopology(geom, :tolerance)) AS geojson
    FROM {table}
    WHERE {code_col} = ANY(:codes)
"""


async def _fetch_simplified_geometry(
    session: AsyncSession, codes: list[str], *, table: str, code_col: str, tolerance: float
) -> dict[str, dict]:
    if not codes:
        return {}
    stmt = text(_SIMPLIFIED_GEOMETRY_SQL.format(table=table, code_col=code_col))
    result = await session.execute(stmt, {"codes": codes, "tolerance": tolerance})
    return {row.code: _json.loads(row.geojson) for row in result if row.geojson}


async def fetch_simplified_country_geometry(
    session: AsyncSession, iso3_codes: list[str], *, tolerance: float = 0.3
) -> dict[str, dict]:
    """GeoJSON keyed by iso3, simplified for a small preview map payload —
    never for anything spatial (ST_Contains resolution uses the full-
    resolution geometry above, this is display-only).
    """
    return await _fetch_simplified_geometry(
        session, iso3_codes, table="country_geometry", code_col="iso3", tolerance=tolerance
    )


async def fetch_simplified_fir_geometry(
    session: AsyncSession, fir_codes: list[str], *, tolerance: float = 0.3
) -> dict[str, dict]:
    return await _fetch_simplified_geometry(
        session, fir_codes, table="fir_boundaries", code_col="icao_fir_code", tolerance=tolerance
    )


def first_entry_ordered(hits: list[GeoHit]) -> list[GeoHit]:
    """One GeoHit per distinct code — its first occurrence along the
    track — ordered, de-duplicated, and in the order the track first
    enters them. Preserves `name` (needed for FIR display).
    """
    first_by_code: dict[str, GeoHit] = {}
    for hit in sorted(hits, key=lambda h: h.point_index):
        if hit.code not in first_by_code:
            first_by_code[hit.code] = hit
    return sorted(first_by_code.values(), key=lambda h: h.point_index)
