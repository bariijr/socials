# VIQ Aircraft/Operator Expansion & Bill-To Resolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `Aircraft.currentOperatorId` a real required Prisma relation, give `Operator` its first CRUD UI, expand `AircraftDialog` with operator/colors/operation-type/serial-number/performance-override fields, and add a bill-to-address resolution chain (explicit per-trip override, falling back to the linked operator's billing address) surfaced on `BillingPage.tsx`.

**Architecture:** One schema migration converts `Aircraft.currentOperatorId` from a loose nullable string to a required FK, and adds `Aircraft.colors`/`Aircraft.operationType`/`Trip.billToAddress`. `Operator` CRUD is added to the existing `reference` module (4e's home for Aircraft/Provider/Airport/Country writes). Frontend follows 4e's in-memory-cache pattern exactly — `getOperatorList()` joins the app-boot preload, `saveOperator`/`deleteOperator` become async. Bill-to resolution is a pure synchronous function reading two already-cached lists (aircraft, operators), no new fetch.

**Tech Stack:** No new dependencies. NestJS + Prisma + class-validator (4e's established pattern); React + the `apiJson`/cache pattern 4e introduced.

**Spec:** `docs/superpowers/specs/2026-08-25-viq-aircraft-operator-design.md`

## Global Constraints

- Do NOT `git commit` any of this work — explicit user instruction, carried over from every prior sub-project this session.
- `Operator.fleet` stays read-only/server-derived — no DTO field, no dialog UI for it. It would be a second source of truth against the new `Aircraft.currentOperatorId` relation.
- `Aircraft.operationType` and `Trip.billToAddress` are plain optional strings, not enums — matches how `Aircraft.status`/`Trip.operationType` already work.
- No new `Operator` field for "default bill-to address" — resolution reads existing `Operator.billingAddress`, falling back to `Operator.address`.
- Do NOT build `AircraftDetail.tsx`/`OperatorDetail.tsx` pages or touch document upload/OCR — explicitly deferred to the next sub-project.
- `dataStore.ts` has `// @ts-nocheck`. `AdminAssets.tsx`, `NewTripWizard.tsx`, `TripDetail.tsx`, `BillingPage.tsx` do NOT — real type-checking applies to changes there.

---

### Task 1: Backend — schema migration (Aircraft→Operator relation, new fields)

**Files:**
- Modify: `prisma/schema.prisma` (`Aircraft`, `Operator`, `Trip` models)
- Create: a new Prisma migration (via `npm run prisma:migrate -- --create-only`)

**Interfaces:**
- Produces: `Aircraft.currentOperatorId` (now `String`, required, real relation to `Operator`), `Aircraft.colors String?`, `Aircraft.operationType String?`, `Operator.aircraft Aircraft[]` (reverse relation), `Trip.billToAddress String?`.

- [ ] **Step 1: Edit the `Aircraft` model**

In `prisma/schema.prisma`, find the `Aircraft` model and change this line:

```prisma
  currentOperatorId       String?   @map("current_operator_id")
```

to:

```prisma
  currentOperatorId       String    @map("current_operator_id")
  colors                  String?
  operationType           String?   @map("operation_type")
```

(i.e. drop the `?` on `currentOperatorId`, and add the two new lines immediately after it — before `previousOperators`).

Then find this line inside the same model, near the bottom, right before `@@map("aircraft")`:

```prisma
  type AircraftType @relation(fields: [icaoType], references: [icaoType])
```

Add a second relation line right after it:

```prisma
  type     AircraftType @relation(fields: [icaoType], references: [icaoType])
  operator Operator     @relation(fields: [currentOperatorId], references: [operatorId])
```

- [ ] **Step 2: Add the reverse relation on `Operator`**

In `prisma/schema.prisma`, find the `Operator` model. It currently ends with:

```prisma
  status         String?  @default("Active")
  notes          String?

  @@map("operators")
}
```

Change it to:

```prisma
  status         String?  @default("Active")
  notes          String?

  aircraft Aircraft[]

  @@map("operators")
}
```

- [ ] **Step 3: Add `billToAddress` to `Trip`**

In `prisma/schema.prisma`, find the `Trip` model's `notes` field:

```prisma
  notes         String?
```

(the one directly in `Trip`, not `Aircraft` or `Operator` — it's followed by `aircraftIcaoType` in the same model). Add immediately after it:

```prisma
  notes         String?
  billToAddress String?  @map("bill_to_address")
```

- [ ] **Step 4: Generate the migration**

Run: `npm run prisma:migrate -- --name aircraft_operator_relation_and_bill_to --create-only`

- [ ] **Step 5: Read the generated SQL and confirm it matches expectations**

Open the newly created file under `prisma/migrations/<timestamp>_aircraft_operator_relation_and_bill_to/migration.sql`. It should contain, in some order:
- `ALTER TABLE "aircraft" ALTER COLUMN "current_operator_id" SET NOT NULL;`
- `ALTER TABLE "aircraft" ADD COLUMN "colors" TEXT;`
- `ALTER TABLE "aircraft" ADD COLUMN "operation_type" TEXT;`
- `ALTER TABLE "aircraft" ADD CONSTRAINT ... FOREIGN KEY ("current_operator_id") REFERENCES "operators"("operator_id") ...;`
- `ALTER TABLE "trips" ADD COLUMN "bill_to_address" TEXT;`

No `DELETE`, no data-copying statements should be present — per the spec's discovery, every one of the 6 seeded `aircraft` rows already has a `current_operator_id` matching a real `operators` row, so the `SET NOT NULL` and the new foreign key both apply cleanly against current data with nothing to backfill. If the generated SQL contains anything unexpected (a `DROP` on existing data, a nullability change beyond what's listed above), stop and re-examine before proceeding — that would mean the discovery's data assumption no longer holds.

- [ ] **Step 6: Apply the migration**

Run: `npm run prisma:migrate -- --name aircraft_operator_relation_and_bill_to` (without `--create-only` this time — applies the migration file from Step 4/5). If prompted or if this hangs waiting on interactive confirmation, use the non-interactive path instead: `npx prisma migrate deploy`.

- [ ] **Step 7: Verify — regenerate the Prisma client and build**

Run: `npm run prisma:generate`. Expect 0 exit.

Run: `npx nest build`. This is expected to show TypeScript errors at this point — `reference.service.ts`'s `createAircraft`/`updateAircraft` currently treat `currentOperatorId` as optional and don't set `colors`/`operationType`/`billToAddress` anywhere yet. That's fine; Task 2 fixes it. Just confirm the errors are exactly about these — no unrelated schema-drift errors.

- [ ] **Step 8: Snapshot (no git commit)**

Run `git status` to inspect the diff (the new migration folder, `schema.prisma`). Do not commit.

---

### Task 2: Backend — Operator CRUD, Aircraft/Trip DTO updates

**Files:**
- Create: `src/server/modules/reference/dto/create-operator.dto.ts`
- Create: `src/server/modules/reference/dto/update-operator.dto.ts`
- Modify: `src/server/modules/reference/dto/create-aircraft.dto.ts`
- Modify: `src/server/modules/reference/reference.service.ts`
- Modify: `src/server/modules/reference/reference.controller.ts`
- Modify: `src/server/modules/trips/dto/create-trip.dto.ts`

**Interfaces:**
- Consumes: `AuditService` (existing), `Prisma` types (existing, same `P2003` catch pattern 4e established for `deleteCountry`).
- Produces: `POST/PATCH/DELETE /reference/operators(/:operatorId)`. `GET /reference/aircraft`/`/reference/aircraft/:registration` responses gain a nested `operator` object. `POST /trips`/`PATCH /trips/:tripId` accept an optional `billToAddress`.

- [ ] **Step 1: Write the Operator DTOs**

`src/server/modules/reference/dto/create-operator.dto.ts`:

```typescript
import { IsEmail, IsIn, IsOptional, IsString } from 'class-validator';

const OPERATOR_STATUSES = ['Active', 'Inactive'] as const;

export class CreateOperatorDto {
  @IsString()
  operatorId!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  primaryContact?: string;

  @IsOptional()
  @IsString()
  billingAddress?: string;

  @IsOptional()
  @IsString()
  paymentTerms?: string;

  @IsOptional()
  @IsIn(OPERATOR_STATUSES)
  status?: (typeof OPERATOR_STATUSES)[number];

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  user?: string;
}
```

`src/server/modules/reference/dto/update-operator.dto.ts`:

```typescript
import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateOperatorDto } from './create-operator.dto';

export class UpdateOperatorDto extends PartialType(OmitType(CreateOperatorDto, ['operatorId'] as const)) {}
```

Note: no `fleet` field on either DTO — per Global Constraints, `Operator.fleet` stays server-derived/read-only. Leave the existing `fleet: String[]` column alone; it's simply never written by these new endpoints.

- [ ] **Step 2: Update `CreateAircraftDto`**

In `src/server/modules/reference/dto/create-aircraft.dto.ts`, change:

```typescript
  @IsOptional()
  @IsString()
  currentOperatorId?: string;
```

to:

```typescript
  @IsString()
  currentOperatorId!: string;
```

(remove the `@IsOptional()` decorator and the `?`, add `!`). Then add two new optional fields anywhere after `noiseCertOverride`:

```typescript
  @IsOptional()
  @IsString()
  colors?: string;

  @IsOptional()
  @IsString()
  operationType?: string;
```

`update-aircraft.dto.ts` needs no change — it already wraps `CreateAircraftDto` in `PartialType(OmitType(..., ['registration']))`, so `currentOperatorId` becomes optional again on `PATCH` (correct: a `PATCH` that doesn't mention the operator shouldn't be forced to re-send it) while still being required on `POST` via `CreateAircraftDto` directly.

- [ ] **Step 3: Add Operator methods to `reference.service.ts`**

In `src/server/modules/reference/reference.service.ts`, add these imports at the top, alongside the existing DTO imports:

```typescript
import { CreateOperatorDto } from './dto/create-operator.dto';
import { UpdateOperatorDto } from './dto/update-operator.dto';
```

Find the existing `operators()` method:

```typescript
  operators() {
    return this.prisma.operator.findMany({ orderBy: { name: 'asc' } });
  }
```

Replace it with:

```typescript
  operators() {
    return this.prisma.operator.findMany({ orderBy: { name: 'asc' } });
  }

  operator(operatorId: string) {
    return this.prisma.operator.findUnique({ where: { operatorId } });
  }

  async createOperator(dto: CreateOperatorDto) {
    const user = dto.user || 'SYSTEM';
    const { user: _user, ...rest } = dto;
    const operator = await this.prisma.operator.create({ data: rest });
    await this.audit.log(user, 'Operator', operator.operatorId, 'Created', '', operator.operatorId);
    return operator;
  }

  async updateOperator(operatorId: string, dto: UpdateOperatorDto) {
    const before = await this.prisma.operator.findUnique({ where: { operatorId } });
    if (!before) throw new NotFoundException(`Operator ${operatorId} not found`);
    const user = dto.user || 'SYSTEM';
    const { user: _user, ...rest } = dto;
    const operator = await this.prisma.operator.update({ where: { operatorId }, data: rest });
    await this.audit.logDiff(user, 'Operator', operatorId, before as unknown as Record<string, unknown>, operator as unknown as Record<string, unknown>);
    return operator;
  }

  async deleteOperator(operatorId: string, user = 'SYSTEM') {
    const existing = await this.prisma.operator.findUnique({ where: { operatorId } });
    if (!existing) throw new NotFoundException(`Operator ${operatorId} not found`);
    try {
      await this.prisma.operator.delete({ where: { operatorId } });
    } catch (e) {
      if (e && typeof e === 'object' && 'code' in e && (e as Prisma.PrismaClientKnownRequestError).code === 'P2003') {
        throw new BadRequestException('Cannot delete an operator with aircraft assigned to it.');
      }
      throw e;
    }
    await this.audit.log(user, 'Operator', operatorId, 'Deleted', operatorId, '');
    return { operatorId, deleted: true };
  }
```

`NotFoundException`, `BadRequestException`, and `Prisma` are already imported in this file from 4e's work — no new imports needed for those.

- [ ] **Step 4: Wire `operator: true` into the aircraft read/write methods**

In the same file, find the three methods that currently do `include: { type: true }`:

```typescript
  aircraft() {
    return this.prisma.aircraft.findMany({ include: { type: true }, orderBy: { registration: 'asc' } });
  }

  aircraftByRegistration(registration: string) {
    return this.prisma.aircraft.findUnique({ where: { registration }, include: { type: true } });
  }
```

Change both to `include: { type: true, operator: true }`:

```typescript
  aircraft() {
    return this.prisma.aircraft.findMany({ include: { type: true, operator: true }, orderBy: { registration: 'asc' } });
  }

  aircraftByRegistration(registration: string) {
    return this.prisma.aircraft.findUnique({ where: { registration }, include: { type: true, operator: true } });
  }
```

Also update `createAircraft` and `updateAircraft`'s `include: { type: true }` (each has one, inside the `this.prisma.aircraft.create(...)`/`.update(...)` call) to `include: { type: true, operator: true }` the same way.

- [ ] **Step 5: Add Operator routes to `reference.controller.ts`**

In `src/server/modules/reference/reference.controller.ts`, add these imports:

```typescript
import { CreateOperatorDto } from './dto/create-operator.dto';
import { UpdateOperatorDto } from './dto/update-operator.dto';
```

Find the existing `providers()` route and the routes right before it:

```typescript
  @Get('operators')
  operators() {
    return this.ref.operators();
  }
```

Replace it with:

```typescript
  @Get('operators')
  operators() {
    return this.ref.operators();
  }

  @Get('operators/:operatorId')
  operator(@Param('operatorId') operatorId: string) {
    return this.ref.operator(operatorId);
  }

  @Post('operators')
  createOperator(@Body() dto: CreateOperatorDto) {
    return this.ref.createOperator(dto);
  }

  @Patch('operators/:operatorId')
  updateOperator(@Param('operatorId') operatorId: string, @Body() dto: UpdateOperatorDto) {
    return this.ref.updateOperator(operatorId, dto);
  }

  @Delete('operators/:operatorId')
  deleteOperator(@Param('operatorId') operatorId: string, @Query('user') user?: string) {
    return this.ref.deleteOperator(operatorId, user);
  }
```

- [ ] **Step 6: Add `billToAddress` to the Trip DTO**

In `src/server/modules/trips/dto/create-trip.dto.ts`, add after the existing `supportRef` field:

```typescript
  @IsOptional()
  @IsString()
  supportRef?: string;

  @IsOptional()
  @IsString()
  billToAddress?: string;
```

`update-trip.dto.ts` needs no change — it already wraps `CreateTripDto` in `PartialType(OmitType(..., ['tripId']))`.

- [ ] **Step 7: Verify — build**

Run: `npx nest build`. Expect 0 exit, no TypeScript errors (this resolves the errors Task 1 Step 7 flagged as expected).

- [ ] **Step 8: Snapshot (no git commit)**

Run `git status` to inspect the diff. Do not commit.

---

### Task 3: Frontend — `dataStore.ts` Operator functions, bill-to resolution, Aircraft field additions

**Files:**
- Modify: `src/client/lib/dataStore.ts`

**Interfaces:**
- Consumes: `apiJson` (existing), `preloadReferenceData` (existing, 4e), `Operator` interface (existing, defined in this same file at line 58).
- Produces: `getOperatorList(): Operator[]` (sync, cache-backed), `saveOperator(o: Operator, user?): Promise<Operator>`, `deleteOperator(operatorId: string, user?): Promise<void>`, `resolveBillToAddress(trip: Trip): string | undefined`. `getOperator(id: string)` (existing) now reads the cache instead of the static JSON baseline. `Aircraft` interface gains `Colors`/`OperationType`. `Trip` interface gains `BillToAddress`.

- [ ] **Step 1: Add `Colors`/`OperationType` to the `Aircraft` interface, `BillToAddress` to `Trip`**

In `src/client/lib/dataStore.ts`, find the `Operator` interface (around line 58) — it stays as-is, no changes needed there. Then find the `Aircraft` interface. It's defined in `src/client/data/types.ts` (not `dataStore.ts`) — open that file and change:

```typescript
export interface Aircraft {
  Registration: string;
  ICAOType: string;
  Manufacturer: string;
  MTOW_kg: number;
  NoiseCert: string;
  SerialNumber?: string;
  CurrentOperatorID?: string;
}
```

to:

```typescript
export interface Aircraft {
  Registration: string;
  ICAOType: string;
  Manufacturer: string;
  MTOW_kg: number;
  NoiseCert: string;
  SerialNumber?: string;
  CurrentOperatorID: string;
  Colors?: string;
  OperationType?: string;
  MaxRangeOverrideNm?: number;
  FuelBurnOverrideKgPerHour?: number;
}
```

(`CurrentOperatorID` drops its `?` — it's now always populated, matching the schema's now-required `currentOperatorId`.)

In the same file (`src/client/data/types.ts`), find the `Trip` interface and add `BillToAddress` after `SupportRef`:

```typescript
  SupportRef?: string;
  BillToAddress?: string;
```

- [ ] **Step 2: Add `mapOperatorFromApi`, cache variable, and `getOperatorList`/rewrite `getOperator`**

In `src/client/lib/dataStore.ts`, find the cache-variable block added in 4e (search for `let _aircraftCache`). Add a fifth cache variable next to the existing four:

```typescript
let _aircraftCache: Aircraft[] | null = null;
let _providerCache: Provider[] | null = null;
let _airportCache: Airport[] | null = null;
let _countryCache: Country[] | null = null;
let _operatorCache: Operator[] | null = null;
```

Add a mapper function next to `mapAircraftFromApi`/etc (same block):

```typescript
function mapOperatorFromApi(o: any): Operator {
  return {
    OperatorID: o.operatorId,
    Name: o.name,
    Type: o.type ?? '',
    Address: o.address ?? '',
    Email: o.email ?? '',
    Phone: o.phone ?? '',
    Fleet: o.fleet ?? [],
    PrimaryContact: o.primaryContact ?? '',
    BillingAddress: o.billingAddress ?? '',
    PaymentTerms: o.paymentTerms ?? '',
    Status: o.status ?? 'Active',
  };
}
```

Update `mapAircraftFromApi` to also carry the new fields and the resolved operator id — find:

```typescript
function mapAircraftFromApi(a: any): Aircraft {
  // Mirrors resolveAircraftInstance's override-then-type-default-then-fallback
  // logic (above) — same rule, API shape instead of JSON shape.
  return {
    Registration: a.registration,
    ICAOType: a.icaoType,
    Manufacturer: a.manufacturerOverride || a.type?.manufacturer || 'Unknown',
    MTOW_kg: a.mtowOverrideKg || a.type?.mtowKg || 0,
    NoiseCert: a.noiseCertOverride || a.type?.noiseCert || 'Unknown',
    SerialNumber: a.serialNumber ?? undefined,
    CurrentOperatorID: a.currentOperatorId ?? undefined,
  };
}
```

Replace with:

```typescript
function mapAircraftFromApi(a: any): Aircraft {
  // Mirrors resolveAircraftInstance's override-then-type-default-then-fallback
  // logic (above) — same rule, API shape instead of JSON shape.
  return {
    Registration: a.registration,
    ICAOType: a.icaoType,
    Manufacturer: a.manufacturerOverride || a.type?.manufacturer || 'Unknown',
    MTOW_kg: a.mtowOverrideKg || a.type?.mtowKg || 0,
    NoiseCert: a.noiseCertOverride || a.type?.noiseCert || 'Unknown',
    SerialNumber: a.serialNumber ?? undefined,
    CurrentOperatorID: a.currentOperatorId,
    Colors: a.colors ?? undefined,
    OperationType: a.operationType ?? undefined,
    MaxRangeOverrideNm: a.maxRangeOverrideNm ?? undefined,
    FuelBurnOverrideKgPerHour: a.fuelBurnOverrideKgPerHour ?? undefined,
  };
}
```

Update `preloadReferenceData` to fetch operators too — find:

```typescript
export async function preloadReferenceData(): Promise<void> {
  const [aircraft, providers, airports, countries] = await Promise.all([
    apiJson<any[]>('/reference/aircraft'),
    apiJson<any[]>('/reference/providers'),
    apiJson<any[]>('/reference/airports'),
    apiJson<any[]>('/reference/countries'),
  ]);
  _aircraftCache = aircraft.map(mapAircraftFromApi);
  _providerCache = providers.map(mapProviderFromApi);
  _airportCache = airports.map(mapAirportFromApi);
  _countryCache = countries.map(mapCountryFromApi);
}
```

Replace with:

```typescript
export async function preloadReferenceData(): Promise<void> {
  const [aircraft, providers, airports, countries, operators] = await Promise.all([
    apiJson<any[]>('/reference/aircraft'),
    apiJson<any[]>('/reference/providers'),
    apiJson<any[]>('/reference/airports'),
    apiJson<any[]>('/reference/countries'),
    apiJson<any[]>('/reference/operators'),
  ]);
  _aircraftCache = aircraft.map(mapAircraftFromApi);
  _providerCache = providers.map(mapProviderFromApi);
  _airportCache = airports.map(mapAirportFromApi);
  _countryCache = countries.map(mapCountryFromApi);
  _operatorCache = operators.map(mapOperatorFromApi);
}
```

Add `getOperatorList()` next to `getCountryList()`:

```typescript
export function getOperatorList(): Operator[] {
  return _operatorCache ?? refOperators;
}
```

Find the existing `getOperator` function:

```typescript
export function getOperator(id: string): Operator | undefined {
  return refOperators.find((o) => o.OperatorID === id);
}
```

Replace with:

```typescript
export function getOperator(id: string): Operator | undefined {
  return getOperatorList().find((o) => o.OperatorID === id);
}
```

- [ ] **Step 3: Add `saveOperator`/`deleteOperator`**

Add these next to `saveCountry`/`deleteCountry`:

```typescript
export async function saveOperator(o: Operator, user = 'SYSTEM'): Promise<Operator> {
  const exists = getOperatorList().some((x) => x.OperatorID === o.OperatorID);
  const body = JSON.stringify({
    operatorId: o.OperatorID,
    name: o.Name,
    type: o.Type,
    address: o.Address,
    email: o.Email,
    phone: o.Phone,
    primaryContact: o.PrimaryContact,
    billingAddress: o.BillingAddress,
    paymentTerms: o.PaymentTerms,
    status: o.Status,
    user,
  });
  const row = exists
    ? await apiJson<any>(`/reference/operators/${o.OperatorID}`, { method: 'PATCH', body })
    : await apiJson<any>('/reference/operators', { method: 'POST', body });
  const mapped = mapOperatorFromApi(row);
  const list = getOperatorList();
  const idx = list.findIndex((x) => x.OperatorID === mapped.OperatorID);
  _operatorCache = idx >= 0
    ? list.map((x, i) => (i === idx ? mapped : x))
    : [...list, mapped];
  return mapped;
}

export async function deleteOperator(operatorId: string, user = 'SYSTEM'): Promise<void> {
  await apiJson(`/reference/operators/${operatorId}?user=${encodeURIComponent(user)}`, { method: 'DELETE' });
  _operatorCache = getOperatorList().filter((o) => o.OperatorID !== operatorId);
}
```

- [ ] **Step 4: Add `resolveBillToAddress`**

Add this function near `getOperator`/`getAircraft` (it depends on both):

```typescript
// trip.BillToAddress is an explicit override; when unset, falls back to the
// billing address of the operator linked to the trip's assigned aircraft
// (billingAddress, then address, since not every operator record fills in
// a separate billing address). Pure/synchronous — both lists it reads are
// already cached by the time any page can render (see preloadReferenceData).
export function resolveBillToAddress(trip: Trip): string | undefined {
  if (trip.BillToAddress) return trip.BillToAddress;
  const aircraft = getAircraftList().find((a) => a.Registration === trip.Registration);
  if (!aircraft) return undefined;
  const operator = getOperatorList().find((o) => o.OperatorID === aircraft.CurrentOperatorID);
  if (!operator) return undefined;
  return operator.BillingAddress || operator.Address || undefined;
}
```

- [ ] **Step 5: Update `saveAircraft`'s payload with the new fields**

Find `saveAircraft` (rewritten in 4e). It currently builds:

```typescript
  const body = JSON.stringify({
    registration: ac.Registration,
    icaoType: ac.ICAOType,
    manufacturerOverride: ac.Manufacturer,
    mtowOverrideKg: ac.MTOW_kg,
    noiseCertOverride: ac.NoiseCert,
    serialNumber: ac.SerialNumber,
    currentOperatorId: ac.CurrentOperatorID,
    user,
  });
```

Replace with:

```typescript
  const body = JSON.stringify({
    registration: ac.Registration,
    icaoType: ac.ICAOType,
    manufacturerOverride: ac.Manufacturer,
    mtowOverrideKg: ac.MTOW_kg,
    noiseCertOverride: ac.NoiseCert,
    serialNumber: ac.SerialNumber,
    currentOperatorId: ac.CurrentOperatorID,
    colors: ac.Colors,
    operationType: ac.OperationType,
    maxRangeOverrideNm: ac.MaxRangeOverrideNm,
    fuelBurnOverrideKgPerHour: ac.FuelBurnOverrideKgPerHour,
    user,
  });
```

- [ ] **Step 6: Update `mapTripFromApi`/`mapTripToApi` with `billToAddress`**

Find `mapTripFromApi`:

```typescript
    SupportRef: t.supportRef ?? undefined,
```

Add immediately after:

```typescript
    SupportRef: t.supportRef ?? undefined,
    BillToAddress: t.billToAddress ?? undefined,
```

Find `mapTripToApi`:

```typescript
    supportRef: trip.SupportRef,
```

Add immediately after:

```typescript
    supportRef: trip.SupportRef,
    billToAddress: trip.BillToAddress,
```

- [ ] **Step 7: Verify — typecheck**

Run: `npx tsc -p tsconfig.client.json --noEmit`. Expect 0 exit. (`dataStore.ts` itself never errors due to `// @ts-nocheck`, but `types.ts` does — this confirms the `Aircraft`/`Trip` interface edits from Step 1 are syntactically valid and nothing outside `dataStore.ts` broke from `CurrentOperatorID` losing its `?`.)

- [ ] **Step 8: Snapshot (no git commit)**

Run `git status` to inspect the diff. Do not commit.

---

### Task 4: Frontend — Operators tab, AircraftDialog fields, bill-to UI

**Files:**
- Modify: `src/client/pages/admin/AdminAssets.tsx`
- Modify: `src/client/pages/admin/NewTripWizard.tsx`
- Modify: `src/client/pages/TripDetail.tsx`
- Modify: `src/client/pages/admin/BillingPage.tsx`

**Interfaces:**
- Consumes: `getOperatorList`/`saveOperator`/`deleteOperator`/`resolveBillToAddress` (Task 3), `Operator` type (existing, `@/lib/dataStore`).

- [ ] **Step 1: Import `Operator` and the new dataStore functions in `AdminAssets.tsx`**

At the top of `src/client/pages/admin/AdminAssets.tsx`, find:

```typescript
import {
  getAircraftList, saveAircraft, deleteAircraft,
  getProviderList, saveProvider, deleteProvider,
  getAirportList, saveAirport, deleteAirport,
  getCountryList, saveCountry, deleteCountry,
  getPersonRoster, savePerson, deletePerson, getPersonRatings, getCountry, normalizeRegistration,
  getRosterExpiryStatuses,
} from '@/lib/dataStore';
import type { RosterExpiryEntry } from '@/lib/dataStore';
```

Replace with:

```typescript
import {
  getAircraftList, saveAircraft, deleteAircraft,
  getProviderList, saveProvider, deleteProvider,
  getAirportList, saveAirport, deleteAirport,
  getCountryList, saveCountry, deleteCountry,
  getOperatorList, saveOperator, deleteOperator,
  getPersonRoster, savePerson, deletePerson, getPersonRatings, getCountry, normalizeRegistration,
  getRosterExpiryStatuses,
} from '@/lib/dataStore';
import type { RosterExpiryEntry, Operator } from '@/lib/dataStore';
```

- [ ] **Step 2: Add `OperatorDialog`**

Add this new function in `AdminAssets.tsx`, immediately before the `// ─── Aircraft ───` comment block (so it's defined before `AircraftDialog`, which will reference `Operator` in its own props):

```typescript
// ─── Operators ──────────────────────────────────────────────────────────────

function OperatorDialog({ operator, open, onClose, onSaved }: {
  operator: Operator | null; open: boolean; onClose: () => void; onSaved: () => void;
}) {
  const isNew = !operator;
  const [operatorId, setOperatorId] = useState(operator?.OperatorID || '');
  const [name, setName] = useState(operator?.Name || '');
  const [address, setAddress] = useState(operator?.Address || '');
  const [billingAddress, setBillingAddress] = useState(operator?.BillingAddress || '');
  const [email, setEmail] = useState(operator?.Email || '');
  const [phone, setPhone] = useState(operator?.Phone || '');
  const [primaryContact, setPrimaryContact] = useState(operator?.PrimaryContact || '');
  const [paymentTerms, setPaymentTerms] = useState(operator?.PaymentTerms || '');

  const handleSave = async () => {
    if (!operatorId.trim() || !name.trim()) return;
    await saveOperator({
      OperatorID: operatorId.trim().toUpperCase(),
      Name: name.trim(),
      Type: operator?.Type || '',
      Address: address.trim(),
      BillingAddress: billingAddress.trim(),
      Email: email.trim(),
      Phone: phone.trim(),
      Fleet: operator?.Fleet || [],
      PrimaryContact: primaryContact.trim(),
      PaymentTerms: paymentTerms.trim(),
      Status: operator?.Status || 'Active',
    });
    onSaved();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isNew ? 'Add Operator' : `Edit ${operator.Name}`}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Operator ID</Label>
              <Input value={operatorId} onChange={(e) => setOperatorId(e.target.value.toUpperCase())} disabled={!isNew} />
            </div>
            <div className="space-y-1">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Address</Label>
            <Input value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Billing Address (defaults to Address if blank)</Label>
            <Input value={billingAddress} onChange={(e) => setBillingAddress(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Email</Label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Phone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Primary Contact</Label>
              <Input value={primaryContact} onChange={(e) => setPrimaryContact(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Payment Terms</Label>
              <Input value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} placeholder="e.g. Net 30" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={!operatorId.trim() || !name.trim()}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Add operator fields to `AircraftDialog`**

Find `AircraftDialog`'s state declarations:

```typescript
  const [registration, setRegistration] = useState(aircraft?.Registration || '');
  const [icaoType, setIcaoType] = useState(aircraft?.ICAOType || '');
  const [manufacturer, setManufacturer] = useState(aircraft?.Manufacturer || '');
  const [mtow, setMtow] = useState(String(aircraft?.MTOW_kg ?? ''));
  const [noiseCert, setNoiseCert] = useState(aircraft?.NoiseCert || '');
```

Add after it:

```typescript
  const [operatorId, setOperatorId] = useState(aircraft?.CurrentOperatorID || '');
  const [colors, setColors] = useState(aircraft?.Colors || '');
  const [operationType, setOperationType] = useState(aircraft?.OperationType || '');
  const [serialNumber, setSerialNumber] = useState(aircraft?.SerialNumber || '');
  const [maxRange, setMaxRange] = useState(String(aircraft?.MaxRangeOverrideNm ?? ''));
  const [fuelBurn, setFuelBurn] = useState(String(aircraft?.FuelBurnOverrideKgPerHour ?? ''));
  const [operators, setOperators] = useState<Operator[]>([]);
  useEffect(() => { setOperators(getOperatorList()); }, []);
```

Find `handleSave`:

```typescript
  const handleSave = async () => {
    if (!registration.trim() || !icaoType.trim()) return;
    await saveAircraft({
      Registration: registration.trim(),
      ICAOType: icaoType.trim(),
      Manufacturer: manufacturer.trim(),
      MTOW_kg: Number(mtow) || 0,
      NoiseCert: noiseCert.trim(),
    });
    onSaved();
    onClose();
  };
```

Replace with:

```typescript
  const handleSave = async () => {
    if (!registration.trim() || !icaoType.trim() || !operatorId) return;
    await saveAircraft({
      Registration: registration.trim(),
      ICAOType: icaoType.trim(),
      Manufacturer: manufacturer.trim(),
      MTOW_kg: Number(mtow) || 0,
      NoiseCert: noiseCert.trim(),
      CurrentOperatorID: operatorId,
      Colors: colors.trim() || undefined,
      OperationType: operationType.trim() || undefined,
      SerialNumber: serialNumber.trim() || undefined,
      MaxRangeOverrideNm: maxRange ? Number(maxRange) : undefined,
      FuelBurnOverrideKgPerHour: fuelBurn ? Number(fuelBurn) : undefined,
    });
    onSaved();
    onClose();
  };
```

Find the dialog's field list (after the Noise Certification field):

```typescript
          <div className="space-y-1">
            <Label>Noise Certification</Label>
            <Input value={noiseCert} onChange={(e) => setNoiseCert(e.target.value)} />
          </div>
        </div>
```

Replace with:

```typescript
          <div className="space-y-1">
            <Label>Noise Certification</Label>
            <Input value={noiseCert} onChange={(e) => setNoiseCert(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Operator (required)</Label>
            <Select value={operatorId} onValueChange={setOperatorId}>
              <SelectTrigger><SelectValue placeholder="Select operator" /></SelectTrigger>
              <SelectContent>
                {operators.map((o) => <SelectItem key={o.OperatorID} value={o.OperatorID}>{o.Name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Serial Number</Label>
              <Input value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Colors</Label>
              <Input value={colors} onChange={(e) => setColors(e.target.value)} placeholder="e.g. White with blue stripe" />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Operation Type</Label>
            <Input value={operationType} onChange={(e) => setOperationType(e.target.value)} placeholder="e.g. Part 135, Charter, Private" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Max Range Override (nm)</Label>
              <Input type="number" value={maxRange} onChange={(e) => setMaxRange(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Fuel Burn Override (kg/hr)</Label>
              <Input type="number" value={fuelBurn} onChange={(e) => setFuelBurn(e.target.value)} />
            </div>
          </div>
        </div>
```

Find the dialog's Save button:

```typescript
          <Button onClick={handleSave} disabled={!registration.trim() || !icaoType.trim()}>Save</Button>
```

Replace with:

```typescript
          <Button onClick={handleSave} disabled={!registration.trim() || !icaoType.trim() || !operatorId}>Save</Button>
```

- [ ] **Step 4: Add the Operators tab**

Find the `TabsList` in the main `AdminAssets` component — the block containing `<TabsTrigger value="persons" ...>` and `<TabsTrigger value="expiry" ...>`. Add a new trigger right after the `expiry` one:

```typescript
          <TabsTrigger value="operators" className="flex items-center gap-1">
            <Building2 className="h-3.5 w-3.5" /> Operators
          </TabsTrigger>
```

(`Building2` is already imported in this file — it's reused from the Vendors tab's icon.)

Find the state/effect block near the top of `AdminAssets` (where `persons`/`expiryEntries` state lives) and add:

```typescript
  const [operatorDialog, setOperatorDialog] = useState<{ open: boolean; item: Operator | null }>({ open: false, item: null });
  const [operatorsList, setOperatorsList] = useState<Operator[]>([]);
  useEffect(() => { getOperatorList().then ? undefined : setOperatorsList(getOperatorList()); }, [refreshKey]);
```

Wait — `getOperatorList()` is synchronous (cache-backed, same as `getAircraftList()`), not a promise, so drop the `.then` check above; use the same direct-call pattern already used for `aircraft`/`providers`/`airports`/`countries` in this file (`const aircraft = getAircraftList();` — no `useState`/`useEffect` at all for those, since they're plain synchronous reads recomputed on every render, refreshed by `refresh()` bumping `refreshKey` which nothing here actually depends on for a *plain* re-read — re-check how `aircraft`/`providers`/`airports`/`countries` are declared in this file: they're `const aircraft = getAircraftList();` directly in the component body, re-evaluated every render, no `useState` at all). Use that exact same pattern instead:

```typescript
  const [operatorDialog, setOperatorDialog] = useState<{ open: boolean; item: Operator | null }>({ open: false, item: null });
```

and, next to `const countries = getCountryList();`:

```typescript
  const operators = getOperatorList();
```

Find the `TabsContent value="expiry"` block's closing `</TabsContent>` (right before `</Tabs>`), and add a new tab content after it:

```typescript
        <TabsContent value="operators" className="space-y-4">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setOperatorDialog({ open: true, item: null })}>
              <Plus className="h-4 w-4" /> Add Operator
            </Button>
          </div>
          {operators.map((o) => (
            <Card key={o.OperatorID}>
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <div className="font-bold">{o.Name}</div>
                  <div className="text-xs text-muted-foreground">{o.OperatorID}</div>
                  {o.Address && <div className="text-xs text-muted-foreground">{o.Address}</div>}
                </div>
                <div className="flex items-center gap-2">
                  <Button size="icon" variant="ghost" onClick={() => setOperatorDialog({ open: true, item: o })}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={async () => { await deleteOperator(o.OperatorID); refresh(); }}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
```

Find where the other dialogs are rendered near the end of the component (`<PersonDialog .../>` etc.) and add:

```typescript
      <OperatorDialog
        operator={operatorDialog.item}
        open={operatorDialog.open}
        onClose={() => setOperatorDialog({ open: false, item: null })}
        onSaved={refresh}
      />
```

- [ ] **Step 5: Verify — typecheck**

Run: `npx tsc -p tsconfig.client.json --noEmit`. Expect 0 exit.

- [ ] **Step 6: Add Bill To Address to `NewTripWizard.tsx`**

Find the `supportRef` state declaration:

```typescript
  const [supportRef, setSupportRef] = useState('');
```

Add after it:

```typescript
  const [billToAddress, setBillToAddress] = useState('');
```

Find the trip payload construction:

```typescript
    const trip: Trip = {
      TripID: tripId,
      Client: client,
      Operator: operator,
      Registration: registration,
      Status: status,
      Owner: owner,
      CreatedZ: new Date().toISOString(),
      SupportRef: supportRef || undefined,
    };
```

Replace with:

```typescript
    const trip: Trip = {
      TripID: tripId,
      Client: client,
      Operator: operator,
      Registration: registration,
      Status: status,
      Owner: owner,
      CreatedZ: new Date().toISOString(),
      SupportRef: supportRef || undefined,
      BillToAddress: billToAddress || undefined,
    };
```

Find the Support Ref field in the JSX:

```typescript
            <div>
              <Label>Support Ref (optional)</Label>
              <Input
                value={supportRef}
                onChange={(e) => setSupportRef(e.target.value.toUpperCase())}
                placeholder="E.G. 125121395"
                className="uppercase"
              />
            </div>
```

Add immediately after:

```typescript
            <div>
              <Label>Bill To Address (optional — defaults to the aircraft's operator billing address)</Label>
              <Input
                value={billToAddress}
                onChange={(e) => setBillToAddress(e.target.value)}
                placeholder="Leave blank to use the linked operator's billing address"
              />
            </div>
```

- [ ] **Step 7: Add Bill To Address to `TripDetail.tsx`'s `TripInfoEditor`**

Find `TripInfoEditor`'s field grid — the block containing `{field('CLIENT REF', 'SupportRef')}`. Add immediately after it:

```typescript
          {field('CLIENT REF', 'SupportRef')}
          {field('BILL TO ADDRESS', 'BillToAddress')}
```

- [ ] **Step 8: Add the Bill To block to `BillingPage.tsx`'s invoice detail view**

Add `resolveBillToAddress` to the existing dataStore import:

```typescript
import {
  getInvoices, saveInvoice, getTrips, getTrip,
  getServicesForTrip, generateInvoiceFromTrip, generateQRCode,
  formatDate, formatZ, statusColor
} from '@/lib/dataStore';
```

becomes:

```typescript
import {
  getInvoices, saveInvoice, getTrips, getTrip,
  getServicesForTrip, generateInvoiceFromTrip, generateQRCode,
  formatDate, formatZ, statusColor, resolveBillToAddress
} from '@/lib/dataStore';
```

Find the header block that renders `trip.Client — trip.Registration`:

```typescript
              {trip && (
                <div className="text-sm text-muted-foreground">
                  {trip.Client} — {trip.Registration}
                </div>
              )}
```

Replace with:

```typescript
              {trip && (
                <div className="text-sm text-muted-foreground">
                  {trip.Client} — {trip.Registration}
                </div>
              )}
              {trip && resolveBillToAddress(trip) && (
                <div className="text-xs text-muted-foreground">
                  Bill To: {resolveBillToAddress(trip)}
                </div>
              )}
```

- [ ] **Step 9: Verify — build**

Run: `npx tsc -p tsconfig.client.json --noEmit`. Expect 0 exit.

Run: `npm run build:client`. Expect 0 exit, 0 errors.

- [ ] **Step 10: Snapshot (no git commit)**

Run `git status` to inspect the diff. Do not commit.

---

### Task 5: Full-stack build + end-to-end verification (controller-performed)

**Files:** None (verification only).

- [ ] **Step 1: Full build**

Stop any running dev server (`taskkill //F //IM node.exe` on Windows if the Prisma query engine DLL is locked), then run in order: `npm run prisma:generate`, `npx nest build`, `npm run build:client`. Expect 0 exit on all three.

- [ ] **Step 2: Restart the server**

`npm run start:prod` in the background; poll `curl http://localhost:4001/` until it returns 200.

- [ ] **Step 3: Live-verify Operator CRUD**

Mint a JWT the same way every prior sub-project's verification did (`node -e "const jwt = require('jsonwebtoken'); require('dotenv').config(); console.log(jwt.sign({ sub: process.env.ADMIN_USERNAME, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '15m' }));"`).

`POST /api/reference/operators` with a throwaway `operatorId`; `PATCH` its `name`; confirm `GET /api/reference/operators` count went from baseline (7) to 8 then back to 7 after `DELETE`.

- [ ] **Step 4: Live-verify Aircraft requires an operator**

`POST /api/reference/aircraft` with a valid `icaoType` but **no** `currentOperatorId` — confirm this is rejected (400, class-validator error) now that the field is required. Then `POST` again with a valid `currentOperatorId` (one of the 7 seeded operators) plus `colors`/`operationType` — confirm the response includes both, and includes a nested `operator` object (not just the id). `DELETE` the throwaway aircraft afterward.

- [ ] **Step 5: Live-verify the operator delete guard**

Attempt `DELETE /api/reference/operators/OP-001` (or whichever seeded operator ID has real aircraft assigned per the earlier discovery — `OP-001` had two: `MABCD`, `MWXYZ`). Confirm it returns `400` with "Cannot delete an operator with aircraft assigned to it." — not a raw 500.

- [ ] **Step 6: Live-verify bill-to resolution end-to-end**

Create a throwaway trip (`POST /api/trips`) referencing a real aircraft registration, with no `billToAddress` in the payload. Confirm (via reading the code path, since `resolveBillToAddress` is a pure client-side function, not a server endpoint) that `getAircraftList().find(...)` → `getOperatorList().find(...)` → `.BillingAddress` resolves correctly for that registration's operator — this is most directly checked by temporarily running the resolution logic against the same data in a `node -e` script fetching `/api/trips/:id`, `/api/reference/aircraft`, and `/api/reference/operators` and replicating the three-step lookup, the same style of live-logic-simulation used to verify 4d-3's `personExpiryStatus`. Then create a second throwaway trip **with** an explicit `billToAddress` and confirm that value wins over the operator-derived one. Delete both throwaway trips afterward.

- [ ] **Step 7: Confirm all counts return to baseline**

`GET /api/reference/operators` → 7, `GET /api/reference/aircraft` → 6, `GET /api/trips` → back to whatever the pre-test count was.

- [ ] **Step 8: Update `README.md` / `ARCHITECTURE.md`**

Add a section to `README.md` (near the existing "Reference data durability (4e)" section, same voice/depth) covering: the Aircraft→Operator relation becoming required, the new Operator CRUD/tab, the new Aircraft fields, and the bill-to resolution chain (explicit override → operator billing address → operator address) with where it's now displayed (`BillingPage.tsx`). Note explicitly that document upload/OCR expansion and `AircraftDetail.tsx`/`OperatorDetail.tsx` remain a separate, later sub-project. Add a short note to `ARCHITECTURE.md` if this introduces an "owning surface" contract worth recording (e.g. "`Operator.fleet` is never written from the UI — it's derived") — judge against what's already written rather than assuming a new section is needed.

---

## Completion notes (2026-08-25)

All 5 tasks executed inline (executing-plans, no subagents/worktree — the
user explicitly tried subagent-driven-development again for this plan,
but its commit-diffing tooling requires a real isolated worktree with
real commits to function as designed; when offered that as the only way
to make it actually work, the user chose inline execution instead). No
`git commit` run at any point.

- **Task 1** (migration): schema edited exactly as planned. Generated SQL
  matched the plan's stated expectation precisely — only `ADD COLUMN`/
  `SET NOT NULL`/`ADD CONSTRAINT`, no destructive statements — confirming
  the discovery's safety claim. Applied via `prisma migrate deploy`
  cleanly.
- **Task 2** (backend): 2 new DTO files, `reference.service.ts`/
  `reference.controller.ts` Operator CRUD + `operator: true` wired into
  all aircraft read/write includes, `CreateAircraftDto.currentOperatorId`
  now required. `npx nest build` clean.
- **Task 3** (frontend cache/resolution): `types.ts` `Aircraft`/`Trip`
  interfaces updated, `dataStore.ts` gained the operator cache/mapper/CRUD
  triple and `resolveBillToAddress`. `npx tsc --noEmit` clean — confirmed
  the expected error surfaced exactly where predicted (`AdminAssets.tsx`'s
  not-yet-updated `AircraftDialog`), nowhere else.
- **Task 4** (UI): Operators tab + `OperatorDialog` + `AircraftDialog`
  field additions in `AdminAssets.tsx`, bill-to field in
  `NewTripWizard.tsx`/`TripDetail.tsx`, Bill To display in
  `BillingPage.tsx`. One real gap caught by `tsc` and fixed inline: the
  `Operator` interface (in `dataStore.ts`) has a `Notes: string` field
  the plan's code blocks omitted (missed during plan-writing since the
  interface read was truncated) — added to `OperatorDialog`'s save
  payload, `mapOperatorFromApi`, and `saveOperator`'s request body.
  `npx tsc --noEmit` and `npm run build:client` both clean after the fix.
- **Task 5** (build + live verify + docs): full build chain clean, server
  restarted. Live-verified every claim: Operator CRUD lifecycle;
  `POST /reference/aircraft` without `currentOperatorId` correctly
  rejected (400, class-validator); with it, response includes the full
  nested `operator` object (`fleet: ["MABCD","MWXYZ"]` for OP-001,
  confirming the relation resolves both directions); attempting to delete
  OP-001 (has real aircraft assigned) correctly returns 400 with the
  spec's exact guard message; bill-to resolution verified for both the
  fallback path (a trip with no override correctly resolved to its
  aircraft's operator's `billingAddress`) and the explicit-override path
  (a trip with `billToAddress` set correctly returned that value
  unchanged) — simulated via a `node -e` script replicating
  `resolveBillToAddress`'s three-step lookup against live API data, same
  verification style used for 4d-3's `personExpiryStatus`. All counts
  (7 operators, 6 aircraft) confirmed back at baseline after cleanup.
  README.md gained an "Aircraft/Operator expansion & bill-to resolution"
  section; ARCHITECTURE.md's 4e note was corrected (it had claimed
  `operators.json` "remain genuinely static," no longer true) and gained
  its own owning-surface note for the `Operator.fleet`-never-written
  invariant.

**Known, not fully verified:** per the same limitation on record for
every prior sub-project's frontend work, the actual React UI (Operators
tab rendering, the new `AircraftDialog` fields, the Bill To line on
`BillingPage.tsx`) was not exercised in a real browser — this session has
no browser access. The build artifact and every API-level behavior are
confirmed; the in-browser rendering is not.

## Self-Review Notes

- **Spec coverage:** Every section of the design doc maps to a task — schema changes (Task 1), Operator CRUD + Aircraft/Trip DTO changes (Task 2), cache/mapper/resolution logic (Task 3), Operators tab + AircraftDialog fields + bill-to UI (Task 4), verification including the delete guard and the required-operator validation (Task 5). The spec's "explicitly out of scope" items (doc upload/OCR, `AircraftDetail.tsx`/`OperatorDetail.tsx`, `Operator.fleet` editing, invoice PDF template) are called out in Global Constraints and deliberately have no task.
- **Placeholder scan:** Task 4 Step 4 originally drafted a `useEffect`/`.then` pattern for `operatorsList` before catching, in the same step, that it doesn't match this file's actual established pattern for the other three reference lists (`const aircraft = getAircraftList();` — a plain synchronous read, no state/effect) — corrected inline to use that exact pattern instead of leaving two competing versions in the plan.
- **Type consistency:** `mapOperatorFromApi`/`saveOperator`/`deleteOperator`/`getOperatorList`/`resolveBillToAddress` (Task 3) are called with identical names and signatures in Task 4's `AdminAssets.tsx`/`BillingPage.tsx` edits. `Aircraft.Colors`/`OperationType`/`MaxRangeOverrideNm`/`FuelBurnOverrideKgPerHour` (defined in Task 3 Step 1) match the field names read in Task 4 Step 3's `AircraftDialog` edits exactly. `Trip.BillToAddress` (Task 3 Step 1) matches Task 4 Steps 6-8's usage.
