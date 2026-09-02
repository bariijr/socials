# VIQ Reference Data — Search, Filter, Excel Export/Import

## Context

Item 3 of the user's post-auth backlog: "Reference Data — add search,
filter and excel down/upload for all this data." "Reference Data" refers
to `ReferencePage.tsx` (nav item "Reference Data"), which has 7 tabs:
Airports, Countries, Country Rules, Aircraft, Providers, Service Types,
Leg Purposes.

**Investigation finding that reshaped this spec**: 5 of the 7 tabs
(Airports, Countries, Country Rules, Aircraft, Providers) render
`refAirports`/`refCountries`/`refCountryRules`/`refAircraft`/`refProviders`
— **static JSON bundled into the client at build time**, not the live
database. Only Service Types and Leg Purposes are real, database-backed
catalogs. Meanwhile `AdminAssets.tsx` (nav item "Assets") already has full
live CRUD — create/edit/delete, backed by a complete `/reference/*` REST
API — for Aircraft, Providers, Airports, Countries, Operators, and
Country Fees, via an in-memory cache (`_aircraftCache`, `_countryCache`,
etc.) populated once at app boot by `preloadReferenceData()`
(`Layout.tsx`) and read through synchronous getters (`getAircraftList()`,
`getCountryList()`, etc.). So "Reference Data" and "Assets" show
overlapping entities from two disconnected sources — one frozen at build
time, one live.

Presented to the user as a scope decision; **chosen: consolidate onto
live data** — rewire `ReferencePage.tsx`'s static tabs onto the same live
cache `AdminAssets.tsx` already uses, then add search/filter and Excel
export/import uniformly across all 7 tabs against real data.

**Second investigation finding**: 4 of the 5 static tabs need only a
one-line import swap to become live (`refAirports` → `getAirportList()`,
etc.) — `preloadReferenceData()` already populates these caches before
any route renders, so no new backend work is needed for Airports,
Countries, Aircraft, or Providers. The exception is **Country Rules**:
the `CountryRule` Prisma model exists and is seeded, and
`GET /reference/country-rules` exists, but there is no create/update/
delete route, no cache, and no admin UI anywhere in the app. This needs
real new plumbing, built by mirroring the already-existing `CountryFee`
CRUD pattern (DTOs, service methods, controller routes, cache, `save`/
`delete` functions) field-for-field.

Per explicit user instruction (carried over from every prior sub-project
in this session): **do not `git commit` any of this work.**

## Goal

`ReferencePage.tsx` becomes the single live view of all 7 reference
catalogs, each with: a text search box, an Excel "Download" button, and
an Excel "Upload" button (upsert, never delete). Country Rules gains full
CRUD (previously read-only-static) via a new Add/Edit dialog, matching
the existing Service Types/Leg Purposes pattern. Manual one-by-one
editing stays split exactly as it is today — `AdminAssets.tsx` keeps
owning Airports/Countries/Aircraft/Providers/Operators/Fees dialogs;
`ReferencePage.tsx` keeps owning Service Types/Leg Purposes dialogs and
gains Country Rules. Both pages read/write the same live cache, so they
stay in sync automatically with no extra plumbing.

## Design decisions

- **Search is client-side only.** Every tab's row count is small (19
  airports, 22 countries, 29 country rules, 6 aircraft, 13 providers in
  current seed data) — no server-side pagination or query params needed.
  A single generic hook, `useTextFilter`, is shared across all 7 tabs
  rather than seven copy-pasted `useState`+`.filter()` blocks.
- **Excel export/import is entirely client-side**, using the `xlsx`
  (SheetJS) package — a new dependency. No new backend routes are needed
  for import/export itself; import drives the *same* `save*` functions
  already used by manual edits, so validation is identical to typing a
  row in by hand.
- **Import is upsert-only, never deletes.** A row that exists in the
  database but is missing from an uploaded file is left untouched.
  Deleting a row stays a deliberate, manual action via the existing
  per-row Delete/Deactivate button. This is the safe default for a
  spreadsheet-driven bulk-edit tool — a truncated or filtered export
  re-uploaded by mistake must never silently delete data.
