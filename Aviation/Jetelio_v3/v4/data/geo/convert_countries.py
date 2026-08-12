"""
Convert Natural Earth 10m Admin-0 Countries shapefile to GeoJSON.

Source: https://naciscdn.org/naturalearth/10m/cultural/ne_10m_admin_0_countries.zip
License: Public Domain (Natural Earth - https://www.naturalearthdata.com/about/terms-of-use/)

Requires: pip install pyshp

Usage:
    python convert_countries.py
"""
import json
import shapefile  # pyshp

SRC_SHP = "ne_10m_admin_0_countries_shp/ne_10m_admin_0_countries.shp"
OUT_GEOJSON = "ne_10m_admin_0_countries.geojson"

# Fields we retain in the output GeoJSON properties.
# ISO_A3 / NAME are the required minimum (map to countries.iso3 / countries.name).
KEEP_FIELDS = [
    "ISO_A3",       # ISO 3166-1 alpha-3 code (required -> countries.iso3)
    "ISO_A3_EH",    # ISO_A3 with de-facto/EH adjustments (fallback for disputed territories where ISO_A3 == "-99")
    "ADM0_A3",      # Natural Earth's own admin-0 3-letter code (fallback when ISO_A3 is -99)
    "ISO_A2",       # ISO 3166-1 alpha-2 code
    "NAME",         # short name (required -> countries.name)
    "NAME_LONG",    # long form name
    "NAME_EN",      # English name
    "SOVEREIGNT",   # sovereign state name
    "CONTINENT",
    "REGION_UN",
    "SUBREGION",
    "TYPE",
]


def main():
    sf = shapefile.Reader(SRC_SHP)
    field_names = [f[0] for f in sf.fields[1:]]  # skip DeletionFlag
    keep_idx = [field_names.index(f) for f in KEEP_FIELDS if f in field_names]
    keep_names = [field_names[i] for i in keep_idx]

    features = []
    for sr in sf.iterShapeRecords():
        rec = sr.record
        shp = sr.shape
        geom = shp.__geo_interface__

        props = {}
        for name in keep_names:
            props[name] = rec[field_names.index(name)]

        # Normalize a clean iso3 field: prefer ISO_A3, fall back to ISO_A3_EH,
        # then ADM0_A3 for the handful of rows where ISO_A3 is the sentinel "-99"
        # (e.g. France, Norway, Kosovo in some ne releases).
        iso3 = props.get("ISO_A3")
        if not iso3 or iso3 == "-99":
            iso3 = props.get("ISO_A3_EH") or props.get("ADM0_A3")
        props["iso3"] = iso3
        props["name"] = props.get("NAME") or props.get("NAME_LONG")

        features.append({
            "type": "Feature",
            "properties": props,
            "geometry": geom,
        })

    fc = {
        "type": "FeatureCollection",
        "name": "ne_10m_admin_0_countries",
        "crs": {"type": "name", "properties": {"name": "urn:ogc:def:crs:OGC:1.3:CRS84"}},
        "features": features,
    }

    with open(OUT_GEOJSON, "w", encoding="utf-8") as fh:
        json.dump(fc, fh, ensure_ascii=False)

    print(f"Wrote {len(features)} features to {OUT_GEOJSON}")


if __name__ == "__main__":
    main()
