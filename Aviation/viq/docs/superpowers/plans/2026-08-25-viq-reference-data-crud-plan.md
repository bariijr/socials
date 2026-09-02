# VIQ Reference Data CRUD Durability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Aircraft/Provider/Airport/Country edits made through `AdminAssets.tsx` durable and server-authoritative (surviving a browser storage clear, visible across sessions, visible to the server's own permit/country-rule logic) instead of `localStorage`-only, without converting any of the ~10 files that call `getAircraftList`/`getProviderList`/`getAirportList`/`getCountryList` synchronously today.

**Architecture:** The Prisma models, seed data, and `GET` endpoints for all four resource types already exist and are live (`src/server/modules/reference/`). Add `POST`/`PATCH`/`DELETE` to that same module. On the frontend, fetch all four lists once when the authenticated app shell (`Layout.tsx`) mounts and cache them in memory; the four `get*List()` functions stay synchronous, reading the cache, so none of their ~10 call sites change. Only `save*`/`delete*` become async.

**Tech Stack:** No new dependencies. NestJS + Prisma + class-validator (existing patterns from `persons`/`docs` modules); React + `apiJson` fetch helper already in `dataStore.ts`.

**Spec:** `docs/superpowers/specs/2026-08-25-viq-reference-data-crud-design.md`

## Global Constraints

- Do NOT `git commit` any of this work — explicit user instruction, carried over from every prior sub-project in this session.
- Do NOT write to the shared `AircraftType` row from the Aircraft dialog's save path — `Manufacturer`/`MTOW_kg`/`NoiseCert` edits must go to the per-tail `manufacturerOverride`/`mtowOverrideKg`/`noiseCertOverride` columns only.
- Do NOT add a `contacts` column to `Provider` or send a `Contacts` field in the API payload — it isn't real user-authored data today (see spec section "Mapping gaps", point 2).
- `PATCH /reference/countries/:iso2` must be a true partial update — fields not present in the request body must be left untouched, never reset to Prisma defaults.
- `dataStore.ts` has `// @ts-nocheck`. `Layout.tsx` and `AdminAssets.tsx` do NOT — real type-checking applies to changes there.
- Keep `AdminAssets.tsx`'s dialogs (`AircraftDialog`/`ProviderDialog`/`AirportDialog`/`CountryDialog`) working exactly as they render today — this plan changes what's underneath `save*`/`delete*`, not the dialog UI.

---

### Task 1: Backend — write endpoints for all four resource types

**Files:**
- Create: `src/server/modules/reference/dto/create-aircraft.dto.ts`
- Create: `src/server/modules/reference/dto/update-aircraft.dto.ts`
- Create: `src/server/modules/reference/dto/create-provider.dto.ts`
- Create: `src/server/modules/reference/dto/update-provider.dto.ts`
- Create: `src/server/modules/reference/dto/create-airport.dto.ts`
- Create: `src/server/modules/reference/dto/update-airport.dto.ts`
- Create: `src/server/modules/reference/dto/create-country.dto.ts`
- Create: `src/server/modules/reference/dto/update-country.dto.ts`
- Modify: `src/server/modules/reference/reference.service.ts`
- Modify: `src/server/modules/reference/reference.controller.ts`

**Interfaces:**
- Consumes: `PrismaService` (existing), `AuditService` (existing, `@Global()` module — no explicit import needed in `reference.module.ts`).
- Produces: `POST/PATCH/DELETE /reference/aircraft(/:registration)`, `POST/PATCH/DELETE /reference/providers(/:providerId)`, `POST/PATCH/DELETE /reference/airports(/:icao)`, `POST/PATCH/DELETE /reference/countries(/:iso2)` — all returning the same shape their existing `GET` sibling returns (`aircraft` create/update return `include: { type: true }`, matching `aircraft()`/`aircraftByRegistration()`).

- [ ] **Step 1: Write the Aircraft DTOs**

`src/server/modules/reference/dto/create-aircraft.dto.ts`:

```typescript
import { IsArray, IsDateString, IsInt, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateAircraftDto {
  @IsString()
  registration!: string;

  @IsString()
  icaoType!: string;

  @IsOptional()
  @IsString()
  manufacturerOverride?: string;

  @IsOptional()
  @IsString()
  modelOverride?: string;

  @IsOptional()
  @IsNumber()
  mtowOverrideKg?: number;

  @IsOptional()
  @IsNumber()
  maxRangeOverrideNm?: number;

  @IsOptional()
  @IsNumber()
  fuelBurnOverrideKgPerHour?: number;

  @IsOptional()
  @IsString()
  noiseCertOverride?: string;

  @IsOptional()
  @IsString()
  currentOperatorId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  previousOperators?: string[];

  @IsOptional()
  @IsInt()
  yearOfManufacture?: number;

  @IsOptional()
  @IsString()
  serialNumber?: string;

  @IsOptional()
  @IsDateString()
  insuranceValidUntil?: string;

  @IsOptional()
  @IsDateString()
  airworthinessValidUntil?: string;

  @IsOptional()
  @IsString()
  homeBaseIcao?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  user?: string;
}
```

`src/server/modules/reference/dto/update-aircraft.dto.ts`:

```typescript
import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateAircraftDto } from './create-aircraft.dto';

export class UpdateAircraftDto extends PartialType(OmitType(CreateAircraftDto, ['registration'] as const)) {}
```

- [ ] **Step 2: Write the Provider DTOs**

`src/server/modules/reference/dto/create-provider.dto.ts`:

```typescript
import { IsArray, IsBoolean, IsEmail, IsIn, IsInt, IsOptional, IsString } from 'class-validator';

const SCOPE_TYPES = ['ICAO', 'Country', 'Global'] as const;

export class CreateProviderDto {
  @IsString()
  providerId!: string;

  @IsString()
  name!: string;

  @IsArray()
  @IsString({ each: true })
  serviceTypes!: string[];

  @IsIn(SCOPE_TYPES)
  scopeType!: (typeof SCOPE_TYPES)[number];

  @IsString()
  scope!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  aogContact?: string;

  @IsOptional()
  @IsString()
  workingHoursZ?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  paymentTerms?: string;

  @IsOptional()
  @IsInt()
  rating?: number;

  @IsOptional()
  @IsBoolean()
  contractActive?: boolean;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  user?: string;
}
```

`src/server/modules/reference/dto/update-provider.dto.ts`:

