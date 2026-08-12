# Geo data sources — v4/data/geo/

Staged for the PostGIS loader. All commands below were run from this directory
(`v4/data/geo/`) on a machine with Python 3.14 + `pyshp` installed
(`pip install pyshp`); no GDAL/`ogr2ogr` was available in this environment, so
conversion uses lightweight pure-Python scripts instead. Both scripts are checked
in here (`convert_countries.py`, `convert_fir.py`) and are re-runnable.

## 1. Countries — Natural Earth 10m Admin-0 Countries

- **Download URL:** https://naciscdn.org/naturalearth/10m/cultural/ne_10m_admin_0_countries.zip
  (official Natural Earth CDN, current as of the 5.1.1 / May 2022 release)
- **License:** Public Domain. Natural Earth data is explicitly released with no
  restrictions on use — see https://www.naturalearthdata.com/about/terms-of-use/
  ("No permission is needed to use Natural Earth. Crediting the authors is
  unnecessary.")
- **Resolution:** 1:10,000,000 — the highest-detail Natural Earth admin-0 layer
  (sub-nautical-mile coastline precision, far finer than the previous 0.5°/30nm grid).
- **Files kept:**
  - `ne_10m_admin_0_countries.zip` — original download, untouched (4.9 MB)
  - `ne_10m_admin_0_countries_shp/` — unzipped shapefile (.shp/.shx/.dbf/.prj/.cpg
    + Natural Earth's README/VERSION), kept so a loader can point GDAL/`ogr2ogr`
    directly at the .shp instead of the GeoJSON if preferred
  - `ne_10m_admin_0_countries.geojson` — converted GeoJSON, 258 features
- **Conversion commands run:**
  ```bash
  curl -sL -o ne_10m_admin_0_countries.zip \
    "https://naciscdn.org/naturalearth/10m/cultural/ne_10m_admin_0_countries.zip"
  unzip -o -q ne_10m_admin_0_countries.zip -d ne_10m_admin_0_countries_shp
  pip install pyshp
  python convert_countries.py
  ```
- **Property mapping for the loader:**
  - `properties.iso3` — normalized ISO 3166-1 alpha-3 code. Prefers `ISO_A3`;
    falls back to `ISO_A3_EH` then `ADM0_A3` for the small number of rows where
    Natural Earth leaves `ISO_A3` as the sentinel `"-99"` (historically France,
    Norway, and a few disputed territories). -> maps to `countries.iso3`
  - `properties.name` — prefers `NAME`, falls back to `NAME_LONG`. -> maps to
    `countries.name`
  - Original Natural Earth fields (`ISO_A3`, `ISO_A3_EH`, `ADM0_A3`, `ISO_A2`,
    `NAME`, `NAME_LONG`, `NAME_EN`, `SOVEREIGNT`, `CONTINENT`, `REGION_UN`,
    `SUBREGION`, `TYPE`) are retained as-is alongside the normalized fields in
    case the loader wants richer metadata.
  - If preferred, GDAL can instead read `ne_10m_admin_0_countries_shp/ne_10m_admin_0_countries.shp`
    directly:
    ```bash
    ogr2ogr -f "PostgreSQL" PG:"dbname=jetelio" \
      ne_10m_admin_0_countries_shp/ne_10m_admin_0_countries.shp \
      -nln countries_raw -nlt PROMOTE_TO_MULTI
    ```

## 2. FIR (Flight Information Region) boundaries — VATSpy Data Project

- **Source repo:** https://github.com/vatsimnetwork/vatspy-data-project
  (branch `master`) — the data backing the VAT-Spy ATC display client used
  across the VATSIM network. This is a community-maintained dataset curated
  through a PR-review process by regional VATSIM staff/data teams (not an
  official AIXM/eAIP publication), but it is real FIR/UIR **polygon** boundary
  data, actively maintained (last updated on the AIRAC cycle), and is the best
  freely redistributable option found — see the candidate evaluation below.
- **Files downloaded:**
  - `vatspy_Boundaries.geojson` — the repo's `Boundaries.geojson`, 1102
    FIR/UIR/sub-sector MultiPolygon features (2.0 MB)
  - `VATSpy.dat` — the repo's `VATSpy.dat`, whose `[FIRs]` section maps each
    boundary id to a human-readable name (0.9 MB, plaintext, pipe-delimited)
  - `vatspy_LICENSE.txt` — the repo's LICENSE file, saved verbatim
- **License:** CC BY-SA 4.0 (GitHub's detected license for the repo, matching
  the LICENSE file content: Creative Commons Attribution-ShareAlike 4.0
  International). Attribution to the VATSpy Data Project / VATSIM is required;
  derivative datasets must be shared under the same license.
- **Download commands run:**
  ```bash
  curl -sL -o vatspy_Boundaries.geojson \
    "https://raw.githubusercontent.com/vatsimnetwork/vatspy-data-project/master/Boundaries.geojson"
  curl -sL -o VATSpy.dat \
    "https://raw.githubusercontent.com/vatsimnetwork/vatspy-data-project/master/VATSpy.dat"
  curl -sL -o vatspy_LICENSE.txt \
    "https://raw.githubusercontent.com/vatsimnetwork/vatspy-data-project/master/LICENSE"
  ```
- **Conversion command run:**
  ```bash
  python convert_fir.py
  ```
  `convert_fir.py` joins `vatspy_Boundaries.geojson`'s `properties.id` (the
  boundary code) against `VATSpy.dat`'s `[FIRs]` section
  (`ICAO|NAME|CALLSIGN PREFIX|FIR BOUNDARY`) to attach a human-readable name to
  every polygon, preferring the row whose `CALLSIGN PREFIX` is empty (the base
  controller position for that boundary) when a boundary id has multiple rows
  (one per sector/position). All 1102 boundaries matched a name (0 unmatched).
- **Output:** `fir_boundaries.geojson`, 1102 features, properties:
  - `icao_fir_code` — the boundary id, generally the real ICAO FIR/UIR code
    (e.g. `EGTT` London, `HTDC` Dar-Es-Salaam, `KZAK` San Francisco Oceanic,
    `DTTC` Tunis). A handful of ids are VATSIM-only sub-division suffixes
    (e.g. `ADR-E` / `ADR-W` for the Adria FIR's east/west staffing split) —
    these still represent real, smaller pieces of controlled airspace nested
    inside the parent FIR, not fabricated data.
  - `name` — human-readable FIR/position name from VATSpy.dat
  - `oceanic` — "1"/"0" flag carried over from the source (oceanic vs.
    continental FIR)
  - `region`, `division` — VATSIM administrative grouping, carried over for
    reference/debugging, not required by the schema

### Other candidates evaluated for FIR boundaries (and why VATSpy was chosen)

1. **VATSpy / vatsim-data-project** — chosen. Real polygons, permissive
   CC BY-SA 4.0, actively maintained, global coverage including African FIRs
   (verified HTDC Dar-Es-Salaam, FAJA Johannesburg present).
2. **davidmegginson / AIXM-derived FIR GeoJSON exports** — not pursued once
   VATSpy checked out as real polygon data with a clear license; would be
   worth revisiting later for a more "official" AIXM-sourced alternative if
   VATSpy's community-curated boundaries prove insufficiently accurate for a
   specific FIR.
3. **OpenAIP / OurAirports** — OurAirports does not publish FIR polygons
   (confirmed no such dataset in its standard CSV exports); OpenAIP requires
   an API key/account for programmatic access and its airspace license terms
   are not clearly permissive for redistribution, so it was not pursued
   further given VATSpy's data being royalty-free and already sufficient.
4. **OpenFlights-adjacent exports** — OpenFlights itself only covers
   airports/routes/airlines, not FIR boundaries; no credible adjacent FIR
   polygon export was found.

## Notes for the importer

- Both GeoJSON files use `CRS84` (lon/lat, WGS84) per RFC 7946 — the default
  and correct assumption for `ST_GeomFromGeoJSON` and PostGIS geography/
  geometry columns using SRID 4326.
- Neither dataset needed reprojection; the Natural Earth shapefile's `.prj`
  confirms WGS84 as well.
- Geometry types: countries are `Polygon`/`MultiPolygon` mixed; FIR boundaries
  are uniformly `MultiPolygon`.
