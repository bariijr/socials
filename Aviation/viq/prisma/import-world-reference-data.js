// ─────────────────────────────────────────────────────────────────────────────
// One-off / re-runnable import of world reference data (Item 17) from the
// OurAirports-family CSV exports + the FAA Aircraft Characteristics Database,
// both supplied by the user at C:\Backups\InsiderTechSol\Aviation\resources.
//
// Deliberately insert-only (upsert with update: {}, matching prisma/seed.ts's
// own convention) for Countries and AircraftTypes — this business's existing
// curated rows (permit-requirement flags, escalation contacts, real MTOW for
// the actual fleet) must never be silently overwritten by a generic import.
// Airports use createMany + skipDuplicates for the same reason, at the scale
// bulk upserting 85k+ rows one at a time would need.
//
// Run with: node prisma/import-world-reference-data.js
// Safe to re-run — every write path is insert-only.
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const XLSX = require('xlsx');

const RESOURCES_DIR = 'C:/Backups/InsiderTechSol/Aviation/resources';
const prisma = new PrismaClient();

// Minimal RFC4180-ish CSV parser — handles quoted fields, embedded commas,
// and doubled-quote escaping, which is all these OurAirports exports use.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\r') { /* skip */ }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  const header = rows[0];
  return rows.slice(1).filter((r) => r.length === header.length).map((r) => {
    const obj = {};
    header.forEach((h, i) => { obj[h] = r[i]; });
    return obj;
  });
}

function readCsv(fileName) {
  return parseCsv(fs.readFileSync(path.join(RESOURCES_DIR, fileName), 'utf-8'));
}