```typescript
import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateProviderDto } from './create-provider.dto';

export class UpdateProviderDto extends PartialType(OmitType(CreateProviderDto, ['providerId'] as const)) {}
```

- [ ] **Step 3: Write the Airport DTOs**

`src/server/modules/reference/dto/create-airport.dto.ts`:

```typescript
import { IsInt, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateAirportDto {
  @IsString()
  icao!: string;

  @IsOptional()
  @IsString()
  iata?: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsString()
  countryIso2!: string;

  @IsOptional()
  @IsString()
  tz?: string;

  @IsNumber()
  latitude!: number;

  @IsNumber()
  longitude!: number;

  @IsOptional()
  @IsInt()
  elevationFt?: number;

  @IsOptional()
  @IsInt()
  runwayLengthFt?: number;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsInt()
  fboCount?: number;

  @IsOptional()
  @IsString()
  user?: string;
}
```

`src/server/modules/reference/dto/update-airport.dto.ts`:

```typescript
import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateAirportDto } from './create-airport.dto';

export class UpdateAirportDto extends PartialType(OmitType(CreateAirportDto, ['icao'] as const)) {}
```

- [ ] **Step 4: Write the Country DTOs**

`src/server/modules/reference/dto/create-country.dto.ts`:

```typescript
import { IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateCountryDto {
  @IsString()
  iso2!: string;

  @IsOptional()
  @IsString()
  iso3?: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  region?: string;

  @IsOptional()
  @IsString()
  subRegion?: string;

  @IsOptional()
  @IsBoolean()
  overflightPermitRequired?: boolean;

  @IsOptional()
  @IsBoolean()
  landingPermitRequired?: boolean;

  @IsOptional()
  @IsBoolean()
  aocDocsRequired?: boolean;

  @IsOptional()
  @IsBoolean()
  ciqRequired?: boolean;

  @IsOptional()
  @IsString()
  escalationContact?: string;

  @IsOptional()
  @IsString()
  caaWebsite?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsNumber()
  centroidLat!: number;

  @IsNumber()
  centroidLng!: number;

  @IsOptional()
  @IsString()
  user?: string;
}
```

`src/server/modules/reference/dto/update-country.dto.ts`:

```typescript
import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateCountryDto } from './create-country.dto';

export class UpdateCountryDto extends PartialType(OmitType(CreateCountryDto, ['iso2'] as const)) {}
```

- [ ] **Step 5: Add write methods to `reference.service.ts`**

Replace the full contents of `src/server/modules/reference/reference.service.ts` with:

