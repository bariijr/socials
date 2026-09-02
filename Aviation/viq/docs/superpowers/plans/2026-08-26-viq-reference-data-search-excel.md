# VIQ Reference Data Search/Filter/Excel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `ReferencePage.tsx` becomes the single live view of all 7 reference catalogs (Airports, Countries, Country Rules, Aircraft, Providers, Service Types, Leg Purposes), each with a text search box and Excel download/upload. Country Rules gains full CRUD (previously read-only-static) via a new dialog.

**Architecture:** 4 of 5 currently-static tabs (Airports, Countries, Aircraft, Providers) switch from static-JSON imports to the same live, cached getters `AdminAssets.tsx` already uses (`getAirportList()`, etc. — no new backend work). Country Rules gets brand-new CRUD mirroring the existing `CountryFee` pattern exactly (DTOs, service, controller, cache). Two new shared frontend utilities (`useTextFilter` hook, `excelIO` lib using the new `xlsx` package) are consumed identically by all 7 tabs. Excel import drives the same `save*` functions already used by manual edits — no new backend routes for import/export itself.

**Tech Stack:** New dependency: `xlsx` (SheetJS) for client-side Excel read/write. Everything else reuses existing NestJS/Prisma/React/Vite infrastructure.

**Spec:** `docs/superpowers/specs/2026-08-26-viq-reference-data-search-excel-design.md`

## Global Constraints

- Do NOT `git commit` any of this work — explicit user instruction, carried over from every prior sub-project in this session.
- Excel import is **upsert-only, never deletes** — a row missing from an uploaded file must never cause a delete. Deletion stays a manual, deliberate action via the existing per-row Delete/Deactivate button.
- Import processes rows **independently, not as one atomic transaction** — a bad row is skipped and reported; the rest still import. Show a per-row summary after import (success count + failure list with reasons).
- Export includes **every field of the corresponding frontend type** (not just displayed columns) so download → edit → re-upload round-trips losslessly, with one exception: `Provider.Contacts` and `ServiceTypeDef.variants` (nested array-of-objects fields) are excluded from the Excel round-trip — dialog-only edits.
- Array fields serialize as a single comma-separated cell. Boolean fields serialize as literal `TRUE`/`FALSE` text.
- Country Rules CRUD lives in `ReferencePage.tsx`, not `AdminAssets.tsx` — do not add a Country Rules tab to `AdminAssets.tsx`.
- Country Rules writes are `@Roles('Admin')`-gated, matching every other write route in `reference.controller.ts` today.
- Country Rules import always creates new rows (no natural single-column key to upsert against) — this is an accepted, documented limitation, not a bug to fix in this plan.
- `dataStore.ts` has `// @ts-nocheck`. `ReferencePage.tsx` does NOT — real type-checking applies.
- No test framework in this project — verification is manual (build + live browser/API walkthrough).

---

### Task 1: Backend — Country Rules CRUD

**Files:**
- Create: `src/server/modules/reference/dto/create-country-rule.dto.ts`
- Create: `src/server/modules/reference/dto/update-country-rule.dto.ts`
- Modify: `src/server/modules/reference/reference.service.ts`
- Modify: `src/server/modules/reference/reference.controller.ts`

**Interfaces:**
- Produces: `POST /reference/country-rules`, `PATCH /reference/country-rules/:id`, `DELETE /reference/country-rules/:id` (all `@Roles('Admin')`). Response shape for all three: the raw `CountryRule` Prisma row (`id, countryIso2, serviceType, leadTimeHours, workingDaysOnly, toleranceHours, exceptionAirports, docsRequired, notes`).

- [ ] **Step 1: Create `create-country-rule.dto.ts`**

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

- [ ] **Step 2: Create `update-country-rule.dto.ts`**

```typescript
import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateCountryRuleDto } from './create-country-rule.dto';

export class UpdateCountryRuleDto extends PartialType(OmitType(CreateCountryRuleDto, ['countryIso2', 'serviceType'] as const)) {}
```

- [ ] **Step 3: Add the three methods to `reference.service.ts`**

Add these imports to the top of `reference.service.ts`, alongside the existing `CreateCountryFeeDto`/`UpdateCountryFeeDto` imports:

```typescript
import { CreateCountryRuleDto } from './dto/create-country-rule.dto';
import { UpdateCountryRuleDto } from './dto/update-country-rule.dto';
```

Add these three methods immediately after the existing `countryRule(countryIso2, serviceType)` method:

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