- **Import processes rows independently, not as one atomic transaction.**
  Each row is validated and saved on its own; a bad row is skipped and
  reported, the rest still import. After import, the UI shows a summary
  ("18 succeeded, 1 failed: row 5 — ICAO is required").
- **Export includes every field of the corresponding frontend type**,
  not just the columns currently displayed in the table — so
  download → edit in Excel → re-upload round-trips losslessly. Column
  headers are the exact frontend field names (e.g. `ICAO`, `IATA`,
  `CountryISO2`), so import parses the same headers back with no
  translation table.
- **Array fields serialize as a single comma-separated cell** (e.g.
  `Provider.ServiceTypes`, `CountryRule.ExceptionAirports`,
  `CountryRule.DocsRequired`) — the same convention already used for
  comma-separated multi-value fields elsewhere in this app (the FIR
  tag input). Boolean fields serialize as literal `TRUE`/`FALSE` text.
- **`Provider.Contacts` (an array of `{Label, Email}` objects) is
  excluded from the Excel round-trip.** It's the only nested-object-array
  field in any of the 7 tabs' types; flattening it into spreadsheet cells
  adds real complexity for a field that's edited rarely. Multi-contact
  editing stays manual via the existing Provider dialog in
  `AdminAssets.tsx`. Every other field on every other type round-trips.
- **Country Rules CRUD lives in `ReferencePage.tsx`**, not
  `AdminAssets.tsx` — consistent with Service Types/Leg Purposes, the two
  other "standalone admin catalogs" that already live there, rather than
  adding a tab to `AdminAssets.tsx` for a page that otherwise only manages
  entities with their own real-world identity (aircraft, vendors,
  people).
- **Country Rules writes are `@Roles('Admin')`-gated**, matching every
  other write route already in `reference.controller.ts` (Countries,
  Airports, Aircraft, Providers, Operators, Country Fees are all
  Admin-only writes today — this is the established convention for this
  controller, distinct from the un-gated `persons`/`legs` controllers).

## Backend: Country Rules CRUD

### DTOs

`src/server/modules/reference/dto/create-country-rule.dto.ts` (new):

```typescript
import { IsArray, IsBoolean, IsInt, IsOptional, IsString } from 'class-validator';

export class CreateCountryRuleDto {
  @IsString()
  countryIso2!: string;

  @IsString()
  serviceType!: string;

  @IsInt()
  leadTimeHours!: number;

  @IsOptional()
  @IsBoolean()
  workingDaysOnly?: boolean;

  @IsOptional()
  @IsInt()
  toleranceHours?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  exceptionAirports?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  docsRequired?: string[];

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  user?: string;
}
```

`src/server/modules/reference/dto/update-country-rule.dto.ts` (new):

```typescript
import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateCountryRuleDto } from './create-country-rule.dto';

export class UpdateCountryRuleDto extends PartialType(OmitType(CreateCountryRuleDto, ['countryIso2', 'serviceType'] as const)) {}
```

(`countryIso2`+`serviceType` form the compound unique key — same reason
`countryIso2` is omitted from `UpdateCountryFeeDto`'s base, extended here
to both key fields since `CountryRule`'s uniqueness is the pair.)

### `ReferenceService` additions

Add alongside the existing `countryRules()`/`countryRule()` methods:

```typescript
  async createCountryRule(dto: CreateCountryRuleDto) {
    const user = dto.user || 'SYSTEM';
    const { user: _user, ...rest } = dto;
    const rule = await this.prisma.countryRule.create({ data: rest });
    await this.audit.log(user, 'CountryRule', String(rule.id), 'Created', '', `${rule.countryIso2}/${rule.serviceType}`);
    return rule;
  }

  async updateCountryRule(id: number, dto: UpdateCountryRuleDto) {
    const before = await this.prisma.countryRule.findUnique({ where: { id } });
    if (!before) throw new NotFoundException(`Country rule ${id} not found`);
    const user = dto.user || 'SYSTEM';
    const { user: _user, ...rest } = dto;
    const rule = await this.prisma.countryRule.update({ where: { id }, data: rest });
    await this.audit.logDiff(user, 'CountryRule', String(id), before as unknown as Record<string, unknown>, rule as unknown as Record<string, unknown>);
    return rule;
  }

  async deleteCountryRule(id: number, user = 'SYSTEM') {
    const existing = await this.prisma.countryRule.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Country rule ${id} not found`);
    await this.prisma.countryRule.delete({ where: { id } });
    await this.audit.log(user, 'CountryRule', String(id), 'Deleted', `${existing.countryIso2}/${existing.serviceType}`, '');
    return { id, deleted: true };
  }