```typescript
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateAircraftDto } from './dto/create-aircraft.dto';
import { UpdateAircraftDto } from './dto/update-aircraft.dto';
import { CreateProviderDto } from './dto/create-provider.dto';
import { UpdateProviderDto } from './dto/update-provider.dto';
import { CreateAirportDto } from './dto/create-airport.dto';
import { UpdateAirportDto } from './dto/update-airport.dto';
import { CreateCountryDto } from './dto/create-country.dto';
import { UpdateCountryDto } from './dto/update-country.dto';

@Injectable()
export class ReferenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  countries() {
    return this.prisma.country.findMany({ orderBy: { name: 'asc' } });
  }

  country(iso2: string) {
    return this.prisma.country.findUnique({ where: { iso2 } });
  }

  async createCountry(dto: CreateCountryDto) {
    const user = dto.user || 'SYSTEM';
    const { user: _user, ...rest } = dto;
    const country = await this.prisma.country.create({ data: rest });
    await this.audit.log(user, 'Country', country.iso2, 'Created', '', country.iso2);
    return country;
  }

  async updateCountry(iso2: string, dto: UpdateCountryDto) {
    const before = await this.prisma.country.findUnique({ where: { iso2 } });
    if (!before) throw new NotFoundException(`Country ${iso2} not found`);
    const user = dto.user || 'SYSTEM';
    const { user: _user, ...rest } = dto;
    const country = await this.prisma.country.update({ where: { iso2 }, data: rest });
    await this.audit.logDiff(user, 'Country', iso2, before as unknown as Record<string, unknown>, country as unknown as Record<string, unknown>);
    return country;
  }

  async deleteCountry(iso2: string, user = 'SYSTEM') {
    const existing = await this.prisma.country.findUnique({ where: { iso2 } });
    if (!existing) throw new NotFoundException(`Country ${iso2} not found`);
    try {
      await this.prisma.country.delete({ where: { iso2 } });
    } catch (e) {
      if (e && typeof e === 'object' && 'code' in e && (e as Prisma.PrismaClientKnownRequestError).code === 'P2003') {
        throw new BadRequestException('Cannot delete a country with airports or country rules on file.');
      }
      throw e;
    }
    await this.audit.log(user, 'Country', iso2, 'Deleted', iso2, '');
    return { iso2, deleted: true };
  }

  airports() {
    return this.prisma.airport.findMany({ orderBy: { icao: 'asc' } });
  }

  airport(icao: string) {
    return this.prisma.airport.findUnique({ where: { icao } });
  }

  async createAirport(dto: CreateAirportDto) {
    const user = dto.user || 'SYSTEM';
    const { user: _user, ...rest } = dto;
    const airport = await this.prisma.airport.create({ data: rest });
    await this.audit.log(user, 'Airport', airport.icao, 'Created', '', airport.icao);
    return airport;
  }

  async updateAirport(icao: string, dto: UpdateAirportDto) {
    const before = await this.prisma.airport.findUnique({ where: { icao } });
    if (!before) throw new NotFoundException(`Airport ${icao} not found`);
    const user = dto.user || 'SYSTEM';
    const { user: _user, ...rest } = dto;
    const airport = await this.prisma.airport.update({ where: { icao }, data: rest });
    await this.audit.logDiff(user, 'Airport', icao, before as unknown as Record<string, unknown>, airport as unknown as Record<string, unknown>);
    return airport;
  }

  async deleteAirport(icao: string, user = 'SYSTEM') {
    const existing = await this.prisma.airport.findUnique({ where: { icao } });
    if (!existing) throw new NotFoundException(`Airport ${icao} not found`);
    await this.prisma.airport.delete({ where: { icao } });
    await this.audit.log(user, 'Airport', icao, 'Deleted', icao, '');
    return { icao, deleted: true };
  }

  cities() {
    return this.prisma.city.findMany({ orderBy: { name: 'asc' } });
  }

  aircraftTypes() {
    return this.prisma.aircraftType.findMany({ orderBy: { icaoType: 'asc' } });
  }

  aircraftType(icaoType: string) {
    return this.prisma.aircraftType.findUnique({ where: { icaoType } });
  }

  aircraft() {
    return this.prisma.aircraft.findMany({ include: { type: true }, orderBy: { registration: 'asc' } });
  }

  aircraftByRegistration(registration: string) {
    return this.prisma.aircraft.findUnique({ where: { registration }, include: { type: true } });
  }

  async createAircraft(dto: CreateAircraftDto) {
    const user = dto.user || 'SYSTEM';
    const { user: _user, insuranceValidUntil, airworthinessValidUntil, ...rest } = dto;
    const aircraft = await this.prisma.aircraft.create({
      data: {
        ...rest,
        insuranceValidUntil: insuranceValidUntil ? new Date(insuranceValidUntil) : undefined,
        airworthinessValidUntil: airworthinessValidUntil ? new Date(airworthinessValidUntil) : undefined,
      },
      include: { type: true },
    });
    await this.audit.log(user, 'Aircraft', aircraft.registration, 'Created', '', aircraft.registration);
    return aircraft;
  }

  async updateAircraft(registration: string, dto: UpdateAircraftDto) {
    const before = await this.prisma.aircraft.findUnique({ where: { registration } });
    if (!before) throw new NotFoundException(`Aircraft ${registration} not found`);
    const user = dto.user || 'SYSTEM';
    const { user: _user, insuranceValidUntil, airworthinessValidUntil, ...rest } = dto;
    const aircraft = await this.prisma.aircraft.update({
      where: { registration },
      data: {
        ...rest,
        insuranceValidUntil: insuranceValidUntil ? new Date(insuranceValidUntil) : undefined,
        airworthinessValidUntil: airworthinessValidUntil ? new Date(airworthinessValidUntil) : undefined,
      },
      include: { type: true },
    });
    await this.audit.logDiff(user, 'Aircraft', registration, before as unknown as Record<string, unknown>, aircraft as unknown as Record<string, unknown>);
    return aircraft;
  }

  async deleteAircraft(registration: string, user = 'SYSTEM') {
    const existing = await this.prisma.aircraft.findUnique({ where: { registration } });
    if (!existing) throw new NotFoundException(`Aircraft ${registration} not found`);
    await this.prisma.aircraft.delete({ where: { registration } });
    await this.audit.log(user, 'Aircraft', registration, 'Deleted', registration, '');
    return { registration, deleted: true };
  }

  operators() {
    return this.prisma.operator.findMany({ orderBy: { name: 'asc' } });
  }

  providers() {
    return this.prisma.provider.findMany({ orderBy: { name: 'asc' } });
  }

  async createProvider(dto: CreateProviderDto) {
    const user = dto.user || 'SYSTEM';
    const { user: _user, ...rest } = dto;
    const provider = await this.prisma.provider.create({ data: rest });
    await this.audit.log(user, 'Provider', provider.providerId, 'Created', '', provider.providerId);
    return provider;
  }

  async updateProvider(providerId: string, dto: UpdateProviderDto) {
    const before = await this.prisma.provider.findUnique({ where: { providerId } });
    if (!before) throw new NotFoundException(`Provider ${providerId} not found`);
    const user = dto.user || 'SYSTEM';
    const { user: _user, ...rest } = dto;
    const provider = await this.prisma.provider.update({ where: { providerId }, data: rest });
    await this.audit.logDiff(user, 'Provider', providerId, before as unknown as Record<string, unknown>, provider as unknown as Record<string, unknown>);
    return provider;
  }

  async deleteProvider(providerId: string, user = 'SYSTEM') {
    const existing = await this.prisma.provider.findUnique({ where: { providerId } });
    if (!existing) throw new NotFoundException(`Provider ${providerId} not found`);
    await this.prisma.provider.delete({ where: { providerId } });
    await this.audit.log(user, 'Provider', providerId, 'Deleted', providerId, '');
    return { providerId, deleted: true };
  }

  countryRules() {
    return this.prisma.countryRule.findMany();
  }

  countryRule(countryIso2: string, serviceType: string) {
    return this.prisma.countryRule.findUnique({
      where: { countryIso2_serviceType: { countryIso2, serviceType } },
    });
  }

  icaoRules() {
    return this.prisma.iCAORule.findMany();
  }

  icaoRule(icao: string) {
    return this.prisma.iCAORule.findUnique({ where: { icao } });
  }

  docTemplates() {
    return this.prisma.docTemplate.findMany();
  }

  priceList() {
    return this.prisma.priceItem.findMany();
  }

  // Resolved MTOW/Manufacturer/NoiseCert for a fleet tail — instance override
  // falls back to the type-level default (mirrors the frontend's resolveAircraftInstance).
  async resolveAircraft(registration: string) {
    const inst = await this.aircraftByRegistration(registration);
    if (!inst) return null;
    return {
      registration: inst.registration,
      icaoType: inst.icaoType,
      manufacturer: inst.manufacturerOverride || inst.type.manufacturer,
      mtowKg: inst.mtowOverrideKg || inst.type.mtowKg,
      noiseCert: inst.noiseCertOverride || inst.type.noiseCert,
    };
  }
}
```

Note: only `Aircraft` needed explicit `Date` conversion for its two date fields (`insuranceValidUntil`/`airworthinessValidUntil`) — `Country`/`Airport`/`Provider` have no `DateTime` columns among their editable fields, so their create/update methods spread the DTO directly, matching the simpler pattern already used by `PersonRatingsService` for non-date fields.

- [ ] **Step 6: Add write routes to `reference.controller.ts`**

Replace the full contents of `src/server/modules/reference/reference.controller.ts` with:

```typescript
import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ReferenceService } from './reference.service';
import { CreateAircraftDto } from './dto/create-aircraft.dto';
import { UpdateAircraftDto } from './dto/update-aircraft.dto';
import { CreateProviderDto } from './dto/create-provider.dto';
import { UpdateProviderDto } from './dto/update-provider.dto';
import { CreateAirportDto } from './dto/create-airport.dto';
import { UpdateAirportDto } from './dto/update-airport.dto';
import { CreateCountryDto } from './dto/create-country.dto';
import { UpdateCountryDto } from './dto/update-country.dto';

@Controller('reference')
export class ReferenceController {
  constructor(private readonly ref: ReferenceService) {}

  @Get('countries')
  countries() {
    return this.ref.countries();
  }

  @Get('countries/:iso2')
  country(@Param('iso2') iso2: string) {
    return this.ref.country(iso2.toUpperCase());
  }

  @Post('countries')
  createCountry(@Body() dto: CreateCountryDto) {
    return this.ref.createCountry({ ...dto, iso2: dto.iso2.toUpperCase() });
  }

  @Patch('countries/:iso2')
  updateCountry(@Param('iso2') iso2: string, @Body() dto: UpdateCountryDto) {
    return this.ref.updateCountry(iso2.toUpperCase(), dto);
  }

  @Delete('countries/:iso2')
  deleteCountry(@Param('iso2') iso2: string, @Query('user') user?: string) {
    return this.ref.deleteCountry(iso2.toUpperCase(), user);
  }

  @Get('airports')
  airports() {
    return this.ref.airports();
  }

  @Get('airports/:icao')
  airport(@Param('icao') icao: string) {
    return this.ref.airport(icao.toUpperCase());
  }

  @Post('airports')
  createAirport(@Body() dto: CreateAirportDto) {
    return this.ref.createAirport({ ...dto, icao: dto.icao.toUpperCase() });
  }

  @Patch('airports/:icao')
  updateAirport(@Param('icao') icao: string, @Body() dto: UpdateAirportDto) {
    return this.ref.updateAirport(icao.toUpperCase(), dto);
  }

  @Delete('airports/:icao')
  deleteAirport(@Param('icao') icao: string, @Query('user') user?: string) {
    return this.ref.deleteAirport(icao.toUpperCase(), user);
  }

  @Get('cities')
  cities() {
    return this.ref.cities();
  }

  @Get('aircraft-types')
  aircraftTypes() {
    return this.ref.aircraftTypes();
  }

  @Get('aircraft-types/:icaoType')
  aircraftType(@Param('icaoType') icaoType: string) {
    return this.ref.aircraftType(icaoType.toUpperCase());
  }

  @Get('aircraft')
  aircraft() {
    return this.ref.aircraft();
  }

  @Get('aircraft/:registration')
  aircraftByRegistration(@Param('registration') registration: string) {
    return this.ref.resolveAircraft(registration.toUpperCase());
  }

  @Post('aircraft')
  createAircraft(@Body() dto: CreateAircraftDto) {
    return this.ref.createAircraft({ ...dto, registration: dto.registration.toUpperCase() });
  }

  @Patch('aircraft/:registration')
  updateAircraft(@Param('registration') registration: string, @Body() dto: UpdateAircraftDto) {
    return this.ref.updateAircraft(registration.toUpperCase(), dto);
  }

  @Delete('aircraft/:registration')
  deleteAircraft(@Param('registration') registration: string, @Query('user') user?: string) {
    return this.ref.deleteAircraft(registration.toUpperCase(), user);
  }

  @Get('operators')
  operators() {
    return this.ref.operators();
  }

  @Get('providers')
  providers() {
    return this.ref.providers();
  }

  @Post('providers')
  createProvider(@Body() dto: CreateProviderDto) {
    return this.ref.createProvider(dto);
  }

  @Patch('providers/:providerId')
  updateProvider(@Param('providerId') providerId: string, @Body() dto: UpdateProviderDto) {
    return this.ref.updateProvider(providerId, dto);
  }

  @Delete('providers/:providerId')
  deleteProvider(@Param('providerId') providerId: string, @Query('user') user?: string) {
    return this.ref.deleteProvider(providerId, user);
  }

  @Get('country-rules')
  countryRules() {
    return this.ref.countryRules();
  }

  @Get('icao-rules')
  icaoRules() {
    return this.ref.icaoRules();
  }

  @Get('icao-rules/:icao')
  icaoRule(@Param('icao') icao: string) {
    return this.ref.icaoRule(icao.toUpperCase());
  }

  @Get('doc-templates')
  docTemplates() {
    return this.ref.docTemplates();
  }

  @Get('price-list')
  priceList() {
    return this.ref.priceList();
  }
}
```

Note: `aircraft/:registration`'s existing `GET` route already resolves through `resolveAircraft` (not `aircraftByRegistration` directly) — left unchanged; the new `PATCH`/`DELETE` routes use `registration` directly since they operate on the raw row, matching how every other resource's write routes work against the raw identifier.

- [ ] **Step 7: Verify — build**

Run: `npx nest build`. Expect 0 exit, no TypeScript errors.

- [ ] **Step 8: Snapshot (no git commit)**

Confirm `git status` shows the 8 new DTO files plus the two modified files, nothing else. Do not commit.

---

### Task 2: Frontend — in-memory cache, mappers, and read-side (`get*List`) rewrite

**Files:**
- Modify: `src/client/lib/dataStore.ts:1030-1123` (the "Reference Data CRUD" and "Reference Lookups" sections)

**Interfaces:**
- Consumes: `apiJson<T>(path, options)` (existing, `src/client/lib/dataStore.ts:239`), `refAircraft`/`refProviders`/`refAirports`/`refCountries` (existing static-JSON fallback, `src/client/lib/dataStore.ts:135-157`).
- Produces: `preloadReferenceData(): Promise<void>` — called once by `Layout.tsx` in Task 3. `getAircraftList()`/`getProviderList()`/`getAirportList()`/`getCountryList()` keep their existing synchronous signatures — no consumer file changes.

- [ ] **Step 1: Add cache variables and mapper functions**

In `src/client/lib/dataStore.ts`, immediately before the `// ─── Reference Data CRUD ...` comment block (currently at line 1031), insert:

```typescript
// ─── Reference Data Cache (API-backed, populated once at app boot) ──────────
// getAircraftList/getProviderList/getAirportList/getCountryList below stay
// synchronous — every existing caller (TripDetail, NewTripWizard, AdminTrips,
// ComposerPage, ComposeDrawer, emailTemplates, TripsPage, LandingPage,
// AdminAssets, and this file's own getAircraft/getCountry/getProvider/
// getAirport lookups) calls them inline/in JSX and none of that changes.
// Layout.tsx awaits preloadReferenceData() once before rendering any route,
// so by the time a page can render, the cache is populated. If a caller
// somehow runs before that (shouldn't happen in normal use), the getters
// fall back to the static JSON baseline rather than returning nothing.
let _aircraftCache: Aircraft[] | null = null;
let _providerCache: Provider[] | null = null;
let _airportCache: Airport[] | null = null;
let _countryCache: Country[] | null = null;

function mapAircraftFromApi(a: any): Aircraft {
  // Mirrors resolveAircraftInstance's override-then-type-default-then-fallback
  // logic (line 143 above) — same rule, API shape instead of JSON shape.
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

function mapProviderFromApi(p: any): Provider {
  return {
    ProviderID: p.providerId,
    Name: p.name,
    ServiceTypes: p.serviceTypes,
    ScopeType: p.scopeType,
    Scope: p.scope,
    Email: p.email ?? '',
    AOGContact: p.aogContact ?? '',
    WorkingHoursZ: p.workingHoursZ ?? '',
    // Contacts has no DB column (ProviderDialog never lets a user author
    // more than one) — synthesized the same way ProviderDialog's own
    // handleSave already does, so behavior is unchanged from the UI's view.
    Contacts: [{ Label: 'Primary', Email: p.email ?? '' }],
  };
}

function mapAirportFromApi(a: any): Airport {
  return {
    ICAO: a.icao,
    IATA: a.iata ?? '',
    Name: a.name,
    City: a.city ?? '',
    CountryISO2: a.countryIso2,
    TZ: a.tz ?? '',
    Latitude: a.latitude,
    Longitude: a.longitude,
    ElevationFt: a.elevationFt ?? 0,
    RunwayLengthFt: a.runwayLengthFt ?? 0,
    Category: a.category ?? 'Unclassified',
    FBOCount: a.fboCount ?? 0,
  };
}

function mapCountryFromApi(c: any): Country {
  return {
    Name: c.name,
    ISO2: c.iso2,
    Region: c.region ?? '',
    OverflightPermitRequired: c.overflightPermitRequired,
    LandingPermitRequired: c.landingPermitRequired,
    AOCDocsRequired: c.aocDocsRequired,
    EscalationContact: c.escalationContact ?? '',
    CentroidLat: c.centroidLat,
    CentroidLng: c.centroidLng,
  };
}

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

- [ ] **Step 2: Rewrite the four `get*List` getters to read the cache**

In `src/client/lib/dataStore.ts`, replace:

```typescript
export function getAircraftList(): Aircraft[] {
  return getTx(LS_KEYS.aircraft, refAircraft);
}
```

with:

```typescript
export function getAircraftList(): Aircraft[] {
  return _aircraftCache ?? refAircraft;
}
```

Replace:

```typescript
export function getProviderList(): Provider[] {
  return getTx(LS_KEYS.providers, refProviders);
}
```

with:

```typescript
export function getProviderList(): Provider[] {
  return _providerCache ?? refProviders;
}
```

Replace:

```typescript
export function getAirportList(): Airport[] {
  return getTx(LS_KEYS.airports, refAirports);
}
```

with:

```typescript
export function getAirportList(): Airport[] {
  return _airportCache ?? refAirports;
}
```

Replace:

```typescript
export function getCountryList(): Country[] {
  return getTx(LS_KEYS.countries, refCountries);
}
```

with:

```typescript
export function getCountryList(): Country[] {
  return _countryCache ?? refCountries;
}
```

Leave `getAirport`, `getCountry`, `getAircraft`, `getProvider` (the singular lookups just below, currently lines 1126-1151) completely unchanged — they already call the list getters above and `.find()`, so they pick up the cache automatically with zero edits.

- [ ] **Step 3: Verify — typecheck**

Run: `npx tsc -p tsconfig.client.json --noEmit`. Expect 0 exit. (`dataStore.ts` itself never errors due to `// @ts-nocheck`; this run confirms nothing outside it broke — it shouldn't have, since no exported signature changed yet.)

- [ ] **Step 4: Snapshot (no git commit)**

Confirm `git status` shows only `dataStore.ts` modified so far. Do not commit.

---

### Task 3: Frontend — async `save*`/`delete*`, `Layout.tsx` preload gate

**Files:**
- Modify: `src/client/lib/dataStore.ts:1031-1123` (the four `save*`/`delete*` pairs)
- Modify: `src/client/components/Layout.tsx`

**Interfaces:**
- Consumes: `preloadReferenceData()` (Task 2), `apiJson<T>` (existing).
- Produces: `saveAircraft`/`saveProvider`/`saveAirport`/`saveCountry` and their `delete*` counterparts, now `async` (previously synchronous `void`-returning). `AdminAssets.tsx`'s four dialogs call these — confirmed in the spec that each `handleSave` is a plain arrow function that can gain `async`/`await` with no other structural change needed.

- [ ] **Step 1: Rewrite `saveAircraft`/`deleteAircraft`**

Replace:

```typescript
export function saveAircraft(ac: Aircraft, user = 'SYSTEM'): void {
  const list = getAircraftList();
  const idx = list.findIndex((a) => a.Registration === ac.Registration);
  if (idx >= 0) {
    list[idx] = ac;
    addAuditEntry(user, 'Aircraft', ac.Registration, 'Updated', '', ac.Registration);
  } else {
    list.push(ac);
    addAuditEntry(user, 'Aircraft', ac.Registration, 'Created', '', ac.Registration);
  }
  setTx(LS_KEYS.aircraft, list);
}

export function deleteAircraft(registration: string, user = 'SYSTEM'): void {
  setTx(LS_KEYS.aircraft, getAircraftList().filter((a) => a.Registration !== registration));
  addAuditEntry(user, 'Aircraft', registration, 'Deleted', registration, '');
}
```

with:

```typescript
export async function saveAircraft(ac: Aircraft, user = 'SYSTEM'): Promise<Aircraft> {
  const exists = getAircraftList().some((a) => a.Registration === ac.Registration);
  // Manufacturer/MTOW_kg/NoiseCert are edited as plain fields in the dialog
  // but must be written as per-tail overrides — never mutate the shared
  // AircraftType row.
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
  const row = exists
    ? await apiJson<any>(`/reference/aircraft/${ac.Registration}`, { method: 'PATCH', body })
    : await apiJson<any>('/reference/aircraft', { method: 'POST', body });
  const mapped = mapAircraftFromApi(row);
  const list = getAircraftList();
  const idx = list.findIndex((a) => a.Registration === mapped.Registration);
  _aircraftCache = idx >= 0
    ? list.map((a, i) => (i === idx ? mapped : a))
    : [...list, mapped];
  return mapped;
}

export async function deleteAircraft(registration: string, user = 'SYSTEM'): Promise<void> {
  await apiJson(`/reference/aircraft/${registration}?user=${encodeURIComponent(user)}`, { method: 'DELETE' });
  _aircraftCache = getAircraftList().filter((a) => a.Registration !== registration);
}
```