(`NotFoundException` is already imported in this file — used by the existing `deleteCountryFee` method. `this.audit` is already available via this service's constructor.)

- [ ] **Step 4: Add the three routes to `reference.controller.ts`**

Add these imports to the top of `reference.controller.ts`, alongside the existing `CreateCountryFeeDto`/`UpdateCountryFeeDto` imports:

```typescript
import { CreateCountryRuleDto } from './dto/create-country-rule.dto';
import { UpdateCountryRuleDto } from './dto/update-country-rule.dto';
```

Add these three routes immediately after the existing `@Get('country-rules')` route:

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

(`Roles` is already imported in this file — used by every other write route.)

- [ ] **Step 5: Verify — build**

Run: `npm run build:server`. Expect 0 exit.

- [ ] **Step 6: Verify — live API check**

Start the stack (`npm run start:prod` after `npm run build`), mint or obtain a bearer token, then:

```powershell
# Create
curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"countryIso2":"US","serviceType":"Permit","leadTimeHours":48,"user":"test"}' http://localhost:4001/api/reference/country-rules
# Expect: 201, JSON body with the new rule including its generated "id".

# Update (use the id from the create response)
curl -X PATCH -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"leadTimeHours":72}' http://localhost:4001/api/reference/country-rules/<id>
# Expect: 200, leadTimeHours now 72.

# Delete
curl -X DELETE -H "Authorization: Bearer $TOKEN" "http://localhost:4001/api/reference/country-rules/<id>?user=test"
# Expect: 200, {"id":<id>,"deleted":true}.

# Confirm gone
curl -H "Authorization: Bearer $TOKEN" http://localhost:4001/api/reference/country-rules
# Expect: the deleted id is absent from the list.
```

Delete the test row if the delete step above didn't already remove it, so no test data is left behind.

- [ ] **Step 7: Snapshot (no git commit)**

---

### Task 2: Frontend — `types.ts` and `dataStore.ts`

**Files:**
- Modify: `src/client/data/types.ts`
- Modify: `src/client/lib/dataStore.ts`

**Interfaces:**
- Consumes: `POST/PATCH/DELETE /reference/country-rules*` from Task 1.
- Produces: `CountryRule` (extended type, in `types.ts`), `getCountryRuleList(): CountryRule[]`, `saveCountryRule(r, user?): Promise<CountryRule>`, `deleteCountryRule(id, user?): Promise<void>` (in `dataStore.ts`), and `countryRules` now included in `preloadReferenceData()`'s cache population.

- [ ] **Step 1: Extend the `CountryRule` interface in `types.ts`**

Find the existing `CountryRule` interface:

```typescript
export interface CountryRule {
  CountryISO2: string;
  ServiceType: ServiceType;
  LeadTimeHours: number;
  WorkingDaysOnly: boolean;
  ToleranceHours: number;
  Notes: string;
}
```

Replace it with:

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

- [ ] **Step 2: Add the cache variable in `dataStore.ts`**

Find `let _countryFeeCache: CountryFee[] | null = null;` and add immediately after it:

```typescript
let _countryRuleCache: CountryRule[] | null = null;
```

- [ ] **Step 3: Add the mapper function**

Find `function mapCountryFeeFromApi(f: any): CountryFee { ... }` and add immediately after it:

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

- [ ] **Step 4: Wire `countryRules` into `preloadReferenceData()`**

Replace the full function:

```typescript
export async function preloadReferenceData(): Promise<void> {
  const [aircraft, providers, airports, countries, operators, messageTemplates, countryFees] = await Promise.all([
    apiJson<any[]>('/reference/aircraft'),
    apiJson<any[]>('/reference/providers'),
    apiJson<any[]>('/reference/airports'),
    apiJson<any[]>('/reference/countries'),
    apiJson<any[]>('/reference/operators'),
    apiJson<any[]>('/message-templates'),
    apiJson<any[]>('/reference/country-fees'),
  ]);
  _aircraftCache = aircraft.map(mapAircraftFromApi);
  _providerCache = providers.map(mapProviderFromApi);
  _airportCache = airports.map(mapAirportFromApi);
  _countryCache = countries.map(mapCountryFromApi);
  _operatorCache = operators.map(mapOperatorFromApi);
  _messageTemplateCache = messageTemplates.map(mapMessageTemplateFromApi);
  _countryFeeCache = countryFees.map(mapCountryFeeFromApi);
}
```

with:

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

- [ ] **Step 5: Add the CRUD functions**

Find `export function getCountryFeeList(): CountryFee[] { ... }` through the end of `deleteCountryFee` (ends with `_countryFeeCache = getCountryFeeList().filter((f) => f.ID !== id); }`), and add immediately after that block:

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

- [ ] **Step 6: Verify**

Run: `npx tsc -p tsconfig.client.json`. `dataStore.ts` never errors (`// @ts-nocheck`). Expect 0 new errors anywhere (nothing outside `dataStore.ts`/`types.ts` references `CountryRule` yet, so no downstream fallout at this point).

- [ ] **Step 7: Snapshot (no git commit)**

---

### Task 3: Frontend — shared utilities (`useTextFilter`, `excelIO`) and `xlsx` dependency

**Files:**
- Create: `src/client/hooks/useTextFilter.ts`
- Create: `src/client/lib/excelIO.ts`
- Modify: `package.json` (via `npm install`)

**Interfaces:**
- Produces: `useTextFilter<T>(rows: T[], getSearchableText: (row: T) => string): { query: string; setQuery: (q: string) => void; filtered: T[] }`. `exportToExcel(rows: Record<string, unknown>[], filename: string, sheetName?: string): void`. `parseExcelFile(file: File): Promise<Record<string, string>[]>`. `parseBoolCell(value: string): boolean`. `parseListCell(value: string): string[]`. `parseNumberCell(value: string): number`.

- [ ] **Step 1: Install `xlsx`**

Run: `npm install xlsx`. Expect `package.json`'s `dependencies` to gain `"xlsx": "^0.18.5"` (or whatever the installed version resolves to — do not hand-edit the version string, let `npm install` write it).

- [ ] **Step 2: Create `useTextFilter.ts`**

`src/client/hooks/useTextFilter.ts`:

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

- [ ] **Step 3: Create `excelIO.ts`**

`src/client/lib/excelIO.ts`:

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

- [ ] **Step 4: Verify**

Run: `npx tsc -p tsconfig.client.json`. Expect 0 errors (both new files are self-contained and unused so far — no downstream fallout yet).

- [ ] **Step 5: Snapshot (no git commit)**

---

### Task 4: Frontend — `ReferencePage.tsx` imports, shared state, Airports and Countries tabs

**Files:**
- Modify: `src/client/pages/ReferencePage.tsx`

**Interfaces:**
- Consumes: `getAirportList`, `getCountryList`, `getAircraftList`, `getProviderList`, `getCountryRuleList`, `saveAirport`, `saveCountry` (already exist in `dataStore.ts`; the first five are used today only by `AdminAssets.tsx`/nothing); `useTextFilter` (Task 3); `exportToExcel`, `parseExcelFile`, `parseBoolCell`, `parseNumberCell` (Task 3); `CountryRule` type (Task 2).
- Produces: `setRefreshKey` (a bump-to-force-a-re-render setter — see the note in Step 2 below — reused by Task 5's Aircraft tab and Task 6's Providers tab), `airports`, `countries`, `aircraft`, `providers` (live arrays), `countryRules` state + `reloadCountryRules` (a read-only live read for now — Task 5 adds create/edit/delete), `airportFilter`, `countryFilter` (`useTextFilter` instances).

**IMPORTANT — this project's `tsconfig.client.json` has `noUnusedLocals: true` and `noUnusedParameters: true`, AND the Aircraft/Providers/Country Rules `TabsContent` blocks are NOT touched by this task (Tasks 5/6 rewrite them) — their existing JSX still reads `aircraft`, `providers`, and `countryRules` by those exact names.** This task must therefore declare all four of `airports`/`countries`/`aircraft`/`providers`/`countryRules` (swapped onto live data) even though it only adds search/Excel UI to two of them — leaving any of the other three undeclared would break this task's own build, since the untouched original JSX below still references them. `parseListCell` (needed only by Country Rules import/Providers import, added in Tasks 5/6) and the `Provider` type (needed only by the Providers import handler, added in Task 6) are intentionally NOT imported in this task.

- [ ] **Step 1: Replace the file's import block**

Replace:

```typescript
import { useEffect, useState } from 'react';
import { refAirports as airports, refCountries as countries, refCountryRules as countryRules, refAircraft as aircraft, refProviders as providers, getServiceTypes, saveServiceType, getLegPurposes, saveLegPurpose } from '@/lib/dataStore';
import { useAuth } from '@/lib/authContext';
import type { ServiceTypeDef, LegPurposeDef } from '@/data/types';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plane, Globe, Clock, FileText, Fuel, Phone, Tag, Plus, ClipboardList } from 'lucide-react';
```

with:

```typescript
import { useEffect, useState } from 'react';
import {
  getAirportList, getCountryList, getAircraftList, getProviderList, getCountryRuleList,
  saveAirport, saveCountry,
  getServiceTypes, saveServiceType, getLegPurposes, saveLegPurpose,
} from '@/lib/dataStore';
import { useAuth } from '@/lib/authContext';
import type { ServiceTypeDef, LegPurposeDef, CountryRule } from '@/data/types';
import { useTextFilter } from '@/hooks/useTextFilter';
import { exportToExcel, parseExcelFile, parseBoolCell, parseNumberCell } from '@/lib/excelIO';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plane, Globe, Clock, FileText, Fuel, Phone, Tag, Plus, ClipboardList, Download, Upload } from 'lucide-react';
```

- [ ] **Step 2: Swap all five static tabs onto live data, add filter hooks for Airports/Countries**

Find the top of the `ReferencePage` component:

```typescript
export default function ReferencePage() {
  const { isAdmin } = useAuth();
  const [serviceTypes, setServiceTypes] = useState<ServiceTypeDef[]>([]);
```

Replace with:

```typescript
export default function ReferencePage() {
  const { isAdmin } = useAuth();
  // getAirportList()/getCountryList()/getAircraftList()/getProviderList()
  // read a module-level cache that saveAirport/saveCountry (and, from
  // Task 5/6 onward, saveAircraft/saveProvider) mutate directly (no
  // fetch/refetch involved) — this component has no other state tied to
  // that cache, so nothing forces a re-render after an Excel import
  // mutates it. setRefreshKey (called, never read) is a bump-to-force-a
  // re-render escape hatch so the next render's getXList() calls below
  // pick up the mutated cache.
  const [, setRefreshKey] = useState(0);
  const airports = getAirportList();
  const countries = getCountryList();
  const aircraft = getAircraftList();
  const providers = getProviderList();

  // Read-only for now — the Aircraft/Providers/Country Rules TabsContent
  // blocks below are untouched by this task and still read these three
  // variable names directly, so all three must exist even before this
  // task adds any UI for them. Task 5 adds create/edit/delete for
  // Country Rules; Tasks 5/6 add search+Excel UI for all three tabs.
  const [countryRules, setCountryRules] = useState<CountryRule[]>([]);
  const reloadCountryRules = () => setCountryRules(getCountryRuleList());

  const [serviceTypes, setServiceTypes] = useState<ServiceTypeDef[]>([]);
```

Find `const reloadServiceTypes = () => { getServiceTypes().then(setServiceTypes); };
  useEffect(reloadServiceTypes, []);` and add immediately after it:

```typescript
  useEffect(reloadCountryRules, []);
```

Find the end of the `legPurposes`-related block (immediately before the `return (` that starts the JSX):

```typescript
  const togglePurposeActive = async (def: LegPurposeDef) => {
    await saveLegPurpose({ ...def, active: !def.active });
    reloadLegPurposes();
  };

  return (
```

Replace with:

```typescript
  const togglePurposeActive = async (def: LegPurposeDef) => {
    await saveLegPurpose({ ...def, active: !def.active });
    reloadLegPurposes();
  };

  const airportFilter = useTextFilter(airports, (a) => `${a.ICAO} ${a.IATA} ${a.Name} ${a.City}`);
  const countryFilter = useTextFilter(countries, (c) => `${c.Name} ${c.ISO2} ${c.Region}`);

  return (
```

- [ ] **Step 3: Rewrite the Airports and Countries `TabsContent` blocks**

Replace the full `TabsContent value="airports"` block:

```tsx
        <TabsContent value="airports">
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Plane className="h-4 w-4" /> Airports
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ICAO</TableHead>
                    <TableHead>IATA</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Country</TableHead>
                    <TableHead>TZ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {airports.map(ap => (
                    <TableRow key={ap.ICAO}>
                      <TableCell className="font-mono font-bold">{ap.ICAO}</TableCell>
                      <TableCell className="font-mono">{ap.IATA}</TableCell>
                      <TableCell>{ap.Name}</TableCell>
                      <TableCell>{countries.find(c => c.ISO2 === ap.CountryISO2)?.Name || ap.CountryISO2}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{ap.TZ}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
```

with:

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
                      setRefreshKey((k) => k + 1);
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
                <TableHeader>
                  <TableRow>
                    <TableHead>ICAO</TableHead>
                    <TableHead>IATA</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Country</TableHead>
                    <TableHead>TZ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {airportFilter.filtered.map(ap => (
                    <TableRow key={ap.ICAO}>
                      <TableCell className="font-mono font-bold">{ap.ICAO}</TableCell>
                      <TableCell className="font-mono">{ap.IATA}</TableCell>
                      <TableCell>{ap.Name}</TableCell>
                      <TableCell>{countries.find(c => c.ISO2 === ap.CountryISO2)?.Name || ap.CountryISO2}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{ap.TZ}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
```

Replace the full `TabsContent value="countries"` block:

```tsx
        <TabsContent value="countries">
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Globe className="h-4 w-4" /> Countries
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>ISO2</TableHead>
                    <TableHead>Region</TableHead>
                    <TableHead>Overflight</TableHead>
                    <TableHead>Landing</TableHead>
                    <TableHead>AOC Docs</TableHead>
                    <TableHead>Escalation</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {countries.map(c => (
                    <TableRow key={c.ISO2}>
                      <TableCell className="font-medium">{c.Name}</TableCell>
                      <TableCell className="font-mono">{c.ISO2}</TableCell>
                      <TableCell>{c.Region}</TableCell>
                      <TableCell>
                        {c.OverflightPermitRequired ? (
                          <Badge variant="outline" className="border-red-300 text-red-700">Required</Badge>
                        ) : (
                          <Badge variant="outline" className="border-emerald-300 text-emerald-700">No</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {c.LandingPermitRequired ? (
                          <Badge variant="outline" className="border-red-300 text-red-700">Required</Badge>
                        ) : (
                          <Badge variant="outline" className="border-emerald-300 text-emerald-700">No</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {c.AOCDocsRequired ? (
                          <Badge variant="outline" className="border-amber-300 text-amber-700">Yes</Badge>
                        ) : (
                          <Badge variant="outline" className="border-emerald-300 text-emerald-700">No</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{c.EscalationContact}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
```

with:

```tsx
        <TabsContent value="countries">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Globe className="h-4 w-4" /> Countries
              </CardTitle>
              <div className="flex items-center gap-2">
                <Input placeholder="Search countries..." value={countryFilter.query} onChange={(e) => countryFilter.setQuery(e.target.value)} className="h-9 w-56" />
                <Button size="sm" variant="outline" onClick={() => exportToExcel(countries, 'countries.xlsx', 'Countries')}>
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
                          await saveCountry({
                            Name: row.Name, ISO2: row.ISO2, Region: row.Region,
                            OverflightPermitRequired: parseBoolCell(row.OverflightPermitRequired),
                            LandingPermitRequired: parseBoolCell(row.LandingPermitRequired),
                            AOCDocsRequired: parseBoolCell(row.AOCDocsRequired),
                            EscalationContact: row.EscalationContact,
                            CentroidLat: parseNumberCell(row.CentroidLat), CentroidLng: parseNumberCell(row.CentroidLng),
                          });
                          ok++;
                        } catch (err) {
                          errors.push(`Row ${i + 2}: ${err instanceof Error ? err.message : 'failed'}`);
                        }
                      }
                      alert(`${ok} imported${errors.length ? `, ${errors.length} failed:\n${errors.join('\n')}` : ''}`);
                      e.target.value = '';
                      setRefreshKey((k) => k + 1);
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
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>ISO2</TableHead>
                    <TableHead>Region</TableHead>
                    <TableHead>Overflight</TableHead>
                    <TableHead>Landing</TableHead>
                    <TableHead>AOC Docs</TableHead>
                    <TableHead>Escalation</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {countryFilter.filtered.map(c => (
                    <TableRow key={c.ISO2}>
                      <TableCell className="font-medium">{c.Name}</TableCell>
                      <TableCell className="font-mono">{c.ISO2}</TableCell>
                      <TableCell>{c.Region}</TableCell>
                      <TableCell>
                        {c.OverflightPermitRequired ? (
                          <Badge variant="outline" className="border-red-300 text-red-700">Required</Badge>
                        ) : (
                          <Badge variant="outline" className="border-emerald-300 text-emerald-700">No</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {c.LandingPermitRequired ? (
                          <Badge variant="outline" className="border-red-300 text-red-700">Required</Badge>
                        ) : (
                          <Badge variant="outline" className="border-emerald-300 text-emerald-700">No</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {c.AOCDocsRequired ? (
                          <Badge variant="outline" className="border-amber-300 text-amber-700">Yes</Badge>
                        ) : (
                          <Badge variant="outline" className="border-emerald-300 text-emerald-700">No</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{c.EscalationContact}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
```

- [ ] **Step 4: Verify — build**

Run: `npx tsc -p tsconfig.client.json`. Expect 0 errors — every import and declaration added in this task is consumed by this task's own Step 2/Step 3 changes, so this task must build clean entirely on its own.

- [ ] **Step 5: Snapshot (no git commit)**

---

### Task 5: Frontend — `ReferencePage.tsx` Country Rules and Aircraft tabs

**Files:**
- Modify: `src/client/pages/ReferencePage.tsx`

**Interfaces:**
- Consumes: `airports`, `countries`, `aircraft`, `countryRules`, `setCountryRules`, `reloadCountryRules`, `airportFilter`, `countryFilter`, `setRefreshKey`, `serviceTypes` — all from Task 4 (already present in the file; `aircraft` and `countryRules`/`reloadCountryRules` were declared by Task 4 to satisfy this task's and Task 4's own untouched original JSX, and `CountryRule` is already imported by Task 4). `saveCountryRule`, `deleteCountryRule` (Task 2). `saveAircraft` (already exists in `dataStore.ts`, used today only by `AdminAssets.tsx`). `parseListCell` (Task 3).
- Produces: `editingRule`/`ruleDialogOpen` state + `openNewRule`/`openEditRule`/`saveEditingRule`/`deleteRule` handlers, `ruleFilter`, `aircraftFilter` (`useTextFilter` instances) — all reused by no later task (Task 6 has its own, separate set).

**IMPORTANT — same `noUnusedLocals`/`noUnusedParameters: true` constraint as Task 4.** This task must build clean entirely on its own. Do NOT redeclare `aircraft`, `countryRules`, or `reloadCountryRules` — Task 4 already declared them; this task only adds to the import block and adds new state alongside what's already there.

- [ ] **Step 1: Add imports and state for Country Rules CRUD and Aircraft**

Find the `@/lib/dataStore` import block Task 4 left:

```typescript
import {
  getAirportList, getCountryList, getAircraftList, getProviderList, getCountryRuleList,
  saveAirport, saveCountry,
  getServiceTypes, saveServiceType, getLegPurposes, saveLegPurpose,
} from '@/lib/dataStore';
```

Replace with:

```typescript
import {
  getAirportList, getCountryList, getAircraftList, getProviderList, getCountryRuleList,
  saveAirport, saveCountry, saveAircraft, saveCountryRule, deleteCountryRule,
  getServiceTypes, saveServiceType, getLegPurposes, saveLegPurpose,
} from '@/lib/dataStore';
```

Find `import { exportToExcel, parseExcelFile, parseBoolCell, parseNumberCell } from '@/lib/excelIO';` and replace with:

```typescript
import { exportToExcel, parseExcelFile, parseBoolCell, parseListCell, parseNumberCell } from '@/lib/excelIO';
```

(The `@/data/types` import already includes `CountryRule` from Task 4 — no change needed to that line.)

Find the state block Task 4 left (immediately after the `reloadCountryRules` line, before the `serviceTypes` state):

```typescript
  const [countryRules, setCountryRules] = useState<CountryRule[]>([]);
  const reloadCountryRules = () => setCountryRules(getCountryRuleList());

  const [serviceTypes, setServiceTypes] = useState<ServiceTypeDef[]>([]);
```

Replace with:

```typescript
  const [countryRules, setCountryRules] = useState<CountryRule[]>([]);
  const [editingRule, setEditingRule] = useState<CountryRule | null>(null);
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
  const reloadCountryRules = () => setCountryRules(getCountryRuleList());

  const [serviceTypes, setServiceTypes] = useState<ServiceTypeDef[]>([]);
```

Find the `airportFilter`/`countryFilter` declarations Task 4 left, immediately before `return (`:

```typescript
  const airportFilter = useTextFilter(airports, (a) => `${a.ICAO} ${a.IATA} ${a.Name} ${a.City}`);
  const countryFilter = useTextFilter(countries, (c) => `${c.Name} ${c.ISO2} ${c.Region}`);

  return (
```

Replace with:

```typescript
  const airportFilter = useTextFilter(airports, (a) => `${a.ICAO} ${a.IATA} ${a.Name} ${a.City}`);
  const countryFilter = useTextFilter(countries, (c) => `${c.Name} ${c.ISO2} ${c.Region}`);

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

  const ruleFilter = useTextFilter(countryRules, (r) => `${countries.find((c) => c.ISO2 === r.CountryISO2)?.Name || r.CountryISO2} ${r.ServiceType}`);
  const aircraftFilter = useTextFilter(aircraft, (a) => `${a.Registration} ${a.ICAOType} ${a.Manufacturer}`);

  return (
```

- [ ] **Step 2: Rewrite the Country Rules `TabsContent` block**

Replace the full `TabsContent value="rules"` block:

```tsx
        <TabsContent value="rules">
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <FileText className="h-4 w-4" /> Country Rules — Lead Times & Tolerances
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Country</TableHead>
                    <TableHead>Service Type</TableHead>
                    <TableHead>Lead Time</TableHead>
                    <TableHead>Working Days</TableHead>
                    <TableHead>Tolerance</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {countryRules.map((rule, idx) => {
                    const country = countries.find(c => c.ISO2 === rule.CountryISO2);
                    return (
                      <TableRow key={idx}>
                        <TableCell className="font-medium">{country?.Name || rule.CountryISO2}</TableCell>
                        <TableCell>{rule.ServiceType}</TableCell>
                        <TableCell>{rule.LeadTimeHours}h</TableCell>
                        <TableCell>
                          {rule.WorkingDaysOnly ? (
                            <Badge variant="outline" className="border-amber-300 text-amber-700">Yes</Badge>
                          ) : (
                            <Badge variant="outline" className="border-emerald-300 text-emerald-700">No</Badge>
                          )}
                        </TableCell>
                        <TableCell>{rule.ToleranceHours}h</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{rule.Notes}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
```

with:

```tsx
        <TabsContent value="rules">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <FileText className="h-4 w-4" /> Country Rules — Lead Times & Tolerances
              </CardTitle>
              <div className="flex items-center gap-2">
                <Input placeholder="Search rules..." value={ruleFilter.query} onChange={(e) => ruleFilter.setQuery(e.target.value)} className="h-9 w-56" />
                <Button size="sm" variant="outline" onClick={() => exportToExcel(countryRules, 'country-rules.xlsx', 'CountryRules')}>
                  <Download className="h-4 w-4" /> Download
                </Button>
                <label className="inline-flex">
                  <input
                    type="file"
                    accept=".xlsx"
                    className="hidden"
                    title="Creates new rules; does not update existing ones by ID"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const rows = await parseExcelFile(file);
                      let ok = 0; const errors: string[] = [];
                      for (const [i, row] of rows.entries()) {
                        try {
                          await saveCountryRule({
                            CountryISO2: row.CountryISO2, ServiceType: row.ServiceType,
                            LeadTimeHours: parseNumberCell(row.LeadTimeHours), WorkingDaysOnly: parseBoolCell(row.WorkingDaysOnly),
                            ToleranceHours: parseNumberCell(row.ToleranceHours),
                            ExceptionAirports: parseListCell(row.ExceptionAirports), DocsRequired: parseListCell(row.DocsRequired),
                            Notes: row.Notes,
                          });
                          ok++;
                        } catch (err) {
                          errors.push(`Row ${i + 2}: ${err instanceof Error ? err.message : 'failed'}`);
                        }
                      }
                      alert(`${ok} imported${errors.length ? `, ${errors.length} failed:\n${errors.join('\n')}` : ''}`);
                      e.target.value = '';
                      reloadCountryRules();
                    }}
                  />
                  <span title="Creates new rules; does not update existing ones by ID" className="inline-flex h-9 cursor-pointer items-center gap-1 rounded-md border border-dashed px-3 text-xs text-muted-foreground hover:bg-muted">
                    <Upload className="h-3.5 w-3.5" /> Upload
                  </span>
                </label>
                <Button size="sm" variant="outline" disabled={!isAdmin} onClick={() => isAdmin && openNewRule()}><Plus className="h-4 w-4" /> Add Rule</Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Country</TableHead>
                    <TableHead>Service Type</TableHead>
                    <TableHead>Lead Time</TableHead>
                    <TableHead>Working Days</TableHead>
                    <TableHead>Tolerance</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ruleFilter.filtered.map((rule) => {
                    const country = countries.find(c => c.ISO2 === rule.CountryISO2);
                    return (
                      <TableRow key={rule.ID}>
                        <TableCell className="font-medium">{country?.Name || rule.CountryISO2}</TableCell>
                        <TableCell>{rule.ServiceType}</TableCell>
                        <TableCell>{rule.LeadTimeHours}h</TableCell>
                        <TableCell>
                          {rule.WorkingDaysOnly ? (
                            <Badge variant="outline" className="border-amber-300 text-amber-700">Yes</Badge>
                          ) : (
                            <Badge variant="outline" className="border-emerald-300 text-emerald-700">No</Badge>
                          )}
                        </TableCell>
                        <TableCell>{rule.ToleranceHours}h</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{rule.Notes}</TableCell>
                        <TableCell className="flex gap-2">
                          <Button size="sm" variant="outline" disabled={!isAdmin} onClick={() => isAdmin && openEditRule(rule)}>Edit</Button>
                          <Button size="sm" variant="outline" disabled={!isAdmin} onClick={() => isAdmin && deleteRule(rule)}>Delete</Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

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
        </TabsContent>
```

(`ServiceType` in `editingRule.ServiceType` and the `<Select>` value/`onValueChange` are plain strings here, matching how `CountryRule.ServiceType` is typed as the `ServiceType` alias (`= string`) elsewhere in this codebase — no cast needed.)

- [ ] **Step 3: Rewrite the Aircraft `TabsContent` block**

Replace the full `TabsContent value="aircraft"` block:

```tsx
        <TabsContent value="aircraft">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {aircraft.map(ac => (
              <Card key={ac.Registration}>
                <CardContent className="p-5">
                  <div className="mb-2 flex items-center gap-2">
                    <Plane className="h-5 w-5 text-primary" />
                    <h3 className="text-lg font-bold">{ac.Registration}</h3>
                  </div>
                  <p className="text-sm font-medium text-muted-foreground">{ac.Manufacturer}</p>
                  <div className="mt-3 space-y-1 text-sm">
                    <div className="flex justify-between"><span className="text-muted-foreground">Type:</span> <span>{ac.ICAOType}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">MTOW:</span> <span>{ac.MTOW_kg.toLocaleString()} kg</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Noise:</span> <span>{ac.NoiseCert}</span></div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
```

with:

```tsx
        <TabsContent value="aircraft">
          <div className="mb-4 flex items-center justify-end gap-2">
            <Input placeholder="Search aircraft..." value={aircraftFilter.query} onChange={(e) => aircraftFilter.setQuery(e.target.value)} className="h-9 w-56" />
            <Button size="sm" variant="outline" onClick={() => exportToExcel(aircraft, 'aircraft.xlsx', 'Aircraft')}>
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
                      await saveAircraft({
                        Registration: row.Registration, ICAOType: row.ICAOType, Manufacturer: row.Manufacturer,
                        MTOW_kg: parseNumberCell(row.MTOW_kg), NoiseCert: row.NoiseCert,
                        SerialNumber: row.SerialNumber || undefined, CurrentOperatorID: row.CurrentOperatorID,
                        Colors: row.Colors || undefined, OperationType: row.OperationType || undefined,
                        MaxRangeOverrideNm: row.MaxRangeOverrideNm ? parseNumberCell(row.MaxRangeOverrideNm) : undefined,
                        FuelBurnOverrideKgPerHour: row.FuelBurnOverrideKgPerHour ? parseNumberCell(row.FuelBurnOverrideKgPerHour) : undefined,
                      });
                      ok++;
                    } catch (err) {
                      errors.push(`Row ${i + 2}: ${err instanceof Error ? err.message : 'failed'}`);
                    }
                  }
                  alert(`${ok} imported${errors.length ? `, ${errors.length} failed:\n${errors.join('\n')}` : ''}`);
                  e.target.value = '';
                  setRefreshKey((k) => k + 1);
                }}
              />
              <span className="inline-flex h-9 cursor-pointer items-center gap-1 rounded-md border border-dashed px-3 text-xs text-muted-foreground hover:bg-muted">
                <Upload className="h-3.5 w-3.5" /> Upload
              </span>
            </label>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {aircraftFilter.filtered.map(ac => (
              <Card key={ac.Registration}>
                <CardContent className="p-5">
                  <div className="mb-2 flex items-center gap-2">
                    <Plane className="h-5 w-5 text-primary" />
                    <h3 className="text-lg font-bold">{ac.Registration}</h3>
                  </div>
                  <p className="text-sm font-medium text-muted-foreground">{ac.Manufacturer}</p>
                  <div className="mt-3 space-y-1 text-sm">
                    <div className="flex justify-between"><span className="text-muted-foreground">Type:</span> <span>{ac.ICAOType}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">MTOW:</span> <span>{ac.MTOW_kg.toLocaleString()} kg</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Noise:</span> <span>{ac.NoiseCert}</span></div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
```

- [ ] **Step 4: Verify — build**

Run: `npx tsc -p tsconfig.client.json`. Expect 0 errors — this task builds clean entirely on its own.

- [ ] **Step 5: Snapshot (no git commit)**

---

### Task 6: Frontend — `ReferencePage.tsx` Providers, Service Types, and Leg Purposes tabs

**Files:**
- Modify: `src/client/pages/ReferencePage.tsx`

**Interfaces:**
- Consumes: `airports`, `countries`, `aircraft`, `providers`, `airportFilter`, `countryFilter`, `aircraftFilter`, `ruleFilter`, `setRefreshKey`, `serviceTypes`, `legPurposes` — all present in the file from Tasks 4/5 (`providers` was declared by Task 4 to satisfy this task's untouched-until-now original JSX; unchanged by this task). `saveProvider` (already exists in `dataStore.ts`, used today only by `AdminAssets.tsx`). `reloadServiceTypes`/`reloadLegPurposes` (pre-existing functions in this file, unchanged by any task).
- Produces: `providerFilter`, `serviceTypeFilter`, `legPurposeFilter` (`useTextFilter` instances).

**IMPORTANT — same `noUnusedLocals`/`noUnusedParameters: true` constraint as Tasks 4 and 5.** This task must build clean entirely on its own — it is the last task touching `ReferencePage.tsx`, so after this task every name declared across Tasks 4/5/6 must be consumed somewhere. Do NOT redeclare `providers` — Task 4 already declared it.

- [ ] **Step 1: Add imports and filter hooks for Providers, Service Types, and Leg Purposes**

Find the `@/lib/dataStore` import block Task 5 left:

```typescript
import {
  getAirportList, getCountryList, getAircraftList, getProviderList, getCountryRuleList,
  saveAirport, saveCountry, saveAircraft, saveCountryRule, deleteCountryRule,
  getServiceTypes, saveServiceType, getLegPurposes, saveLegPurpose,
} from '@/lib/dataStore';
```

Replace with:

```typescript
import {
  getAirportList, getCountryList, getAircraftList, getProviderList, getCountryRuleList,
  saveAirport, saveCountry, saveAircraft, saveProvider, saveCountryRule, deleteCountryRule,
  getServiceTypes, saveServiceType, getLegPurposes, saveLegPurpose,
} from '@/lib/dataStore';
```

Find `import type { ServiceTypeDef, LegPurposeDef, CountryRule } from '@/data/types';` and replace with:

```typescript
import type { ServiceTypeDef, LegPurposeDef, CountryRule, Provider } from '@/data/types';
```

Find the `ruleFilter`/`aircraftFilter` declarations Task 5 left, immediately before `return (`:

```typescript
  const ruleFilter = useTextFilter(countryRules, (r) => `${countries.find((c) => c.ISO2 === r.CountryISO2)?.Name || r.CountryISO2} ${r.ServiceType}`);
  const aircraftFilter = useTextFilter(aircraft, (a) => `${a.Registration} ${a.ICAOType} ${a.Manufacturer}`);

  return (
```

Replace with:

```typescript
  const ruleFilter = useTextFilter(countryRules, (r) => `${countries.find((c) => c.ISO2 === r.CountryISO2)?.Name || r.CountryISO2} ${r.ServiceType}`);
  const aircraftFilter = useTextFilter(aircraft, (a) => `${a.Registration} ${a.ICAOType} ${a.Manufacturer}`);
  const providerFilter = useTextFilter(providers, (p) => `${p.Name} ${p.ProviderID} ${p.Scope}`);
  const serviceTypeFilter = useTextFilter(serviceTypes, (s) => `${s.code} ${s.label} ${s.category}`);
  const legPurposeFilter = useTextFilter(legPurposes, (p) => `${p.code} ${p.label}`);

  return (
```

- [ ] **Step 2: Rewrite the Providers `TabsContent` block**

Replace the full `TabsContent value="providers"` block:

```tsx
        <TabsContent value="providers">
          <div className="grid gap-4 md:grid-cols-2">
            {providers.map(p => (
              <Card key={p.ProviderID}>
                <CardContent className="p-5">
                  <div className="mb-2 flex items-start justify-between">
                    <h3 className="font-bold">{p.Name}</h3>
                    <Badge variant="outline" className="font-mono text-xs">{p.ProviderID}</Badge>
                  </div>
                  <p className="mb-2 text-xs text-muted-foreground">Scope: {p.Scope}</p>
                  <div className="mb-2 flex flex-wrap gap-1">
                    {p.ServiceTypes.map(st => (
                      <Badge key={st} variant="secondary" className="text-xs">{st}</Badge>
                    ))}
                  </div>
                  <div className="space-y-1 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Fuel className="h-3 w-3" />
                      {p.Email}
                    </div>
                    <div className="flex items-center gap-1">
                      <Phone className="h-3 w-3" />
                      {p.AOGContact}
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {p.WorkingHoursZ}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
```

with:

```tsx
        <TabsContent value="providers">
          <div className="mb-4 flex items-center justify-end gap-2">
            <Input placeholder="Search providers..." value={providerFilter.query} onChange={(e) => providerFilter.setQuery(e.target.value)} className="h-9 w-56" />
            <Button size="sm" variant="outline" onClick={() => exportToExcel(providers.map(({ Contacts, ...rest }) => rest), 'providers.xlsx', 'Providers')}>
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
                      await saveProvider({
                        ProviderID: row.ProviderID, Name: row.Name,
                        ServiceTypes: parseListCell(row.ServiceTypes),
                        ScopeType: row.ScopeType as Provider['ScopeType'], Scope: row.Scope,
                        Email: row.Email || undefined, AOGContact: row.AOGContact || undefined,
                        WorkingHoursZ: row.WorkingHoursZ || undefined, Contacts: [],
                      });
                      ok++;
                    } catch (err) {
                      errors.push(`Row ${i + 2}: ${err instanceof Error ? err.message : 'failed'}`);
                    }
                  }
                  alert(`${ok} imported${errors.length ? `, ${errors.length} failed:\n${errors.join('\n')}` : ''}`);
                  e.target.value = '';
                  setRefreshKey((k) => k + 1);
                }}
              />
              <span className="inline-flex h-9 cursor-pointer items-center gap-1 rounded-md border border-dashed px-3 text-xs text-muted-foreground hover:bg-muted">
                <Upload className="h-3.5 w-3.5" /> Upload
              </span>
            </label>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {providerFilter.filtered.map(p => (
              <Card key={p.ProviderID}>
                <CardContent className="p-5">
                  <div className="mb-2 flex items-start justify-between">
                    <h3 className="font-bold">{p.Name}</h3>
                    <Badge variant="outline" className="font-mono text-xs">{p.ProviderID}</Badge>
                  </div>
                  <p className="mb-2 text-xs text-muted-foreground">Scope: {p.Scope}</p>
                  <div className="mb-2 flex flex-wrap gap-1">
                    {p.ServiceTypes.map(st => (
                      <Badge key={st} variant="secondary" className="text-xs">{st}</Badge>
                    ))}
                  </div>
                  <div className="space-y-1 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Fuel className="h-3 w-3" />
                      {p.Email}
                    </div>
                    <div className="flex items-center gap-1">
                      <Phone className="h-3 w-3" />
                      {p.AOGContact}
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {p.WorkingHoursZ}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
```

- [ ] **Step 3: Add search + Excel controls to the Service Types tab**

Find the `TabsContent value="service-types"` block's `CardHeader`:

```tsx
        <TabsContent value="service-types">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Tag className="h-4 w-4" /> Service Types
              </CardTitle>
              <Button size="sm" variant="outline" disabled={!isAdmin} onClick={() => isAdmin && openNewType()}><Plus className="h-4 w-4" /> Add Type</Button>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Label</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Variants</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {serviceTypes.map((def) => (
```

Replace with:

```tsx
        <TabsContent value="service-types">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Tag className="h-4 w-4" /> Service Types
              </CardTitle>
              <div className="flex items-center gap-2">
                <Input placeholder="Search service types..." value={serviceTypeFilter.query} onChange={(e) => serviceTypeFilter.setQuery(e.target.value)} className="h-9 w-56" />
                <Button size="sm" variant="outline" onClick={() => exportToExcel(serviceTypes.map(({ variants, ...rest }) => rest), 'service-types.xlsx', 'ServiceTypes')}>
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
                          await saveServiceType({
                            code: row.code, label: row.label,
                            category: row.category as ServiceTypeDef['category'],
                            active: parseBoolCell(row.active), sortOrder: parseNumberCell(row.sortOrder),
                          });
                          ok++;
                        } catch (err) {
                          errors.push(`Row ${i + 2}: ${err instanceof Error ? err.message : 'failed'}`);
                        }
                      }
                      alert(`${ok} imported${errors.length ? `, ${errors.length} failed:\n${errors.join('\n')}` : ''}`);
                      e.target.value = '';
                      reloadServiceTypes();
                    }}
                  />
                  <span className="inline-flex h-9 cursor-pointer items-center gap-1 rounded-md border border-dashed px-3 text-xs text-muted-foreground hover:bg-muted">
                    <Upload className="h-3.5 w-3.5" /> Upload
                  </span>
                </label>
                <Button size="sm" variant="outline" disabled={!isAdmin} onClick={() => isAdmin && openNewType()}><Plus className="h-4 w-4" /> Add Type</Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Label</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Variants</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {serviceTypeFilter.filtered.map((def) => (
                    <TableRow key={def.code}>
                      <TableCell className="font-mono">{def.code}</TableCell>
                      <TableCell className="font-medium">{def.label}</TableCell>
                      <TableCell><Badge variant="outline">{def.category}</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground">{def.variants?.length ? def.variants.map((v) => v.label).join(', ') : '—'}</TableCell>
                      <TableCell>
                        {def.active ? (
                          <Badge variant="outline" className="border-emerald-300 text-emerald-700">Active</Badge>
                        ) : (
                          <Badge variant="outline" className="border-slate-300 text-slate-600">Inactive</Badge>
                        )}
                      </TableCell>
                      <TableCell className="flex gap-2">
                        <Button size="sm" variant="outline" disabled={!isAdmin} onClick={() => isAdmin && openEditType(def)}>Edit</Button>
                        <Button size="sm" variant="outline" disabled={!isAdmin} onClick={() => isAdmin && toggleActive(def)}>{def.active ? 'Deactivate' : 'Activate'}</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
```

(The `Dialog` block that follows — `<Dialog open={dialogOpen} ...>` through its closing `</Dialog>`, ending this `TabsContent` — is unchanged; do not modify it.)

- [ ] **Step 4: Add search + Excel controls to the Leg Purposes tab**

Find the `TabsContent value="leg-purposes"` block's `CardHeader`:

```tsx
        <TabsContent value="leg-purposes">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <ClipboardList className="h-4 w-4" /> Leg Purposes
              </CardTitle>
              <Button size="sm" variant="outline" disabled={!isAdmin} onClick={() => isAdmin && openNewPurpose()}><Plus className="h-4 w-4" /> Add Purpose</Button>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Label</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {legPurposes.map((def) => (
```

Replace with:

```tsx
        <TabsContent value="leg-purposes">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <ClipboardList className="h-4 w-4" /> Leg Purposes
              </CardTitle>
              <div className="flex items-center gap-2">
                <Input placeholder="Search leg purposes..." value={legPurposeFilter.query} onChange={(e) => legPurposeFilter.setQuery(e.target.value)} className="h-9 w-56" />
                <Button size="sm" variant="outline" onClick={() => exportToExcel(legPurposes, 'leg-purposes.xlsx', 'LegPurposes')}>
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
                          await saveLegPurpose({
                            code: row.code, label: row.label,
                            active: parseBoolCell(row.active), sortOrder: parseNumberCell(row.sortOrder),
                          });
                          ok++;
                        } catch (err) {
                          errors.push(`Row ${i + 2}: ${err instanceof Error ? err.message : 'failed'}`);
                        }
                      }
                      alert(`${ok} imported${errors.length ? `, ${errors.length} failed:\n${errors.join('\n')}` : ''}`);
                      e.target.value = '';
                      reloadLegPurposes();
                    }}
                  />
                  <span className="inline-flex h-9 cursor-pointer items-center gap-1 rounded-md border border-dashed px-3 text-xs text-muted-foreground hover:bg-muted">
                    <Upload className="h-3.5 w-3.5" /> Upload
                  </span>
                </label>
                <Button size="sm" variant="outline" disabled={!isAdmin} onClick={() => isAdmin && openNewPurpose()}><Plus className="h-4 w-4" /> Add Purpose</Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Label</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {legPurposeFilter.filtered.map((def) => (
                    <TableRow key={def.code}>
                      <TableCell className="font-mono">{def.code}</TableCell>
                      <TableCell className="font-medium">{def.label}</TableCell>
                      <TableCell>
                        {def.active ? (
                          <Badge variant="outline" className="border-emerald-300 text-emerald-700">Active</Badge>
                        ) : (
                          <Badge variant="outline" className="border-slate-300 text-slate-600">Inactive</Badge>
                        )}
                      </TableCell>
                      <TableCell className="flex gap-2">
                        <Button size="sm" variant="outline" disabled={!isAdmin} onClick={() => isAdmin && openEditPurpose(def)}>Edit</Button>
                        <Button size="sm" variant="outline" disabled={!isAdmin} onClick={() => isAdmin && togglePurposeActive(def)}>{def.active ? 'Deactivate' : 'Activate'}</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
```

(The `Dialog` block that follows — `<Dialog open={purposeDialogOpen} ...>` through its closing `</Dialog>`, ending this `TabsContent` — is unchanged; do not modify it.)

- [ ] **Step 5: Verify — build**

Run: `npm run build:client`. Expect 0 exit, 0 errors.

- [ ] **Step 6: Snapshot (no git commit)**

---

### Task 7: Full-stack build + end-to-end verification (controller-performed)

Per the pattern established in every prior plan in this repo: this task
produces no diff of its own, so it's performed directly by the controller
rather than dispatched to an implementer, and has no task review of its
own.

- [ ] **Step 1:** `npm run build` — exits 0 (verify `build:server` and
  `build:client` separately if the Windows Prisma-EPERM file-lock issue
  recurs — `Get-Process node | Stop-Process -Force` before rebuilding).
- [ ] **Step 2:** Start the stack (`npm run start:prod`).
- [ ] **Step 3:** Live walkthrough (browser, with a locally-minted bearer
  token injected into `localStorage` if login credentials aren't
  available — same fallback used for every prior slice this session):
  - Open Reference Data → confirm Airports/Countries/Aircraft/Providers
    now show the same row counts/values as Assets' equivalent tabs.
  - Edit one airport in Assets, reload Reference Data, confirm the change
    is visible there too (proves both pages share the live cache).
  - Type a partial match into each of the 7 tabs' search boxes — confirm
    the table filters live.
  - Download each tab — confirm a real `.xlsx` opens with the expected
    columns and values (including `TRUE`/`FALSE` and comma-joined arrays).
  - Edit one field in a downloaded Airports export, re-upload — confirm
    the success/failure summary appears and the change lands without
    creating a duplicate row.
  - Country Rules tab: create, edit, and delete a rule via the dialog;
    confirm each change is reflected in `GET /api/reference/country-rules`.
  - Upload an unmodified Country Rules export — confirm it creates
    duplicate rows (the documented limitation) rather than erroring.
  - Upload a file with one intentionally invalid row mixed with valid
    ones (e.g. a blank required field) on any tab — confirm the valid
    rows still import and the summary reports the one failure.
- [ ] **Step 4:** Clean up any test artifacts created during verification
  (test country rules, any duplicate rows from the re-upload tests) so
  the reference data returns to its pre-verification state.
- [ ] **Step 5:** Report: build status, which checks passed, any
  deviations ledgered as rulings.

---