```

(Add `import { CreateCountryRuleDto } from './dto/create-country-rule.dto';`
and `import { UpdateCountryRuleDto } from './dto/update-country-rule.dto';`
to `reference.service.ts`'s existing imports. `NotFoundException` is
already imported in this file for the aircraft/provider/etc. methods.)

### `ReferenceController` additions

Add alongside the existing `@Get('country-rules')` route:

```typescript
  @Roles('Admin')
  @Post('country-rules')
  createCountryRule(@Body() dto: CreateCountryRuleDto) {
    return this.ref.createCountryRule(dto);
  }

  @Roles('Admin')
  @Patch('country-rules/:id')
  updateCountryRule(@Param('id') id: string, @Body() dto: UpdateCountryRuleDto) {
    return this.ref.updateCountryRule(Number(id), dto);
  }

  @Roles('Admin')
  @Delete('country-rules/:id')
  deleteCountryRule(@Param('id') id: string, @Query('user') user?: string) {
    return this.ref.deleteCountryRule(Number(id), user);
  }
```

(Add the two new DTO imports to `reference.controller.ts`'s existing
import block, same pattern as `CreateCountryFeeDto`/`UpdateCountryFeeDto`.)

## Frontend: `types.ts`

Extend the existing `CountryRule` interface (do not rename or remove any
existing field):

```typescript
export interface CountryRule {
  ID: number;
  CountryISO2: string;
  ServiceType: ServiceType;
  LeadTimeHours: number;
  WorkingDaysOnly: boolean;
  ToleranceHours: number;
  ExceptionAirports?: string[];
  DocsRequired?: string[];
  Notes?: string;
}
```

(`Notes` becomes optional — matches the nullable backend column; every
other field is unchanged. `ID` is new, required, since every mutation
route needs it.)

## Frontend: `dataStore.ts`

### Cache + mapper + CRUD (mirrors `CountryFee` exactly)

Add near the existing `_countryFeeCache` declaration:

```typescript
let _countryRuleCache: CountryRule[] | null = null;
```

Add near `mapCountryFeeFromApi`:

```typescript
function mapCountryRuleFromApi(r: any): CountryRule {
  return {
    ID: r.id,
    CountryISO2: r.countryIso2,
    ServiceType: r.serviceType,
    LeadTimeHours: r.leadTimeHours,
    WorkingDaysOnly: r.workingDaysOnly,
    ToleranceHours: r.toleranceHours,
    ExceptionAirports: r.exceptionAirports ?? [],
    DocsRequired: r.docsRequired ?? [],
    Notes: r.notes ?? undefined,
  };
}
```

In `preloadReferenceData()`, add `countryRules` to the `Promise.all` and
assign the cache:

```typescript
export async function preloadReferenceData(): Promise<void> {
  const [aircraft, providers, airports, countries, operators, messageTemplates, countryFees, countryRules] = await Promise.all([
    apiJson<any[]>('/reference/aircraft'),
    apiJson<any[]>('/reference/providers'),
    apiJson<any[]>('/reference/airports'),
    apiJson<any[]>('/reference/countries'),
    apiJson<any[]>('/reference/operators'),
    apiJson<any[]>('/message-templates'),
    apiJson<any[]>('/reference/country-fees'),
    apiJson<any[]>('/reference/country-rules'),
  ]);
  _aircraftCache = aircraft.map(mapAircraftFromApi);
  _providerCache = providers.map(mapProviderFromApi);
  _airportCache = airports.map(mapAirportFromApi);
  _countryCache = countries.map(mapCountryFromApi);
  _operatorCache = operators.map(mapOperatorFromApi);
  _messageTemplateCache = messageTemplates.map(mapMessageTemplateFromApi);
  _countryFeeCache = countryFees.map(mapCountryFeeFromApi);
  _countryRuleCache = countryRules.map(mapCountryRuleFromApi);
}
```

Add near `getCountryFeeList`/`saveCountryFee`/`deleteCountryFee`:

```typescript
export function getCountryRuleList(): CountryRule[] {
  return _countryRuleCache ?? [];
}