async function main() {
  console.log('Reading source files...');
  const countryRows = readCsv('countries.csv');
  const airportRows = readCsv('airports.csv');
  const runwayRows = readCsv('runways.csv');
  console.log(`countries.csv: ${countryRows.length}, airports.csv: ${airportRows.length}, runways.csv: ${runwayRows.length}`);

  // ── Max runway length per airport (by OurAirports' internal numeric id,
  // which runways.csv references via airport_ref — not the ICAO ident). ──
  const maxRunwayByAirportRef = new Map();
  for (const r of runwayRows) {
    const len = parseInt(r.length_ft, 10);
    if (!len) continue;
    const ref = r.airport_ref;
    const current = maxRunwayByAirportRef.get(ref);
    if (!current || len > current) maxRunwayByAirportRef.set(ref, len);
  }

  // ── ICAO-code airports only — this app's Airport.icao is the primary key,
  // and most of OurAirports' 85k+ rows are small strips with no ICAO code
  // at all (only a local `ident`), which this schema has no slot for. ──
  const icaoAirports = airportRows.filter((a) => {
    const code = (a.icao_code || a.gps_code || '').trim().toUpperCase();
    return /^[A-Z][A-Z0-9]{3}$/.test(code);
  });
  console.log(`Airports with a usable ICAO code: ${icaoAirports.length}`);

  // ── Country centroids, computed from that country's own airports (the
  // schema's own comment already calls this field "approximate" — this is
  // the same approximation method, just computed instead of hand-picked). ──
  const latSumByCountry = new Map();
  const lngSumByCountry = new Map();
  const countByCountry = new Map();
  for (const a of airportRows) {
    const iso = a.iso_country;
    const lat = parseFloat(a.latitude_deg);
    const lng = parseFloat(a.longitude_deg);
    if (!iso || Number.isNaN(lat) || Number.isNaN(lng)) continue;
    latSumByCountry.set(iso, (latSumByCountry.get(iso) || 0) + lat);
    lngSumByCountry.set(iso, (lngSumByCountry.get(iso) || 0) + lng);
    countByCountry.set(iso, (countByCountry.get(iso) || 0) + 1);
  }

  // ── Countries: insert-only, never touches an existing row. ──
  let countriesInserted = 0;
  for (const c of countryRows) {
    const iso2 = c.code;
    if (!iso2) continue;
    const n = countByCountry.get(iso2) || 0;
    const centroidLat = n ? latSumByCountry.get(iso2) / n : 0;
    const centroidLng = n ? lngSumByCountry.get(iso2) / n : 0;
    const result = await prisma.country.upsert({
      where: { iso2 },
      update: {},
      create: {
        iso2,
        name: c.name || iso2,
        region: c.continent || undefined,
        centroidLat,
        centroidLng,
      },
    });
    // Prisma's upsert doesn't report whether it inserted vs no-op'd on an
    // existing row directly — check separately isn't worth a query per row
    // at this volume, so this count is "processed," not "actually new."
    countriesInserted++;
  }
  console.log(`Countries processed (insert-only, existing rows untouched): ${countriesInserted}`);

  // createMany enforces the FK constraint per-batch, not per-row — one
  // airport referencing a country ISO2 that isn't in the table would abort
  // that whole batch of 2000. Filter against what actually exists now.
  const validCountryIso2s = new Set((await prisma.country.findMany({ select: { iso2: true } })).map((c) => c.iso2));

  // ── Aircraft Types: insert-only, from the FAA Aircraft Characteristics
  // Database (ACD_Data sheet) — real MTOW/wingspan/length data, unlike the
  // bare ICAO-designator list (aircraft_type_designators_fromICAO.csv),
  // which has no performance data and was deliberately not imported into
  // this required-MTOW schema (would be thousands of unusable rows). ──
  const wb = XLSX.readFile(path.join(RESOURCES_DIR, 'aircraft_data.xlsx'));
  const acdRows = XLSX.utils.sheet_to_json(wb.Sheets['ACD_Data'], { defval: null });
  let aircraftTypesProcessed = 0;
  for (const r of acdRows) {
    const icaoType = (r.ICAO_Code || '').trim();
    if (!icaoType) continue;
    const mtowLb = parseFloat(r.MTOW_lb);
    if (!mtowLb) continue; // required field — skip the rare row missing it
    await prisma.aircraftType.upsert({
      where: { icaoType },
      update: {},
      create: {
        icaoType,
        manufacturer: r.Manufacturer || 'Unknown',
        model: r.Model_FAA || r.Model_BADA || icaoType,
        category: r.Class || undefined,
        mtowKg: mtowLb * 0.45359237,
        wakeCategory: r.ICAO_WTC || undefined,
        wingspanFt: parseFloat(r.Wingspan_ft_without_winglets_sharklets) || undefined,
        lengthFt: parseFloat(r.Length_ft) || undefined,
        description: r.Model_BADA || undefined,
      },
    });
    aircraftTypesProcessed++;
  }
  console.log(`Aircraft types processed (insert-only): ${aircraftTypesProcessed}`);

  // ── Airports: bulk createMany + skipDuplicates (insert-only by PK). ──
  const airportData = icaoAirports
    .map((a) => {
      const icao = (a.icao_code || a.gps_code || '').trim().toUpperCase();
      const lat = parseFloat(a.latitude_deg);
      const lng = parseFloat(a.longitude_deg);
      if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
      if (!validCountryIso2s.has(a.iso_country)) return null;
      return {
        icao,
        iata: a.iata_code || undefined,
        name: a.name || icao,
        city: a.municipality || undefined,
        countryIso2: a.iso_country,
        latitude: lat,
        longitude: lng,
        elevationFt: a.elevation_ft ? parseInt(a.elevation_ft, 10) : undefined,
        runwayLengthFt: maxRunwayByAirportRef.get(a.id) || undefined,
        category: a.type || undefined,
      };
    })
    .filter(Boolean)
    // De-dup by ICAO within the source file itself (a handful of duplicate
    // idents exist in OurAirports' export) — keep the first occurrence.
    .filter((row, idx, arr) => arr.findIndex((r) => r.icao === row.icao) === idx);

  const BATCH_SIZE = 2000;
  let airportsInserted = 0;
  for (let i = 0; i < airportData.length; i += BATCH_SIZE) {
    const batch = airportData.slice(i, i + BATCH_SIZE);
    const result = await prisma.airport.createMany({ data: batch, skipDuplicates: true });
    airportsInserted += result.count;
    process.stdout.write(`\rAirports inserted: ${airportsInserted} / ${airportData.length} candidates`);
  }
  console.log(`\nDone. Airports actually inserted (new rows only): ${airportsInserted}`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
