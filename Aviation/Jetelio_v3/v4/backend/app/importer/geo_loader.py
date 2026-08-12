"""Loads real PostGIS polygons — Natural Earth 10m admin-0 countries and
the VATSpy FIR boundary set — NOT the workbook's 0.5-degree raster grid.
See v4/data/geo/SOURCES.md for provenance and licensing (VATSpy is
CC BY-SA 4.0; attribute it wherever FIR boundaries are displayed).
"""

import json
from pathlib import Path

from geoalchemy2.shape import from_shape
from shapely.geometry import MultiPolygon, shape
from shapely.ops import unary_union
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.importer.lookups import CountryIndex
from app.models.geometry import CountryGeometry, FirBoundary
from app.schemas.readiness import ImportSheetResult

COUNTRIES_GEOJSON = "ne_10m_admin_0_countries.geojson"
FIR_GEOJSON = "fir_boundaries.geojson"
COUNTRIES_SOURCE = "Natural Earth 10m admin-0 countries (public domain), naturalearthdata.com"
FIR_SOURCE = "VATSpy Data Project (CC BY-SA 4.0), github.com/vatsimnetwork/vatspy-data-project"


def _to_multipolygon(geom):
    if geom.geom_type == "Polygon":
        return MultiPolygon([geom])
    return geom


def _load_geojson(geo_dir: str, filename: str) -> dict:
    path = Path(geo_dir) / filename
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def build_iso3_to_iso2(geo_dir: str) -> dict[str, str]:
    """Fallback only — used when a countries-sheet row has iso3 + name but
    no iso2 (the workbook's broader visa-matrix-nationality rows outside
    the core operating region). Never overrides a sheet-provided iso2.
    """
    gj = _load_geojson(geo_dir, COUNTRIES_GEOJSON)
    lookup: dict[str, str] = {}
    for feature in gj["features"]:
        props = feature["properties"]
        iso3 = props.get("iso3")
        iso2 = props.get("ISO_A2")
        if iso3 and iso2 and iso2 != "-99":
            lookup[iso3] = iso2
    return lookup


def build_world_name_to_iso3(geo_dir: str) -> dict[str, str]:
    """Broader than the 142 in-region countries table — used to resolve
    visa-matrix NATIONALITY columns that fall outside that set (e.g. a
    non-African/ME/India passport holder), never to resolve a leg's
    destination state, which must exist in `countries`.
    """
    gj = _load_geojson(geo_dir, COUNTRIES_GEOJSON)
    lookup: dict[str, str] = {}
    for feature in gj["features"]:
        props = feature["properties"]
        iso3 = props.get("iso3")
        if not iso3 or iso3 == "-99":
            continue
        for name_key in ("name", "NAME_LONG", "NAME_EN", "SOVEREIGNT"):
            name = props.get(name_key)
            if name:
                lookup[str(name).strip().upper()] = iso3
    return lookup


async def load_country_geometry(session: AsyncSession, geo_dir: str, countries: CountryIndex) -> ImportSheetResult:
    gj = _load_geojson(geo_dir, COUNTRIES_GEOJSON)
    existing = {row.iso3: row for row in (await session.execute(select(CountryGeometry))).scalars().all()}

    loaded = skipped = 0
    notes: list[str] = []
    rows_seen = len(gj["features"])

    # Natural Earth admin-0 occasionally carries more than one polygon
    # feature under the same ISO_A3 (leased/disputed enclaves etc.) — union
    # them into one MultiPolygon per country rather than erroring on the
    # unique constraint or silently dropping the extra piece of territory.
    geoms_by_iso3: dict[str, list] = {}
    for feature in gj["features"]:
        iso3 = feature["properties"].get("iso3")
        if not iso3 or iso3 not in countries.by_iso3:
            skipped += 1
            continue
        geoms_by_iso3.setdefault(iso3, []).append(shape(feature["geometry"]))

    for iso3, geoms in geoms_by_iso3.items():
        merged = geoms[0] if len(geoms) == 1 else unary_union(geoms)
        wkb = from_shape(_to_multipolygon(merged), srid=4326)

        existing_row = existing.get(iso3)
        if existing_row is not None:
            existing_row.geom = wkb
            existing_row.source = COUNTRIES_SOURCE
        else:
            session.add(CountryGeometry(iso3=iso3, geom=wkb, source=COUNTRIES_SOURCE))
        loaded += 1

    await session.flush()
    return ImportSheetResult(
        sheet="country_geometry (Natural Earth 10m)", rows_seen=rows_seen, rows_loaded=loaded,
        rows_skipped=skipped, rows_quarantined=0, notes=notes,
    )


async def load_fir_boundaries(session: AsyncSession, geo_dir: str) -> ImportSheetResult:
    gj = _load_geojson(geo_dir, FIR_GEOJSON)

    # No natural unique key on this table; full reload keeps it idempotent
    # without inventing one for community-sourced boundary data.
    await session.execute(delete(FirBoundary))

    loaded = skipped = 0
    for feature in gj["features"]:
        props = feature["properties"]
        code = props.get("icao_fir_code")
        name = props.get("name")
        if not code or not name:
            skipped += 1
            continue
        geom = _to_multipolygon(shape(feature["geometry"]))
        wkb = from_shape(geom, srid=4326)
        session.add(FirBoundary(icao_fir_code=code, name=name, geom=wkb, source=FIR_SOURCE))
        loaded += 1

    await session.flush()
    return ImportSheetResult(
        sheet="fir_boundaries (VATSpy)", rows_seen=len(gj["features"]), rows_loaded=loaded,
        rows_skipped=skipped, rows_quarantined=0, notes=[],
    )