export async function saveCountryRule(
  r: { ID?: number; CountryISO2: string; ServiceType: string; LeadTimeHours: number; WorkingDaysOnly?: boolean; ToleranceHours?: number; ExceptionAirports?: string[]; DocsRequired?: string[]; Notes?: string },
  user = currentUser()
): Promise<CountryRule> {
  const body = JSON.stringify({
    countryIso2: r.CountryISO2,
    serviceType: r.ServiceType,
    leadTimeHours: r.LeadTimeHours,
    workingDaysOnly: r.WorkingDaysOnly,
    toleranceHours: r.ToleranceHours,
    exceptionAirports: r.ExceptionAirports,
    docsRequired: r.DocsRequired,
    notes: r.Notes,
    user,
  });
  const row = r.ID
    ? await apiJson<any>(`/reference/country-rules/${r.ID}`, { method: 'PATCH', body })
    : await apiJson<any>('/reference/country-rules', { method: 'POST', body });
  const mapped = mapCountryRuleFromApi(row);
  const list = getCountryRuleList();
  const idx = list.findIndex((x) => x.ID === mapped.ID);
  _countryRuleCache = idx >= 0
    ? list.map((x, i) => (i === idx ? mapped : x))
    : [...list, mapped];
  return mapped;
}

export async function deleteCountryRule(id: number, user = currentUser()): Promise<void> {
  await apiJson(`/reference/country-rules/${id}?user=${encodeURIComponent(user)}`, { method: 'DELETE' });
  _countryRuleCache = getCountryRuleList().filter((r) => r.ID !== id);
}
```

(Add `CountryRule` to the existing `import type { ... } from '@/data/types';`
line at the top of `dataStore.ts`, if not already present via the general
type import.)

## Frontend: shared utilities

### `src/client/hooks/useTextFilter.ts` (new)

```typescript
import { useMemo, useState } from 'react';

export function useTextFilter<T>(rows: T[], getSearchableText: (row: T) => string) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => getSearchableText(row).toLowerCase().includes(q));
  }, [rows, query, getSearchableText]);
  return { query, setQuery, filtered };
}
```

### `src/client/lib/excelIO.ts` (new)

```typescript
import * as XLSX from 'xlsx';

export function exportToExcel(rows: Record<string, unknown>[], filename: string, sheetName = 'Sheet1'): void {
  const serializable = rows.map((row) => {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      if (Array.isArray(value)) {
        out[key] = value.join(', ');
      } else if (typeof value === 'boolean') {
        out[key] = value ? 'TRUE' : 'FALSE';
      } else {
        out[key] = value ?? '';
      }
    }
    return out;
  });
  const sheet = XLSX.utils.json_to_sheet(serializable);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
  XLSX.writeFile(workbook, filename);
}

export async function parseExcelFile(file: File): Promise<Record<string, string>[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { raw: false, defval: '' });
}

export function parseBoolCell(value: string): boolean {
  return value.trim().toUpperCase() === 'TRUE';
}

export function parseListCell(value: string): string[] {
  return value.split(',').map((s) => s.trim()).filter(Boolean);
}

export function parseNumberCell(value: string): number {
  return Number(value) || 0;
}
```

(`{ raw: false, defval: '' }` on `sheet_to_json` forces every cell to a
string — including numbers and native Excel booleans — so every tab's
import handler parses with the same `parseNumberCell`/`parseBoolCell`/
`parseListCell` helpers regardless of how the cell was typed in Excel,
avoiding a mix of `string | number | boolean` per field.)

### `package.json`

Add `"xlsx": "^0.18.5"` to `dependencies`. Run `npm install xlsx` (no
other dependency changes).

## Frontend: `ReferencePage.tsx`

### Imports

Replace the static imports:

```typescript
import { refAirports as airports, refCountries as countries, refCountryRules as countryRules, refAircraft as aircraft, refProviders as providers, getServiceTypes, saveServiceType, getLegPurposes, saveLegPurpose } from '@/lib/dataStore';
```

with:

```typescript
import {
  getAirportList, getCountryList, getAircraftList, getProviderList,
  getCountryRuleList, saveCountryRule, deleteCountryRule,
  getServiceTypes, saveServiceType, getLegPurposes, saveLegPurpose,
} from '@/lib/dataStore';
import { useTextFilter } from '@/hooks/useTextFilter';
import { exportToExcel, parseExcelFile, parseBoolCell, parseListCell, parseNumberCell } from '@/lib/excelIO';
```

Add `CountryRule` to the existing `import type { ServiceTypeDef,
LegPurposeDef } from '@/data/types';` line. Add `Download, Upload` to the
existing `lucide-react` icon import.

### Per-tab state (added inside the `ReferencePage` component, alongside
the existing `serviceTypes`/`legPurposes` state)

```typescript
const airports = getAirportList();
const countries = getCountryList();
const aircraft = getAircraftList();
const providers = getProviderList();