- [ ] **Step 2: Rewrite `saveProvider`/`deleteProvider`**

Replace:

```typescript
export function saveProvider(p: Provider, user = 'SYSTEM'): void {
  const list = getProviderList();
  const idx = list.findIndex((x) => x.ProviderID === p.ProviderID);
  if (idx >= 0) {
    list[idx] = p;
    addAuditEntry(user, 'Provider', p.ProviderID, 'Updated', '', p.ProviderID);
  } else {
    list.push(p);
    addAuditEntry(user, 'Provider', p.ProviderID, 'Created', '', p.ProviderID);
  }
  setTx(LS_KEYS.providers, list);
}

export function deleteProvider(providerId: string, user = 'SYSTEM'): void {
  setTx(LS_KEYS.providers, getProviderList().filter((p) => p.ProviderID !== providerId));
  addAuditEntry(user, 'Provider', providerId, 'Deleted', providerId, '');
}
```

with:

```typescript
export async function saveProvider(p: Provider, user = 'SYSTEM'): Promise<Provider> {
  const exists = getProviderList().some((x) => x.ProviderID === p.ProviderID);
  const body = JSON.stringify({
    providerId: p.ProviderID,
    name: p.Name,
    serviceTypes: p.ServiceTypes,
    scopeType: p.ScopeType,
    scope: p.Scope,
    email: p.Email,
    aogContact: p.AOGContact,
    workingHoursZ: p.WorkingHoursZ,
    user,
  });
  const row = exists
    ? await apiJson<any>(`/reference/providers/${p.ProviderID}`, { method: 'PATCH', body })
    : await apiJson<any>('/reference/providers', { method: 'POST', body });
  const mapped = mapProviderFromApi(row);
  const list = getProviderList();
  const idx = list.findIndex((x) => x.ProviderID === mapped.ProviderID);
  _providerCache = idx >= 0
    ? list.map((x, i) => (i === idx ? mapped : x))
    : [...list, mapped];
  return mapped;
}

export async function deleteProvider(providerId: string, user = 'SYSTEM'): Promise<void> {
  await apiJson(`/reference/providers/${providerId}?user=${encodeURIComponent(user)}`, { method: 'DELETE' });
  _providerCache = getProviderList().filter((p) => p.ProviderID !== providerId);
}
```

- [ ] **Step 3: Rewrite `saveAirport`/`deleteAirport`**

Replace:

```typescript
export function saveAirport(a: Airport, user = 'SYSTEM'): void {
  const list = getAirportList();
  const idx = list.findIndex((x) => x.ICAO === a.ICAO);
  if (idx >= 0) {
    list[idx] = a;
    addAuditEntry(user, 'Airport', a.ICAO, 'Updated', '', a.ICAO);
  } else {
    list.push(a);
    addAuditEntry(user, 'Airport', a.ICAO, 'Created', '', a.ICAO);
  }
  setTx(LS_KEYS.airports, list);
}

export function deleteAirport(icao: string, user = 'SYSTEM'): void {
  setTx(LS_KEYS.airports, getAirportList().filter((a) => a.ICAO !== icao));
  addAuditEntry(user, 'Airport', icao, 'Deleted', icao, '');
}
```

with:

```typescript
export async function saveAirport(a: Airport, user = 'SYSTEM'): Promise<Airport> {
  const exists = getAirportList().some((x) => x.ICAO === a.ICAO);
  const body = JSON.stringify({
    icao: a.ICAO,
    iata: a.IATA,
    name: a.Name,
    city: a.City,
    countryIso2: a.CountryISO2,
    tz: a.TZ,
    latitude: a.Latitude,
    longitude: a.Longitude,
    elevationFt: a.ElevationFt,
    runwayLengthFt: a.RunwayLengthFt,
    category: a.Category,
    fboCount: a.FBOCount,
    user,
  });
  const row = exists
    ? await apiJson<any>(`/reference/airports/${a.ICAO}`, { method: 'PATCH', body })
    : await apiJson<any>('/reference/airports', { method: 'POST', body });
  const mapped = mapAirportFromApi(row);
  const list = getAirportList();
  const idx = list.findIndex((x) => x.ICAO === mapped.ICAO);
  _airportCache = idx >= 0
    ? list.map((x, i) => (i === idx ? mapped : x))
    : [...list, mapped];
  return mapped;
}

export async function deleteAirport(icao: string, user = 'SYSTEM'): Promise<void> {
  await apiJson(`/reference/airports/${icao}?user=${encodeURIComponent(user)}`, { method: 'DELETE' });
  _airportCache = getAirportList().filter((a) => a.ICAO !== icao);
}
```

- [ ] **Step 4: Rewrite `saveCountry`/`deleteCountry`**

Replace:

```typescript
export function saveCountry(c: Country, user = 'SYSTEM'): void {
  const list = getCountryList();
  const idx = list.findIndex((x) => x.ISO2 === c.ISO2);
  if (idx >= 0) {
    list[idx] = c;
    addAuditEntry(user, 'Country', c.ISO2, 'Updated', '', c.ISO2);
  } else {
    list.push(c);
    addAuditEntry(user, 'Country', c.ISO2, 'Created', '', c.ISO2);
  }
  setTx(LS_KEYS.countries, list);
}

export function deleteCountry(iso2: string, user = 'SYSTEM'): void {
  setTx(LS_KEYS.countries, getCountryList().filter((c) => c.ISO2 !== iso2));
  addAuditEntry(user, 'Country', iso2, 'Deleted', iso2, '');
}
```

with:

```typescript
export async function saveCountry(c: Country, user = 'SYSTEM'): Promise<Country> {
  const exists = getCountryList().some((x) => x.ISO2 === c.ISO2);
  // CountryDialog only edits these 8 fields — ciqRequired/subRegion/
  // caaWebsite/iso3/notes are deliberately omitted from this payload so
  // PATCH's partial-update semantics leave them untouched on the server.
  const body = JSON.stringify({
    iso2: c.ISO2,
    name: c.Name,
    region: c.Region,
    centroidLat: c.CentroidLat,
    centroidLng: c.CentroidLng,
    overflightPermitRequired: c.OverflightPermitRequired,
    landingPermitRequired: c.LandingPermitRequired,
    aocDocsRequired: c.AOCDocsRequired,
    escalationContact: c.EscalationContact,
    user,
  });
  const row = exists
    ? await apiJson<any>(`/reference/countries/${c.ISO2}`, { method: 'PATCH', body })
    : await apiJson<any>('/reference/countries', { method: 'POST', body });
  const mapped = mapCountryFromApi(row);
  const list = getCountryList();
  const idx = list.findIndex((x) => x.ISO2 === mapped.ISO2);
  _countryCache = idx >= 0
    ? list.map((x, i) => (i === idx ? mapped : x))
    : [...list, mapped];
  return mapped;
}

export async function deleteCountry(iso2: string, user = 'SYSTEM'): Promise<void> {
  await apiJson(`/reference/countries/${iso2}?user=${encodeURIComponent(user)}`, { method: 'DELETE' });
  _countryCache = getCountryList().filter((c) => c.ISO2 !== iso2);
}
```

- [ ] **Step 5: Update the four `handleSave` call sites in `AdminAssets.tsx`**

`dataStore.ts` has `// @ts-nocheck` so these four call sites won't error even if left `void`-style, but they must actually `await` now or edits won't be reflected until the next `refresh()` cycle picks up a stale cache read. In `src/client/pages/admin/AdminAssets.tsx`:

`AircraftDialog`'s `handleSave` (currently a plain arrow function calling `saveAircraft({...})` synchronously) — make it `async` and `await` the call:

```typescript
const handleSave = async () => {
  if (!registration.trim() || !icaoType.trim()) return;
  await saveAircraft({
    Registration: registration.trim().toUpperCase(),
    ICAOType: icaoType.trim().toUpperCase(),
    Manufacturer: manufacturer.trim(),
    MTOW_kg: Number(mtow) || 0,
    NoiseCert: noiseCert.trim(),
  });
  onSaved();
  onClose();
};
```

(Read the current body of `AircraftDialog`'s `handleSave` first — around `src/client/pages/admin/AdminAssets.tsx:40-100` — and apply the same `async`/`await` wrapping to whatever fields it actually builds; the object literal above is illustrative of the shape, not a literal replacement, since the exact field list must match what's already there.)

Apply the identical transformation (wrap in `async`, `await` the `save*`/`delete*` call, keep everything else the same) to:
- `ProviderDialog`'s `handleSave` (`saveProvider(...)`)
- `AirportDialog`'s `handleSave` (`saveAirport(...)`)
- `CountryDialog`'s `handleSave` (`saveCountry(...)`)
- The inline delete `onClick` handlers for all four resource types in the list-rendering JSX further down the same file (each currently something like `onClick={() => { deleteAircraft(ac.Registration); refresh(); }}` — change to `onClick={async () => { await deleteAircraft(ac.Registration); refresh(); }}`).

- [ ] **Step 6: Add the preload gate to `Layout.tsx`**

In `src/client/components/Layout.tsx`, add the import:

```typescript
import { preloadReferenceData } from '../lib/dataStore';
```

Change:

```typescript
export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
```

to:

```typescript
export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [refDataReady, setRefDataReady] = useState(false);
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    preloadReferenceData().finally(() => setRefDataReady(true));
  }, []);
```

