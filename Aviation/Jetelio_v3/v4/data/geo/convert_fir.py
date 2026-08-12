"""
Build fir_boundaries.geojson from the VATSpy Data Project.

Sources (both from https://github.com/vatsimnetwork/vatspy-data-project, branch "master"):
  - Boundaries.geojson  (FIR/UIR polygon boundaries, keyed by an internal "id" boundary code)
  - VATSpy.dat          ([FIRs] section maps ICAO FIR code -> human-readable NAME -> boundary id)

License: CC BY-SA 4.0 (see vatspy_LICENSE.txt in this directory).
This is a community-maintained dataset used by the VATSIM VAT-Spy ATC client; it is
not an official AIXM/eAIP product, but it is the best freely-redistributable, actively
maintained, real polygon FIR dataset available (see SOURCES.md / FIR_SOURCING_NOTES.md
for the other candidates that were evaluated and rejected).

Output properties on each feature:
  - icao_fir_code : the boundary id used by VATSpy (usually the real ICAO FIR/UIR code,
                     e.g. "KZAK", "EGTT"; occasionally a VATSIM-only sub-division code
                     like "ADR-E" for staffing sub-sectors - these are kept as-is since
                     they still describe a real, smaller piece of controlled airspace
                     nested inside the parent FIR)
  - name          : human readable FIR/UIR name pulled from VATSpy.dat's [FIRs] section
  - oceanic       : "1"/"0" flag carried over from the source data
  - region/division : VATSIM administrative grouping, carried over for reference

Usage:
    python convert_fir.py
"""
import json
import re

BOUNDARIES_GEOJSON = "vatspy_Boundaries.geojson"
VATSPY_DAT = "VATSpy.dat"
OUT_GEOJSON = "fir_boundaries.geojson"


def parse_fir_names(dat_path):
    """Parse the [FIRs] section of VATSpy.dat.

    Format: ICAO|NAME|CALLSIGN PREFIX|FIR BOUNDARY
    Multiple rows can share the same FIR BOUNDARY id (one per controller position/sector).
    We prefer the row whose CALLSIGN PREFIX is empty (the "base" position) as the
    canonical name for that boundary id; otherwise we keep the first name seen.
    """
    names_by_boundary = {}
    preferred_seen = set()

    with open(dat_path, encoding="utf-8-sig") as fh:
        in_section = False
        for line in fh:
            line = line.rstrip("\n\r")
            if line.strip() == "[FIRs]":
                in_section = True
                continue
            if in_section and line.startswith("["):
                break
            if not in_section:
                continue
            if not line or line.startswith(";"):
                continue
            parts = line.split("|")
            if len(parts) < 4:
                continue
            icao, name, callsign_prefix, boundary_id = parts[0], parts[1], parts[2], parts[3]
            boundary_id = boundary_id.strip()
            if not boundary_id:
                continue
            is_preferred = (callsign_prefix.strip() == "")
            if boundary_id not in names_by_boundary:
                names_by_boundary[boundary_id] = name
                if is_preferred:
                    preferred_seen.add(boundary_id)
            elif is_preferred and boundary_id not in preferred_seen:
                names_by_boundary[boundary_id] = name
                preferred_seen.add(boundary_id)

    return names_by_boundary


def main():
    with open(BOUNDARIES_GEOJSON, encoding="utf-8") as fh:
        boundaries = json.load(fh)

    names_by_boundary = parse_fir_names(VATSPY_DAT)

    matched, unmatched = 0, 0
    out_features = []
    for feat in boundaries["features"]:
        props = feat.get("properties", {})
        boundary_id = props.get("id")
        name = names_by_boundary.get(boundary_id)
        if name:
            matched += 1
        else:
            unmatched += 1

        new_props = {
            "icao_fir_code": boundary_id,
            "name": name,  # may be None if VATSpy.dat had no matching row
            "oceanic": props.get("oceanic"),
            "region": props.get("region"),
            "division": props.get("division"),
        }
        out_features.append({
            "type": "Feature",
            "properties": new_props,
            "geometry": feat["geometry"],
        })

    fc = {
        "type": "FeatureCollection",
        "name": "fir_boundaries",
        "crs": {"type": "name", "properties": {"name": "urn:ogc:def:crs:OGC:1.3:CRS84"}},
        "features": out_features,
    }

    with open(OUT_GEOJSON, "w", encoding="utf-8") as fh:
        json.dump(fc, fh, ensure_ascii=False)

    print(f"Wrote {len(out_features)} features to {OUT_GEOJSON}")
    print(f"Matched names: {matched}, unmatched (name=None): {unmatched}")


if __name__ == "__main__":
    main()