const [countryRules, setCountryRules] = useState<CountryRule[]>([]);
const [editingRule, setEditingRule] = useState<CountryRule | null>(null);
const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
const reloadCountryRules = () => setCountryRules(getCountryRuleList());
useEffect(reloadCountryRules, []);

const openNewRule = () => { setEditingRule({ ID: 0, CountryISO2: countries[0]?.ISO2 || '', ServiceType: 'Permit', LeadTimeHours: 24, WorkingDaysOnly: false, ToleranceHours: 0, ExceptionAirports: [], DocsRequired: [], Notes: '' }); setRuleDialogOpen(true); };
const openEditRule = (rule: CountryRule) => { setEditingRule({ ...rule }); setRuleDialogOpen(true); };

const saveEditingRule = async () => {
  if (!editingRule || !editingRule.CountryISO2 || !editingRule.ServiceType) return;
  await saveCountryRule(editingRule.ID ? editingRule : { ...editingRule, ID: undefined });
  setRuleDialogOpen(false);
  setEditingRule(null);
  reloadCountryRules();
};

const deleteRule = async (rule: CountryRule) => {
  await deleteCountryRule(rule.ID);
  reloadCountryRules();
};

const airportFilter = useTextFilter(airports, (a) => `${a.ICAO} ${a.IATA} ${a.Name} ${a.City}`);
const countryFilter = useTextFilter(countries, (c) => `${c.Name} ${c.ISO2} ${c.Region}`);
const ruleFilter = useTextFilter(countryRules, (r) => `${countries.find((c) => c.ISO2 === r.CountryISO2)?.Name || r.CountryISO2} ${r.ServiceType}`);
const aircraftFilter = useTextFilter(aircraft, (a) => `${a.Registration} ${a.ICAOType} ${a.Manufacturer}`);
const providerFilter = useTextFilter(providers, (p) => `${p.Name} ${p.ProviderID} ${p.Scope}`);
const serviceTypeFilter = useTextFilter(serviceTypes, (s) => `${s.code} ${s.label} ${s.category}`);
const legPurposeFilter = useTextFilter(legPurposes, (p) => `${p.code} ${p.label}`);
```

(`saveCountryRule(editingRule.ID ? editingRule : { ...editingRule, ID:
undefined })` — a new rule's placeholder `ID: 0` from `openNewRule` must
not be sent as a real ID on create; spreading `ID: undefined` makes
`saveCountryRule`'s `r.ID ? PATCH : POST` branch correctly choose POST.)

### Per-tab UI addition (repeated pattern — shown once for Airports,
identical shape for every other tab)

Each `TabsContent`'s `CardHeader` gains a search input and two buttons;
each replaces its row-source array with the tab's filtered list. For
Airports:

```tsx
<TabsContent value="airports">
  <Card>
    <CardHeader className="flex flex-row items-center justify-between space-y-0">
      <CardTitle className="text-base font-semibold flex items-center gap-2">
        <Plane className="h-4 w-4" /> Airports
      </CardTitle>
      <div className="flex items-center gap-2">
        <Input placeholder="Search airports..." value={airportFilter.query} onChange={(e) => airportFilter.setQuery(e.target.value)} className="h-9 w-56" />
        <Button size="sm" variant="outline" onClick={() => exportToExcel(airports, 'airports.xlsx', 'Airports')}>
          <Download className="h-4 w-4" /> Download
        </Button>
        <label className="inline-flex">
          <input
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const rows = await parseExcelFile(file);
              let ok = 0; const errors: string[] = [];
              for (const [i, row] of rows.entries()) {
                try {
                  await saveAirport({
                    ICAO: row.ICAO, IATA: row.IATA, Name: row.Name, City: row.City,
                    CountryISO2: row.CountryISO2, TZ: row.TZ,
                    Latitude: parseNumberCell(row.Latitude), Longitude: parseNumberCell(row.Longitude),
                    ElevationFt: parseNumberCell(row.ElevationFt), RunwayLengthFt: parseNumberCell(row.RunwayLengthFt),
                    Category: row.Category, FBOCount: parseNumberCell(row.FBOCount),
                  });
                  ok++;
                } catch (err) {
                  errors.push(`Row ${i + 2}: ${err instanceof Error ? err.message : 'failed'}`);
                }
              }
              alert(`${ok} imported${errors.length ? `, ${errors.length} failed:\n${errors.join('\n')}` : ''}`);
              e.target.value = '';
            }}
          />
          <span className="inline-flex h-9 cursor-pointer items-center gap-1 rounded-md border border-dashed px-3 text-xs text-muted-foreground hover:bg-muted">
            <Upload className="h-3.5 w-3.5" /> Upload
          </span>
        </label>
      </div>
    </CardHeader>
    <CardContent className="p-0">
      <Table>
        {/* unchanged TableHeader */}
        <TableBody>
          {airportFilter.filtered.map(ap => (
            /* unchanged row JSX, sourced from airportFilter.filtered instead of airports */
          ))}
        </TableBody>
      </Table>
    </CardContent>
  </Card>