Add `useEffect` to the existing `import { useState } from 'react';` at the top of the file (or wherever React hooks are currently imported — check the file's actual import line first) so it reads `import { useState, useEffect } from 'react';`.

Immediately before the component's main `return (`, add:

```typescript
  if (!refDataReady) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background text-foreground">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

```

Use `.finally()` rather than `.then()` for the gate so a reference-data fetch failure doesn't leave the app stuck on the loading screen forever — pages that actually depend on a specific list will still surface an error naturally when they try to use empty/stale data, consistent with how every other data-fetch failure in this app is handled (no global error boundary exists today; not introducing one here is in scope).

- [ ] **Step 7: Verify — build**

Run: `npx tsc -p tsconfig.client.json --noEmit`. Expect 0 exit.

Run: `npm run build:client`. Expect 0 exit, 0 errors.

- [ ] **Step 8: Snapshot (no git commit)**

Confirm `git status` shows `dataStore.ts`, `Layout.tsx`, and `AdminAssets.tsx` modified. Do not commit.

---

### Task 4: Full-stack build + end-to-end verification (controller-performed)

**Files:** None (verification only).

- [ ] **Step 1: Full build**

Stop any running dev server (`taskkill //F //IM node.exe` on Windows if the Prisma query engine DLL is locked), then run in order: `npm run prisma:generate`, `npx nest build`, `npm run build:client`. Expect 0 exit on all three. (No schema changes in this plan, so `prisma:generate` is a no-op refresh, not a migration step.)

- [ ] **Step 2: Restart the server**

`npm run start:prod` in the background; poll `curl http://localhost:4001/` until it returns 200.

- [ ] **Step 3: Live-verify each resource type's write path**

Mint a JWT the same way every prior sub-project's verification did:

```bash
node -e "const jwt = require('jsonwebtoken'); require('dotenv').config(); console.log(jwt.sign({ sub: process.env.ADMIN_USERNAME, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '15m' }));"
```

For **Aircraft**: `POST /api/reference/aircraft` with a throwaway registration and an existing `icaoType` (check `GET /api/reference/aircraft-types` for a valid code first), confirm the response's `type` object shows the shared type's defaults while the override fields you sent come back unchanged; `PATCH` a different `noiseCertOverride` value and confirm only that field changed; `DELETE` and confirm a subsequent `GET /api/reference/aircraft` no longer includes it.

For **Provider**: `POST /api/reference/providers` with a throwaway `providerId`, confirm the response has no `contacts`/`Contacts` field at all (server-side); `PATCH` its `name`; `DELETE` and confirm removal.

For **Airport**: `POST /api/reference/airports` with a throwaway ICAO and an existing `countryIso2`, confirm all fields round-trip; `DELETE` and confirm removal.

For **Country**: `POST /api/reference/countries` with a throwaway ISO2, confirm `ciqRequired` defaults to `false` in the response (Prisma default, since the create payload never sends it); `PATCH` only `name`, then `GET` that country and confirm `region`/`centroidLat`/etc. are unchanged (proves the partial-update claim); attempt `DELETE` on a country that has real airports on file (e.g. one of the 19 seeded ones) and confirm a `400` with the "Cannot delete a country with airports or country rules on file" message, not a raw 500; then `DELETE` your throwaway country (which has no airports) and confirm it succeeds.

After each resource type's test, confirm the corresponding `GET /api/reference/{type}` list count returns to its baseline (6 aircraft / 13 providers / 19 airports / 22 countries) — no leftover throwaway rows.

- [ ] **Step 4: Confirm the app shell still renders**

Since `Layout.tsx` is a new dependency for every authenticated route, curl the built `index.html` and the served JS bundle hash to confirm the build artifact is current (same check used after every prior frontend change this session), and explicitly note in completion notes that a real browser check of the loading-gate behavior (does `/dashboard` actually render past the "Loading…" screen) was **not** performed, since this session has no browser access — same limitation already on record for every prior sub-project's frontend work.

- [ ] **Step 5: Update `README.md` / `ARCHITECTURE.md`**

Add a section to `README.md` (near the existing "Person roster"/"Person detail page" sections, following the same voice/depth) covering: which four resource types are now durable, the in-memory-cache-plus-app-boot-preload mechanism and why it was chosen over full async conversion, the three mapping gaps (aircraft override resolution, provider Contacts non-persistence, country partial-update), and the accepted cross-tab staleness limitation. Add a short note to `ARCHITECTURE.md` if `Layout.tsx`'s new preload-gate behavior is the kind of "owning surface" contract worth recording there (matching the precedent set by the "Person detail owning surface" section) — judge this against what's already written rather than assuming a new section is needed.

---

## Completion notes (2026-08-25)

All 4 tasks executed inline (executing-plans, no subagents/worktree —
consistent with this session's operating constraints, see "Execution
choice" note below), no `git commit` run at any point per the standing
constraint.

- **Task 1** (backend write endpoints): 8 DTO files created, `reference.service.ts`
  and `reference.controller.ts` rewritten with `POST`/`PATCH`/`DELETE` for
  all four resource types. `npx nest build` clean.
- **Task 2** (frontend cache/mappers): cache variables, `preloadReferenceData()`,
  and the four mapper functions added to `dataStore.ts`; the four
  `get*List()` getters rewritten to read the cache. `npx tsc -p
  tsconfig.client.json --noEmit` clean.
- **Task 3** (async save/delete + UI wiring): all four `save*`/`delete*`
  pairs rewritten as async; `AdminAssets.tsx`'s four `handleSave` functions
  and four delete `onClick` handlers updated to `async`/`await`;
  `Layout.tsx` gained the `preloadReferenceData()` gate before rendering
  `<Outlet/>`. `npx tsc --noEmit` and `npm run build:client` both clean.
- **Task 4** (full build + live verify + docs): full build chain
  (`prisma:generate` → `nest build` → `build:client`) clean, server
  restarted. Live-verified via curl + JWT against every claim in the spec:
  - Aircraft: created with `manufacturerOverride`/`mtowOverrideKg`/
    `noiseCertOverride`, confirmed the response's nested `type` object
    still shows the shared `AircraftType`'s real defaults (`Bombardier`)
    unaffected; a `noiseCertOverride`-only `PATCH` left
    `manufacturerOverride` untouched, proving partial-update semantics on
    this resource too.
  - Provider: created and confirmed the response has no `contacts`/
    `Contacts` field at all — server-side confirmation the field isn't
    persisted.
  - Airport: created/deleted cleanly, all fields round-tripped.
  - Country: created and confirmed `ciqRequired` defaults to `false`
    (Prisma default, since the create payload never sends it); a
    `name`-only `PATCH` left `region`/`centroidLat`/`centroidLng`
    unchanged, proving the true-partial-update requirement; attempted
    `DELETE` on `AT` (a real seeded country with airports) correctly
    returned `400` with the spec's exact guard message instead of a raw
    500; a throwaway country with no airports deleted cleanly.
  - All four resource-type counts confirmed back at baseline (6/13/19/22)
    after cleanup.
  - README.md gained a "Reference data durability (4e)" section;
    ARCHITECTURE.md's Layer 1 table gained an "Update (4e)" note
    correcting its now-stale "static JSON" framing for these four types.

**Execution choice deviation from the plan header:** the plan's header
names `subagent-driven-development` (recommended) or `executing-plans` as
the required sub-skill. The user initially chose subagent-driven
development; mid-dispatch it surfaced that skill's review-package tooling
diffs git commits between task boundaries and mandates its own isolated
worktree, both of which structurally conflict with this session's
no-`git commit` constraint and in-place (non-worktree) configuration —
"skip commits" was not a viable adaptation of that tooling, not just an
inconvenience. Surfaced to the user before dispatching anything; they
chose inline execution (`executing-plans`) instead, matching every prior
sub-project this session.

**Known, not fully verified:** per the spec's own accepted limitation,
`Layout.tsx`'s loading-gate behavior (does the "Loading…" screen actually
resolve to a rendered `/dashboard`/`/admin/assets` in a real browser) was
not verified in-browser — this session has no browser access, the same
limitation on record for every prior sub-project's frontend work. The
build artifact and API-level behavior are confirmed; the actual React
mount/gate transition is not.

## Self-Review Notes

- **Spec coverage:** Every section of the design doc maps to a task — Discovery/no-new-migration (Task 1's absence of schema changes), the three mapping gaps (Task 2 Step 1's mapper functions, each with an inline comment citing the gap it addresses), backend write endpoints (Task 1), app-boot preload (Task 3 Step 6), async save/delete (Task 3 Steps 1-4), Country delete guard (Task 1 Step 5's `deleteCountry`), testing plan (Task 4).
- **Placeholder scan:** Task 3 Step 5 intentionally does not give a byte-for-byte replacement for `AircraftDialog`'s `handleSave` body, because its exact current field list must be read from the file rather than guessed — this is flagged explicitly as "read the current body first," not left as an unmarked gap, and the transformation to apply (wrap async, await, keep everything else) is fully specified.
- **Type consistency:** `mapAircraftFromApi`/`mapProviderFromApi`/`mapAirportFromApi`/`mapCountryFromApi` (Task 2) are called identically in Task 3's `save*` functions (`mapAircraftFromApi(row)` etc.) and nowhere else — names match exactly. `_aircraftCache`/`_providerCache`/`_airportCache`/`_countryCache` (declared Task 2 Step 1) are read in Task 2 Step 2's getters and written in Task 3 Steps 1-4 — same four names throughout, no drift.