</TabsContent>
```

Add `saveAirport` to the `@/lib/dataStore` import list (it already exists
in `dataStore.ts`, used today only by `AdminAssets.tsx` — this is the
first `ReferencePage.tsx` call site).

The same shape applies to every other tab, with these per-tab specifics:

- **Countries**: `exportToExcel(countries, 'countries.xlsx', 'Countries')`;
  row source `countryFilter.filtered`; import calls `saveCountry` with
  `{ Name: row.Name, ISO2: row.ISO2, Region: row.Region,
  OverflightPermitRequired: parseBoolCell(row.OverflightPermitRequired),
  LandingPermitRequired: parseBoolCell(row.LandingPermitRequired),
  AOCDocsRequired: parseBoolCell(row.AOCDocsRequired),
  EscalationContact: row.EscalationContact,
  CentroidLat: parseNumberCell(row.CentroidLat), CentroidLng:
  parseNumberCell(row.CentroidLng) }`. Add `saveCountry` to the dataStore
  import list.
- **Country Rules**: this tab additionally needs its Add/Edit dialog (see
  below) since it previously had none. `exportToExcel(countryRules,
  'country-rules.xlsx', 'CountryRules')`; row source
  `ruleFilter.filtered`; import calls `saveCountryRule` with
  `{ CountryISO2: row.CountryISO2, ServiceType: row.ServiceType,
  LeadTimeHours: parseNumberCell(row.LeadTimeHours), WorkingDaysOnly:
  parseBoolCell(row.WorkingDaysOnly), ToleranceHours:
  parseNumberCell(row.ToleranceHours), ExceptionAirports:
  parseListCell(row.ExceptionAirports), DocsRequired:
  parseListCell(row.DocsRequired), Notes: row.Notes }` (note: `ID` is
  never read from the import row — every imported row is treated as a
  new rule via `saveCountryRule`'s POST branch, since a re-imported
  export's `ID` column would otherwise cause an update-by-guessed-ID;
  this means re-uploading an unmodified Country Rules export creates
  duplicates rather than updating in place — call this out to the user
  in the button's title text: `title="Creates new rules; does not update
  existing ones by ID"`. This is an accepted, explicit limitation for
  this one tab, not a bug — see Design decisions above for why
  `CountryRule` has no natural single-column business key the way every
  other entity does (ICAO, ISO2, Registration, ProviderID, code) to
  upsert against.).
- **Aircraft**: `exportToExcel(aircraft, 'aircraft.xlsx', 'Aircraft')`;
  row source `aircraftFilter.filtered`; import calls `saveAircraft` with
  `{ Registration: row.Registration, ICAOType: row.ICAOType, Manufacturer:
  row.Manufacturer, MTOW_kg: parseNumberCell(row.MTOW_kg), NoiseCert:
  row.NoiseCert, SerialNumber: row.SerialNumber || undefined,
  CurrentOperatorID: row.CurrentOperatorID, Colors: row.Colors ||
  undefined, OperationType: row.OperationType || undefined,
  MaxRangeOverrideNm: row.MaxRangeOverrideNm ? parseNumberCell(row.MaxRangeOverrideNm) : undefined,
  FuelBurnOverrideKgPerHour: row.FuelBurnOverrideKgPerHour ? parseNumberCell(row.FuelBurnOverrideKgPerHour) : undefined }`.
- **Providers**: `exportToExcel(providers.map(({ Contacts, ...rest }) => rest), 'providers.xlsx', 'Providers')`
  (excludes `Contacts` per the Design decisions section — spread-omit
  before export); row source `providerFilter.filtered`; import calls
  `saveProvider` with `{ ProviderID: row.ProviderID, Name: row.Name,
  ServiceTypes: parseListCell(row.ServiceTypes), ScopeType: row.ScopeType
  as Provider['ScopeType'], Scope: row.Scope, Email: row.Email ||
  undefined, AOGContact: row.AOGContact || undefined, WorkingHoursZ:
  row.WorkingHoursZ || undefined, Contacts: [] }` (`Contacts: []` is a
  type-satisfying placeholder only — confirmed against `saveProvider`'s
  actual body construction that it never includes `contacts` in the
  PATCH/POST body at all today, so this value is never sent and existing
  contacts on an already-existing provider are always preserved,
  regardless of what's passed here).
- **Service Types**: `exportToExcel(serviceTypes, 'service-types.xlsx', 'ServiceTypes')`
  (existing `saveServiceType` already handles create-or-update by `code`,
  so import is a true upsert here); row source
  `serviceTypeFilter.filtered`; import calls `saveServiceType` with
  `{ code: row.code, label: row.label, category: row.category as
  ServiceTypeDef['category'], active: parseBoolCell(row.active),
  sortOrder: parseNumberCell(row.sortOrder) }` (the `variants` field is
  excluded from the round-trip for the same nested-array reason as
  `Provider.Contacts`).
- **Leg Purposes**: `exportToExcel(legPurposes, 'leg-purposes.xlsx', 'LegPurposes')`;
  row source `legPurposeFilter.filtered`; import calls `saveLegPurpose`
  with `{ code: row.code, label: row.label, active:
  parseBoolCell(row.active), sortOrder: parseNumberCell(row.sortOrder) }`
  (true upsert-by-code, same as Service Types).

### Country Rules Add/Edit dialog (new)

Add to the `rules` `TabsContent`, mirroring the existing Service
Types/Leg Purposes dialogs exactly in structure:

```tsx
<Dialog open={ruleDialogOpen} onOpenChange={(v) => !v && setRuleDialogOpen(false)}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>{editingRule?.ID ? 'Edit Country Rule' : 'New Country Rule'}</DialogTitle>
    </DialogHeader>
    {editingRule && (
      <div className="space-y-4">
        <div>
          <Label>Country</Label>
          <Select value={editingRule.CountryISO2} onValueChange={(v) => setEditingRule({ ...editingRule, CountryISO2: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {countries.map((c) => <SelectItem key={c.ISO2} value={c.ISO2}>{c.Name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Service Type</Label>
          <Select value={editingRule.ServiceType} onValueChange={(v) => setEditingRule({ ...editingRule, ServiceType: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {serviceTypes.map((s) => <SelectItem key={s.code} value={s.code}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Lead Time (hours)</Label>
          <Input type="number" value={editingRule.LeadTimeHours} onChange={(e) => setEditingRule({ ...editingRule, LeadTimeHours: Number(e.target.value) || 0 })} />
        </div>
        <div>
          <Label>Tolerance (hours)</Label>
          <Input type="number" value={editingRule.ToleranceHours} onChange={(e) => setEditingRule({ ...editingRule, ToleranceHours: Number(e.target.value) || 0 })} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={editingRule.WorkingDaysOnly} onChange={(e) => setEditingRule({ ...editingRule, WorkingDaysOnly: e.target.checked })} />
          Working days only
        </label>
        <div>
          <Label>Notes</Label>
          <Input value={editingRule.Notes || ''} onChange={(e) => setEditingRule({ ...editingRule, Notes: e.target.value })} />
        </div>
      </div>
    )}
    <DialogFooter>
      <Button variant="outline" onClick={() => setRuleDialogOpen(false)}>Cancel</Button>
      <Button onClick={saveEditingRule} disabled={!isAdmin || !editingRule?.CountryISO2 || !editingRule?.ServiceType}>Save</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

(`ExceptionAirports`/`DocsRequired` are left editable only via Excel
import/export in this first pass — the manual dialog covers the fields
an admin is most likely to hand-tweak one row at a time; the two array
fields are exactly the kind of bulk-list data Excel is a better editing
surface for than a dialog text box. This matches the `Provider.Contacts`/
`ServiceTypeDef.variants` precedent of "some fields are Excel-only.")

The `rules` `TabsContent`'s `CardHeader` also gets an "Add Rule" button
(`disabled={!isAdmin}`, calling `openNewRule`), matching the Service
Types/Leg Purposes header pattern, and each row gains Edit/Delete buttons
(`disabled={!isAdmin}`), matching those tabs' row action pattern.

## Testing

No test framework in this project — manual verification:

```powershell
npm install xlsx
npm run build
npm run start:prod
# 1. Open Reference Data → Airports/Countries/Aircraft/Providers tabs —
#    confirm they now show the SAME data as Assets' corresponding tabs
#    (edit a row in Assets, confirm it appears updated in Reference Data
#    after a refresh — proves both read the same live cache).
# 2. Search box on each tab — type a partial match, confirm the table
#    filters live with no page reload.
# 3. Download on each tab — confirm a real .xlsx file downloads, opens in
#    Excel/LibreOffice, and every field of that tab's type appears as a
#    column with correct values (including TRUE/FALSE for booleans and
#    comma-separated text for array fields).
# 4. Edit a downloaded Airports.xlsx (change one airport's TZ), re-upload
#    — confirm the summary reports 1 success (or N, if you left every row
#    in the file), and that airport's TZ is updated in the table without
#    creating a duplicate row (proves upsert-by-ICAO works).
# 5. Country Rules tab: confirm it now has an "Add Rule" button and each
#    row has Edit/Delete — create one via the dialog, edit it, delete it.
#    Confirm GET /api/reference/country-rules reflects each change.
# 6. Upload an unmodified Country Rules export — confirm it creates
#    duplicate rows (the documented limitation), not an error.
# 7. Upload a file with one intentionally broken row (e.g. blank ICAO)
#    among valid ones on the Airports tab — confirm the summary reports
#    partial success or failure, not an all-or-nothing abort, without needing
#    a page reload to see the valid rows landed.
```

## Out of scope

- Server-side pagination, search, or filter query params — client-side
  is sufficient at current data volumes; revisit only if a tab's row
  count grows by an order of magnitude.
- `Provider.Contacts` and `ServiceTypeDef.variants` round-tripping
  through Excel — stay dialog-only edits.
- Upsert-by-natural-key for Country Rules — no single-column key exists
  for this entity; import always creates. A future slice could add a
  dedicated "match by CountryISO2+ServiceType, prompt on conflict" import
  mode if this limitation proves painful in practice.
- Any change to `AdminAssets.tsx` — it already reads/writes the same live
  cache this spec wires `ReferencePage.tsx` onto; no changes needed there.
- CSV support — `.xlsx` only, per the user's literal wording ("excel
  down/upload").

## Do not

- Do not `git commit`.
- Do not make Excel import destructive — a row missing from an uploaded
  file must never be deleted. Only the existing per-row Delete button
  deletes.
- Do not add a Country Rules tab to `AdminAssets.tsx` — its CRUD lives in
  `ReferencePage.tsx`, matching Service Types/Leg Purposes.
- Do not abort an entire import batch because one row is invalid —
  process rows independently and report a per-row summary.
- Do not flatten `Provider.Contacts` into a spreadsheet cell — it's
  explicitly excluded from the Excel round-trip.
