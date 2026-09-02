# VIQ Country-Specific Message Templates (Item 11) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin override the subject/body of the 6 CAA-facing message templates (Overfly/Landing/GroundHandling × Request/Revision) per country, rename the `UW_*` `TemplateType` values to `VIQ_*`, and strip Universal-Weather-specific text from the default template bodies.

**Architecture:** The 6 templates' current hardcoded bodies become `{{PLACEHOLDER}}`-format defaults stored as code constants. A single `renderTemplate()` substitution function renders either that default or a DB-stored country override — one rendering path, never two. Country overrides join the in-memory-cache-at-boot pattern established for reference data (4e) and Operators (Aircraft/Operator sub-project): fetched once, cached, read synchronously — `generateEmail()` needs no async conversion.

**Tech Stack:** No new dependencies. NestJS + Prisma + class-validator (established pattern); React (new admin page, `<textarea>`-based editor).

**Spec:** `docs/superpowers/specs/2026-08-25-viq-message-templates-design.md`

## Global Constraints

- Do NOT `git commit` any of this work — explicit user instruction, carried over from every prior sub-project this session.
- Only these 6 template types become country-overridable: `VIQ_OverflyRequest`, `VIQ_OverflyRevision`, `VIQ_LandingRequest`, `VIQ_LandingRevision`, `VIQ_GroundHandlingRequest`, `VIQ_GroundHandlingRevision`. `Fuel`/`Catering`/`CrewTransport`/`Hotel`/`Generic`/`VIQ_MultiLegPermit` stay hardcoded, untouched by this feature.
- Do NOT rename "Universal Weather" out of seed/demo JSON data (`providers.json`, `operators.json`, `seed-data.ts`) or `AdminSettings.tsx`'s SMTP placeholder — explicitly out of scope.
- `renderTemplate` is single-pass literal `{{KEY}}` substitution only — no conditionals, no loops.
- `MessageTemplate.updatedAtZ` is set manually in service code (`new Date()`), not via Prisma's `@updatedAt` — this schema has never used that decorator; stay consistent with every other model's manual-timestamp pattern.
- `dataStore.ts` and `emailTemplates.ts` have `// @ts-nocheck`. The new admin page and every other touched file do NOT — real type-checking applies there.

---

### Task 1: Backend — `MessageTemplate` schema, module, CRUD

**Files:**
- Modify: `prisma/schema.prisma` (`Country` model, new `MessageTemplate` model)
- Create: a new Prisma migration
- Create: `src/server/modules/message-templates/dto/create-message-template.dto.ts`
- Create: `src/server/modules/message-templates/dto/update-message-template.dto.ts`
- Create: `src/server/modules/message-templates/message-templates.service.ts`
- Create: `src/server/modules/message-templates/message-templates.controller.ts`
- Create: `src/server/modules/message-templates/message-templates.module.ts`
- Modify: `src/server/app.module.ts` (register the new module)

**Interfaces:**
- Consumes: `PrismaService`, `AuditService` (existing, `@Global()` — no explicit import needed in the new module).
- Produces: `GET /message-templates`, `GET /message-templates/:countryIso2/:templateType`, `POST /message-templates`, `PATCH /message-templates/:id`, `DELETE /message-templates/:id`.

- [ ] **Step 1: Add the `MessageTemplate` model and `Country`'s reverse relation**

In `prisma/schema.prisma`, find the `Country` model's closing brace:

```prisma
  airports     Airport[]
  countryRules CountryRule[]

  @@map("countries")
}
```

Replace with:

```prisma
  airports         Airport[]
  countryRules     CountryRule[]
  messageTemplates MessageTemplate[]

  @@map("countries")
}
```

Then add the new model directly after the `Country` model (before `model Airport {`):

```prisma
model MessageTemplate {
  id           Int      @id @default(autoincrement())
  countryIso2  String   @map("country_iso2")
  templateType String   @map("template_type")
  subject      String
  body         String
  updatedBy    String?  @map("updated_by")
  updatedAtZ   DateTime @default(now()) @map("updated_at_z")

  country Country @relation(fields: [countryIso2], references: [iso2])

  @@unique([countryIso2, templateType])
  @@index([countryIso2])
  @@map("message_templates")
}
```

- [ ] **Step 2: Generate, read, and apply the migration**

Run: `npm run prisma:migrate -- --name message_templates --create-only`

Open the generated `prisma/migrations/<timestamp>_message_templates/migration.sql`. Expect exactly: a `CREATE TABLE "message_templates" (...)`, a unique index on `(country_iso2, template_type)`, an index on `country_iso2`, and one `ADD CONSTRAINT ... FOREIGN KEY` to `countries`. No statements touching any other table — this is purely additive, no existing data affected.

Run: `npx prisma migrate deploy`

Run: `npm run prisma:generate`. Expect 0 exit.

- [ ] **Step 3: Write the DTOs**

`src/server/modules/message-templates/dto/create-message-template.dto.ts`:

```typescript
import { IsIn, IsOptional, IsString } from 'class-validator';

const COUNTRY_AWARE_TEMPLATE_TYPES = [
  'VIQ_OverflyRequest', 'VIQ_OverflyRevision',
  'VIQ_LandingRequest', 'VIQ_LandingRevision',
  'VIQ_GroundHandlingRequest', 'VIQ_GroundHandlingRevision',
] as const;

export class CreateMessageTemplateDto {
  @IsString()
  countryIso2!: string;

  @IsIn(COUNTRY_AWARE_TEMPLATE_TYPES)
  templateType!: (typeof COUNTRY_AWARE_TEMPLATE_TYPES)[number];

  @IsString()
  subject!: string;

  @IsString()
  body!: string;

  @IsOptional()
  @IsString()
  user?: string;
}

export { COUNTRY_AWARE_TEMPLATE_TYPES };
```

`src/server/modules/message-templates/dto/update-message-template.dto.ts`:

```typescript
import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateMessageTemplateDto } from './create-message-template.dto';

export class UpdateMessageTemplateDto extends PartialType(OmitType(CreateMessageTemplateDto, ['countryIso2', 'templateType'] as const)) {}
```

- [ ] **Step 4: Write the service**

`src/server/modules/message-templates/message-templates.service.ts`:

```typescript
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateMessageTemplateDto } from './dto/create-message-template.dto';
import { UpdateMessageTemplateDto } from './dto/update-message-template.dto';

@Injectable()
export class MessageTemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  findAll() {
    return this.prisma.messageTemplate.findMany({ orderBy: [{ countryIso2: 'asc' }, { templateType: 'asc' }] });
  }

  findOne(countryIso2: string, templateType: string) {
    return this.prisma.messageTemplate.findUnique({
      where: { countryIso2_templateType: { countryIso2, templateType } },
    });
  }

  async create(dto: CreateMessageTemplateDto) {
    const user = dto.user || 'SYSTEM';
    const { user: _user, ...rest } = dto;
    try {
      const template = await this.prisma.messageTemplate.create({
        data: { ...rest, updatedBy: user, updatedAtZ: new Date() },
      });
      await this.audit.log(user, 'MessageTemplate', String(template.id), 'Created', '', `${template.countryIso2}/${template.templateType}`);
      return template;
    } catch (e) {
      if (e && typeof e === 'object' && 'code' in e && (e as Prisma.PrismaClientKnownRequestError).code === 'P2002') {
        throw new BadRequestException(`A template override for ${dto.countryIso2}/${dto.templateType} already exists.`);
      }
      throw e;
    }
  }

  async update(id: number, dto: UpdateMessageTemplateDto) {
    const before = await this.prisma.messageTemplate.findUnique({ where: { id } });
    if (!before) throw new NotFoundException(`Message template ${id} not found`);
    const user = dto.user || 'SYSTEM';
    const { user: _user, ...rest } = dto;
    const template = await this.prisma.messageTemplate.update({
      where: { id },
      data: { ...rest, updatedBy: user, updatedAtZ: new Date() },
    });
    await this.audit.logDiff(user, 'MessageTemplate', String(id), before as unknown as Record<string, unknown>, template as unknown as Record<string, unknown>);
    return template;
  }

  async remove(id: number, user = 'SYSTEM') {
    const existing = await this.prisma.messageTemplate.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Message template ${id} not found`);
    await this.prisma.messageTemplate.delete({ where: { id } });
    await this.audit.log(user, 'MessageTemplate', String(id), 'Deleted', `${existing.countryIso2}/${existing.templateType}`, '');
    return { id, deleted: true };
  }
}
```

- [ ] **Step 5: Write the controller**

`src/server/modules/message-templates/message-templates.controller.ts`:

```typescript
import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { MessageTemplatesService } from './message-templates.service';
import { CreateMessageTemplateDto } from './dto/create-message-template.dto';
import { UpdateMessageTemplateDto } from './dto/update-message-template.dto';

@Controller('message-templates')
export class MessageTemplatesController {
  constructor(private readonly templates: MessageTemplatesService) {}

  @Get()
  findAll() {
    return this.templates.findAll();
  }

  @Get(':countryIso2/:templateType')
  findOne(@Param('countryIso2') countryIso2: string, @Param('templateType') templateType: string) {
    return this.templates.findOne(countryIso2.toUpperCase(), templateType);
  }

  @Post()
  create(@Body() dto: CreateMessageTemplateDto) {
    return this.templates.create({ ...dto, countryIso2: dto.countryIso2.toUpperCase() });
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateMessageTemplateDto) {
    return this.templates.update(Number(id), dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Query('user') user?: string) {
    return this.templates.remove(Number(id), user);
  }
}
```

- [ ] **Step 6: Write the module and register it**

`src/server/modules/message-templates/message-templates.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { MessageTemplatesService } from './message-templates.service';
import { MessageTemplatesController } from './message-templates.controller';

@Module({
  controllers: [MessageTemplatesController],
  providers: [MessageTemplatesService],
  exports: [MessageTemplatesService],
})
export class MessageTemplatesModule {}
```

In `src/server/app.module.ts`, find the `ReferenceModule` import and its entry in the `imports` array (or any similarly-registered feature module) and add `MessageTemplatesModule` the same way — both the `import` statement and the array entry.

- [ ] **Step 7: Verify — build**

Run: `npx nest build`. Expect 0 exit.

- [ ] **Step 8: Snapshot (no git commit)**

Run `git status` to inspect the diff. Do not commit.

---

### Task 2: Frontend — `dataStore.ts` cache, CRUD, and the override lookup helper

**Files:**
- Modify: `src/client/lib/dataStore.ts`

**Interfaces:**
- Consumes: `apiJson` (existing), `preloadReferenceData` (existing).
- Produces: `MessageTemplateOverride` interface (exported), `getMessageTemplateList(): MessageTemplateOverride[]` (sync, cache-backed), `getMessageTemplateOverride(countryIso2, templateType): MessageTemplateOverride | undefined` (sync — the lookup `emailTemplates.ts` calls), `saveMessageTemplate(...)`/`deleteMessageTemplate(id)` (async, matching the 4e/Operator save/delete pattern).

- [ ] **Step 1: Add the `MessageTemplateOverride` interface and cache variable**

In `src/client/lib/dataStore.ts`, find the cache-variable block (search for `let _operatorCache`) and add a fifth:

```typescript
let _aircraftCache: Aircraft[] | null = null;
let _providerCache: Provider[] | null = null;
let _airportCache: Airport[] | null = null;
let _countryCache: Country[] | null = null;
let _operatorCache: Operator[] | null = null;
let _messageTemplateCache: MessageTemplateOverride[] | null = null;
```

Add the interface near the `Operator` interface definition:

```typescript
export interface MessageTemplateOverride {
  ID: number;
  CountryISO2: string;
  TemplateType: string;
  Subject: string;
  Body: string;
  UpdatedBy?: string;
  UpdatedAtZ: string;
}
```

Add the mapper next to `mapOperatorFromApi`:

```typescript
function mapMessageTemplateFromApi(m: any): MessageTemplateOverride {
  return {
    ID: m.id,
    CountryISO2: m.countryIso2,
    TemplateType: m.templateType,
    Subject: m.subject,
    Body: m.body,
    UpdatedBy: m.updatedBy ?? undefined,
    UpdatedAtZ: m.updatedAtZ,
  };
}
```

- [ ] **Step 2: Add the 6th fetch to `preloadReferenceData`**

Find `preloadReferenceData` (touched most recently by the Aircraft/Operator sub-project — it has 5 parallel fetches now). Replace:

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

with:

```typescript
export async function preloadReferenceData(): Promise<void> {
  const [aircraft, providers, airports, countries, operators, messageTemplates] = await Promise.all([
    apiJson<any[]>('/reference/aircraft'),
    apiJson<any[]>('/reference/providers'),
    apiJson<any[]>('/reference/airports'),
    apiJson<any[]>('/reference/countries'),
    apiJson<any[]>('/reference/operators'),
    apiJson<any[]>('/message-templates'),
  ]);
  _aircraftCache = aircraft.map(mapAircraftFromApi);
  _providerCache = providers.map(mapProviderFromApi);
  _airportCache = airports.map(mapAirportFromApi);
  _countryCache = countries.map(mapCountryFromApi);
  _operatorCache = operators.map(mapOperatorFromApi);
  _messageTemplateCache = messageTemplates.map(mapMessageTemplateFromApi);
}
```

- [ ] **Step 3: Add the list getter, the override lookup, and CRUD functions**

Add these next to `getOperatorList`/`saveOperator`/`deleteOperator`:

```typescript
export function getMessageTemplateList(): MessageTemplateOverride[] {
  return _messageTemplateCache ?? [];
}

// The one function emailTemplates.ts calls — pure/synchronous, reads the
// already-cached list (populated by preloadReferenceData at app boot).
// Returns undefined when no override exists for this country/type pair,
// meaning the caller should fall back to its own default template.
export function getMessageTemplateOverride(countryIso2: string | null | undefined, templateType: string): MessageTemplateOverride | undefined {
  if (!countryIso2) return undefined;
  return getMessageTemplateList().find((t) => t.CountryISO2 === countryIso2 && t.TemplateType === templateType);
}

export async function saveMessageTemplate(
  t: { ID?: number; CountryISO2: string; TemplateType: string; Subject: string; Body: string },
  user = 'SYSTEM'
): Promise<MessageTemplateOverride> {
  const body = JSON.stringify({
    countryIso2: t.CountryISO2,
    templateType: t.TemplateType,
    subject: t.Subject,
    body: t.Body,
    user,
  });
  const row = t.ID
    ? await apiJson<any>(`/message-templates/${t.ID}`, { method: 'PATCH', body })
    : await apiJson<any>('/message-templates', { method: 'POST', body });
  const mapped = mapMessageTemplateFromApi(row);
  const list = getMessageTemplateList();
  const idx = list.findIndex((x) => x.ID === mapped.ID);
  _messageTemplateCache = idx >= 0
    ? list.map((x, i) => (i === idx ? mapped : x))
    : [...list, mapped];
  return mapped;
}

export async function deleteMessageTemplate(id: number, user = 'SYSTEM'): Promise<void> {
  await apiJson(`/message-templates/${id}?user=${encodeURIComponent(user)}`, { method: 'DELETE' });
  _messageTemplateCache = getMessageTemplateList().filter((t) => t.ID !== id);
}
```

- [ ] **Step 4: Verify — typecheck**

Run: `npx tsc -p tsconfig.client.json --noEmit`. Expect 0 exit. (`dataStore.ts` has `// @ts-nocheck` so it never errors itself; this confirms nothing outside it broke — nothing should have, since no exported signature that existing files use changed.)

- [ ] **Step 5: Snapshot (no git commit)**

Run `git status` to inspect the diff. Do not commit.

---

### Task 3: `emailTemplates.ts` — rename, `DEFAULT_TEMPLATES`, `renderTemplate`, `generateEmail` restructure

**Files:**
- Modify: `src/client/lib/emailTemplates.ts`

**Interfaces:**
- Consumes: `getMessageTemplateOverride` (Task 2).
- Produces: `TemplateType` with `VIQ_*` values (was `UW_*`) — every other file referencing these values is updated in Task 4. `generateEmail`'s signature is unchanged (still synchronous, same parameters).

- [ ] **Step 1: Rename the `TemplateType` union and `ACTION_TEMPLATE_PAIRS`/`SERVICE_TYPE_TO_TEMPLATE`**

Replace:

```typescript
export type TemplateType =
  | 'UW_OverflyRequest'
  | 'UW_OverflyRevision'
  | 'UW_LandingRequest'
  | 'UW_LandingRevision'
  | 'UW_GroundHandlingRequest'
  | 'UW_GroundHandlingRevision'
  | 'Fuel'
  | 'Catering'
  | 'CrewTransport'
  | 'Customs'
  | 'Hotel'
  | 'UW_MultiLegPermit'
  | 'Generic';
```

with:

```typescript
export type TemplateType =
  | 'VIQ_OverflyRequest'
  | 'VIQ_OverflyRevision'
  | 'VIQ_LandingRequest'
  | 'VIQ_LandingRevision'
  | 'VIQ_GroundHandlingRequest'
  | 'VIQ_GroundHandlingRevision'
  | 'Fuel'
  | 'Catering'
  | 'CrewTransport'
  | 'Customs'
  | 'Hotel'
  | 'VIQ_MultiLegPermit'
  | 'Generic';
```

Replace:

```typescript
const ACTION_TEMPLATE_PAIRS: Record<'Overflight' | 'Permit' | 'GroundHandling', Record<RequestAction, TemplateType>> = {
  Overflight: { Request: 'UW_OverflyRequest', Revision: 'UW_OverflyRevision' },
  Permit: { Request: 'UW_LandingRequest', Revision: 'UW_LandingRevision' },
  GroundHandling: { Request: 'UW_GroundHandlingRequest', Revision: 'UW_GroundHandlingRevision' },
};
```

with:

```typescript
const ACTION_TEMPLATE_PAIRS: Record<'Overflight' | 'Permit' | 'GroundHandling', Record<RequestAction, TemplateType>> = {
  Overflight: { Request: 'VIQ_OverflyRequest', Revision: 'VIQ_OverflyRevision' },
  Permit: { Request: 'VIQ_LandingRequest', Revision: 'VIQ_LandingRevision' },
  GroundHandling: { Request: 'VIQ_GroundHandlingRequest', Revision: 'VIQ_GroundHandlingRevision' },
};
```

Replace:

```typescript
export const SERVICE_TYPE_TO_TEMPLATE: Partial<Record<string, TemplateType>> = {
  Permit: 'UW_LandingRequest',
  Overflight: 'UW_OverflyRequest',
  GroundHandling: 'UW_GroundHandlingRequest',
```

with (only the first 3 lines change; the rest of the object — `Fuel: 'Fuel'` through `FlightPlanning: 'Generic'` — is untouched):

```typescript
export const SERVICE_TYPE_TO_TEMPLATE: Partial<Record<string, TemplateType>> = {
  Permit: 'VIQ_LandingRequest',
  Overflight: 'VIQ_OverflyRequest',
  GroundHandling: 'VIQ_GroundHandlingRequest',
```

- [ ] **Step 2: Add the import, `renderTemplate`, and `DEFAULT_TEMPLATES`**

Replace the top import line:

```typescript
import { getAirport, getCountry } from '@/lib/dataStore';
```

with:

```typescript
import { getAirport, getCountry, getMessageTemplateOverride } from '@/lib/dataStore';
```

Add this block after `requestSubject` (which stays unchanged) and before `formatUWDate`:

```typescript
// Single-pass literal {{KEY}} substitution — deliberately not a general
// templating language (no conditionals, no loops). Used for both the
// code-level defaults below and any DB-stored country override, so
// there is exactly one rendering mechanism.
function renderTemplate(str: string, vars: Record<string, string>): string {
  return str.replace(/\{\{(\w+)\}\}/g, (_match, key) => vars[key] ?? '');
}

const COUNTRY_AWARE_TEMPLATE_TYPES: TemplateType[] = [
  'VIQ_OverflyRequest', 'VIQ_OverflyRevision',
  'VIQ_LandingRequest', 'VIQ_LandingRevision',
  'VIQ_GroundHandlingRequest', 'VIQ_GroundHandlingRevision',
];

// The 6 CAA-facing templates' default subject/body, expressed with the
// same {{PLACEHOLDER}} syntax a country override uses — an admin's
// "reset to default" action loads this text verbatim as their starting
// point. Universal-Weather-specific wording ("UNIVERSAL REFERENCE NBR",
// the thirdparty@universalweather.com billing address) has been
// genericized here — these are no longer tied to one specific vendor.
export const DEFAULT_TEMPLATES: Partial<Record<TemplateType, { subject: string; body: string }>> = {
  VIQ_OverflyRequest: {
    subject: 'OVERFLY PERMIT REQUEST - {{TRIP_ID}} - {{REG}} - {{COUNTRY_NAME}}',
    body: `ATTN: CIVIL AVIATION AUTHORITY
RESPECTFULLY REQUEST OVERFLY PERMISSION WITH A 72 HOUR VALIDITY IN CASE OF DELAY BASED ON:
A. OPERATOR: {{OPERATOR}}
    ADDRESS: C/O {{OPERATOR}}
             BILLING ADDRESS: SEE INVOICE INSTRUCTIONS ON FILE
B. REGISTRY: {{REG}}  ACFT TYPE: {{ACTYPE}}   MTOW: {{MTOW}} LB
C. AIRCRAFT CLASSIFICATION: Private - Non Revenue
D. ITINERARY:
        ETD {{DEP_NAME}} / {{DEP}}          {{ETD}}
        ETA {{ARR_NAME}} / {{ARR}}               {{ETA}}
E. ROUTE: VIA APPROVED ATS ROUTES
F. PURPOSE OF FLIGHT: BUSINESS
G. CREW: CAPTAIN {{PIC}} PLUS {{CREW_COUNT}} CREW AND {{PAX_COUNT}} PAX.
THANK YOU FOR YOUR CONSIDERATION OF THIS REQUEST AND AWAITING YOUR APPROVAL WE REMAIN VERY TRULY YOURS.
{{SENDER_NAME}} / {{TRIP_ID}} / {{REG}} / END

REQUEST SENT TO: {{RECIPIENTS}}
{{SENDER_BLOCK}}
ATTACHMENTS:
1. REGISTRATION CERTIFICATE
2. AIRWORTHINESS CERTIFICATE
3. INSURANCE CERTIFICATE
4. PERMIT APPLICATION FORM`,
  },
  VIQ_OverflyRevision: {
    subject: 'OVERFLY PERMIT REVISION - {{TRIP_ID}} - {{REG}} - {{COUNTRY_NAME}}',
    body: `ATTN: CIVIL AVIATION AUTHORITY
REF: OVERFLY PERMIT REVISION FOR:
A. OPERATOR: {{OPERATOR}}
B. REGISTRY: {{REG}}  ACFT TYPE: {{ACTYPE}}   MTOW: {{MTOW}} LB
C. AIRCRAFT CLASSIFICATION: Private - Non Revenue

PREVIOUS ITINERARY:
        ETD {{DEP_NAME}} / {{DEP}}          {{PREV_ETD}}
        ETA {{ARR_NAME}} / {{ARR}}               {{PREV_ETA}}

NEW ITINERARY:
        ETD {{DEP_NAME}} / {{DEP}}          {{ETD}}
        ETA {{ARR_NAME}} / {{ARR}}               {{ETA}}

E. ROUTE: VIA APPROVED ATS ROUTES
F. PURPOSE OF FLIGHT: BUSINESS
G. CREW: CAPTAIN {{PIC}} PLUS {{CREW_COUNT}} CREW AND {{PAX_COUNT}} PAX.

PLEASE REVISE THE PREVIOUSLY GRANTED OVERFLY PERMIT TO REFLECT THE ABOVE ITINERARY CHANGE AND CONFIRM CONTINUED VALIDITY.

ALL OTHER INFORMATION REMAINS UNCHANGED.

THANK YOU FOR YOUR CONSIDERATION OF THIS REQUEST.
{{SENDER_NAME}} / {{TRIP_ID}} / {{REG}} / END

REQUEST SENT TO: {{RECIPIENTS}}
{{SENDER_BLOCK}}`,
  },
  VIQ_LandingRequest: {
    subject: 'LANDING PERMIT REQUEST - {{TRIP_ID}} - {{REG}} - {{COUNTRY_NAME}}',
    body: `ATTN: CIVIL AVIATION AUTHORITY
RESPECTFULLY REQUEST LANDING PERMISSION WITH A 72 HOUR VALIDITY IN CASE OF DELAY BASED ON:
A. OPERATOR: {{OPERATOR}}
    ADDRESS: C/O {{OPERATOR}}
             BILLING ADDRESS: SEE INVOICE INSTRUCTIONS ON FILE
B. REGISTRY: {{REG}}  ACFT TYPE: {{ACTYPE}}   MTOW: {{MTOW}} LB
C. AIRCRAFT CLASSIFICATION: Private - Non Revenue
D. ITINERARY:
        ETD {{DEP_NAME}} / {{DEP}}          {{ETD}}
        ETA {{ARR_NAME}} / {{ARR}}               {{ETA}}
E. PURPOSE OF FLIGHT: BUSINESS
F. CREW: CAPTAIN {{PIC}} PLUS {{CREW_COUNT}} CREW AND {{PAX_COUNT}} PAX.
THANK YOU FOR YOUR CONSIDERATION OF THIS REQUEST AND AWAITING YOUR APPROVAL WE REMAIN VERY TRULY YOURS.
{{SENDER_NAME}} / {{TRIP_ID}} / {{REG}} / END

REQUEST SENT TO: {{RECIPIENTS}}
{{SENDER_BLOCK}}
ATTACHMENTS:
1. REGISTRATION CERTIFICATE
2. AIRWORTHINESS CERTIFICATE
3. INSURANCE CERTIFICATE
4. PERMIT APPLICATION FORM`,
  },
  VIQ_LandingRevision: {
    subject: 'LANDING PERMIT REVISION - {{TRIP_ID}} - {{REG}} - {{COUNTRY_NAME}}',
    body: `ATTN: CIVIL AVIATION AUTHORITY
REF: LANDING PERMIT REVISION FOR:
A. OPERATOR: {{OPERATOR}}
B. REGISTRY: {{REG}}  ACFT TYPE: {{ACTYPE}}   MTOW: {{MTOW}} LB
C. AIRCRAFT CLASSIFICATION: Private - Non Revenue

PREVIOUS ITINERARY:
        ETD {{DEP_NAME}} / {{DEP}}          {{PREV_ETD}}
        ETA {{ARR_NAME}} / {{ARR}}               {{PREV_ETA}}

NEW ITINERARY:
        ETD {{DEP_NAME}} / {{DEP}}          {{ETD}}
        ETA {{ARR_NAME}} / {{ARR}}               {{ETA}}

E. PURPOSE OF FLIGHT: BUSINESS
F. CREW: CAPTAIN {{PIC}} PLUS {{CREW_COUNT}} CREW AND {{PAX_COUNT}} PAX.

PLEASE REVISE THE PREVIOUSLY GRANTED LANDING PERMIT TO REFLECT THE ABOVE ITINERARY CHANGE AND CONFIRM CONTINUED VALIDITY.

ALL OTHER INFORMATION REMAINS UNCHANGED.

THANK YOU FOR YOUR CONSIDERATION OF THIS REQUEST.
{{SENDER_NAME}} / {{TRIP_ID}} / {{REG}} / END

REQUEST SENT TO: {{RECIPIENTS}}
{{SENDER_BLOCK}}`,
  },
  VIQ_GroundHandlingRequest: {
    subject: 'GROUND HANDLING REQUEST - {{TRIP_ID}} - {{REG}} - {{COUNTRY_NAME}}',
    body: `GROUND HANDLING REQUEST
ATTN:      {{OPERATOR}}/{{ARR}}
REF:       {{CLIENT}}
           REGISTRY {{REG}} / {{ACTYPE}} / FLIGHT NBR {{CALL_SIGN}}
           CAPTAIN {{PIC}}
           REFERENCE NBR {{SUPPORT_REF}}

ITINERARY:
DEPART {{DEP_NAME}} / {{DEP}}           {{ETD}}
ARRIVE {{ARR_NAME}} / {{ARR}}        {{ETA}}

PLEASE SPECIFICALLY CONFIRM THE FOLLOWING:

PENDING CONFIRMATION
   1. PAX TRANS RAMP ACCESS:
      PLEASE ARRANGE RAMP ACCESS FOR THE PASSENGER TRANSPORTATION.
      IF VEHICLE ACCESS ISN'T POSSIBLE, THEN ARRANGE FOR A VAN TO TRANSPORT PAX TO/FROM AIRCRAFT TO/FROM TERMINAL/FBO.
   2. DRIVER DETAILS:
      PLEASE PROVIDE THE FOLLOWING INFORMATION ALONG WITH THE TRANSPORTATION CONFIRMATIONS:
      - DRIVER'S NAME:
      - DRIVER'S MOBILE NUMBER:
      - VEHICLE MAKE/MODEL
      - VEHICLE LICENSE PLATE NUMBER
   3. CREW TRANS:
      PLEASE ARRANGE A COMMERCIAL PICK UP FOR CREW MEMBER AND TAKE TO HOTEL.
   4. INFORMATION:
      KINDLY PROVIDE O2 SERVICE FOR THE AIRCRAFT ON ARRIVAL

CANCEL
   1. AIRCRAFT ACCESS

ALL OTHER INFORMATION REMAINS UNCHANGED.

PLEASE ACKNOWLEDGE AND CONFIRM RECEIPT OF THIS MESSAGE CONFIRMING ALL ITEMS CAN BE ARRANGED AS REQUESTED.

THANK YOU AND BEST REGARDS — {{SENDER_NAME}} / {{TRIP_ID}} / END

REQUEST SENT TO: {{RECIPIENTS}}
{{SENDER_BLOCK}}`,
  },
  VIQ_GroundHandlingRevision: {
    subject: 'GROUND HANDLING REVISION - {{TRIP_ID}} - {{REG}} - {{COUNTRY_NAME}}',
    body: `GROUND HANDLING REVISION/CHANGE
ATTN:      {{OPERATOR}}/{{ARR}}
REF:       {{CLIENT}}
           {{REG}} / {{ACTYPE}} / CAPTAIN {{PIC}}
           REFERENCE NBR {{SUPPORT_REF}}

PREVIOUS ITINERARY:
DEPART {{DEP_NAME}} / {{DEP}}             {{PREV_ETD}}
ARRIVE {{ARR_NAME}} / {{ARR}}           {{PREV_ETA}}

NEW ITINERARY:
DEPART {{DEP_NAME}} / {{DEP}}             {{ETD}}
ARRIVE {{ARR_NAME}} / {{ARR}}           {{ETA}}

PLEASE SPECIFICALLY CONFIRM THE FOLLOWING:

CHANGES
1. ITINERARY HAS CHANGED TO THE ABOVE.

PENDING CONFIRMATION
   1. VIP HANDLING:
      PLEASE ARRANGE VIP HANDLING FOR THE ARRIVAL AND DEPARTURE.
   2. CIQ:
      PLEASE ASSIST WITH CUSTOMS
   3. PARKING:
      PLEASE ARRANGE PARKING FOR THE DURATION OF THE STAY
   4. LANDING PERMIT:
      PLEASE ASSIST WITH THE LANDING PERMIT.
   5. INVOICE REQUIREMENT:
      PLS CONFIRM ALL INVOICES AND SUPPORTING DOCUMENTATION ARE SUBMITTED WITHIN 7 DAYS AFTER THE DATE(S) OF SERVICE.

      TO ENSURE PAYMENT, PLEASE ENSURE CREW SIGNATURES ON ALL 3RD PARTY INVOICES.

      SEND INVOICES PER STANDARD BILLING INSTRUCTIONS ON FILE.

ALL OTHER INFORMATION REMAINS UNCHANGED.

PLEASE ACKNOWLEDGE AND CONFIRM RECEIPT OF THIS MESSAGE CONFIRMING ALL ITEMS CAN BE ARRANGED AS REQUESTED.

THANK YOU AND BEST REGARDS — {{SENDER_NAME}} / {{TRIP_ID}} / END

REQUEST SENT TO: {{RECIPIENTS}}
{{SENDER_BLOCK}}`,
  },
};
```

Note: `{{CALL_SIGN}}` is used in `VIQ_GroundHandlingRequest`'s body (the original hardcoded template used `leg?.CallSign || 'TBD'` there) — this placeholder is an addition beyond the spec's originally-enumerated list, needed to faithfully preserve that line's existing content. Step 3 below adds it to the `vars` object alongside the spec's listed placeholders.

- [ ] **Step 3: Restructure `generateEmail` to look up + render the 6 country-aware templates**

Find the `switch (template) {` block inside `generateEmail`. Immediately before it, insert:

```typescript
  if (COUNTRY_AWARE_TEMPLATE_TYPES.includes(template)) {
    const isRevision = template === 'VIQ_OverflyRevision' || template === 'VIQ_LandingRevision' || template === 'VIQ_GroundHandlingRevision';
    const isOverfly = template === 'VIQ_OverflyRequest' || template === 'VIQ_OverflyRevision';
    const lookupCountry = isOverfly ? countryISO2 : arrCountryISO2;
    const prevEtd = isRevision && leg ? new Date(new Date(leg.ETDZ).getTime() - 60 * 60 * 1000).toISOString() : etd;
    const prevEta = isRevision && leg ? new Date(new Date(leg.ETAZ).getTime() - 60 * 60 * 1000).toISOString() : eta;
    const vars: Record<string, string> = {
      OPERATOR: operator.toUpperCase(),
      REG: reg,
      ACTYPE: acType,
      MTOW: mtow.toLocaleString(),
      DEP: dep,
      DEP_NAME: getAirport(dep)?.Name?.toUpperCase() || dep,
      ARR: arr,
      ARR_NAME: getAirport(arr)?.Name?.toUpperCase() || arr,
      ETD: formatUWDate(leg?.ETDZ || etd),
      ETA: formatUWDate(leg?.ETAZ || eta),
      PREV_ETD: isRevision ? formatUWDate(prevEtd) : '',
      PREV_ETA: isRevision ? formatUWDate(prevEta) : '',
      CLIENT: client.toUpperCase(),
      SUPPORT_REF: supportRef || 'TBD',
      PIC: pic?.Name?.toUpperCase() || 'TBD',
      CREW_COUNT: String(Math.max(0, crew.length - 1)),
      PAX_COUNT: String(pax.length),
      TRIP_ID: tripId,
      TOKEN: token,
      SENDER_NAME: senderName,
      SENDER_BLOCK: senderBlock,
      RECIPIENTS: recipients.join(' '),
      COUNTRY_NAME: countryNameFor(lookupCountry),
      CALL_SIGN: leg?.CallSign || 'TBD',
    };
    const override = getMessageTemplateOverride(lookupCountry, template);
    const tpl = override
      ? { subject: override.Subject, body: override.Body }
      : DEFAULT_TEMPLATES[template]!;
    subject = renderTemplate(tpl.subject, vars);
    body = renderTemplate(tpl.body, vars);
  } else {
    switch (template) {
```

Then find and delete these 6 `case` blocks entirely from the switch (they're now handled by the block above): `case 'UW_GroundHandlingRevision': { ... }`, `case 'UW_GroundHandlingRequest': { ... }`, `case 'UW_OverflyRequest': { ... }`, `case 'UW_OverflyRevision': { ... }`, `case 'UW_LandingRequest': { ... }`, `case 'UW_LandingRevision': { ... }`.

The remaining cases (`'Fuel'`, `'Catering'`, `'CrewTransport'`, `'UW_MultiLegPermit'` → rename to `'VIQ_MultiLegPermit'`, `default`) stay exactly as they are today, just closed out with an extra `}` to match the new `else {` wrapper. The `case 'UW_MultiLegPermit':` line itself becomes `case 'VIQ_MultiLegPermit':` — its body is untouched (it isn't one of the 6 country-aware templates and stays hardcoded).

After the switch's closing `}`, add the matching closing brace for the `else` block:

```typescript
    default:
      subject = `Trip Request — ${tripId}/${token.split('/').pop()}`;
      body = `Dear Team,\n\nRegarding trip ${tripId}:\n\nAircraft: ${reg} (${acType})\n\nToken: ${token}\n\nNotes: ${notes || 'None'}\n\nRegards,\nOperations`;
  }
  }

  return { subject, body, token };
}
```

(The final `}` before `return` closes the `else { switch { ... } }` wrapper added in this step; the original single closing `}` after the switch's `default` case becomes two.)

- [ ] **Step 4: Verify — typecheck**

Run: `npx tsc -p tsconfig.client.json --noEmit`. Expect errors in `ComposerPage.tsx` and `ComposeDrawer.tsx` (they still reference `UW_*` string literals) — Task 4 fixes those. Confirm no errors are reported inside `emailTemplates.ts` itself or anywhere else.

- [ ] **Step 5: Snapshot (no git commit)**

Run `git status` to inspect the diff. Do not commit.

---

### Task 4: Rename `UW_*` references in consumers, neutral UI labels

**Files:**
- Modify: `src/client/pages/ComposerPage.tsx`
- Modify: `src/client/components/ComposeDrawer.tsx`
- Modify: `src/client/pages/TripsPage.tsx`
- Modify: `src/client/pages/TripDetail.tsx`
- Modify: `src/client/pages/admin/AdminTrips.tsx`

**Interfaces:**
- Consumes: `TemplateType`'s renamed `VIQ_*` values (Task 3).

- [ ] **Step 1: Rename in `ComposerPage.tsx`**

Find:

```typescript
  const [template, setTemplate] = useState<TemplateType>('UW_OverflyRequest');
```

Replace with:

```typescript
  const [template, setTemplate] = useState<TemplateType>('VIQ_OverflyRequest');
```

Find:

```typescript
    'Universal Weather': [
      'UW_OverflyRequest', 'UW_OverflyRevision', 'UW_LandingRequest', 'UW_LandingRevision',
      'UW_GroundHandlingRequest', 'UW_GroundHandlingRevision', 'UW_MultiLegPermit',
```

Replace with:

```typescript
    'VIQ Permit Requests': [
      'VIQ_OverflyRequest', 'VIQ_OverflyRevision', 'VIQ_LandingRequest', 'VIQ_LandingRevision',
      'VIQ_GroundHandlingRequest', 'VIQ_GroundHandlingRevision', 'VIQ_MultiLegPermit',
```

Find:

```typescript
        <p className="text-muted-foreground">Generate pre-filled request emails with correlation tokens — now with Universal Weather format templates</p>
```

Replace with:

```typescript
        <p className="text-muted-foreground">Generate pre-filled request emails with correlation tokens — including country-overridable permit request templates</p>
```

- [ ] **Step 2: Rename in `ComposeDrawer.tsx`**

Find:

```typescript
  'UW_OverflyRequest', 'UW_OverflyRevision', 'UW_LandingRequest', 'UW_LandingRevision',
  'UW_GroundHandlingRequest', 'UW_GroundHandlingRevision',
```

Replace with:

```typescript
  'VIQ_OverflyRequest', 'VIQ_OverflyRevision', 'VIQ_LandingRequest', 'VIQ_LandingRevision',
  'VIQ_GroundHandlingRequest', 'VIQ_GroundHandlingRevision',
```

- [ ] **Step 3: Neutral label in `TripsPage.tsx`**

Find:

```typescript
                      <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-slate-600">UW:{trip.SupportRef}</span>
```

Replace with:

```typescript
                      <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-slate-600">REF:{trip.SupportRef}</span>
```

- [ ] **Step 4: Neutral label in `TripDetail.tsx`**

Find:

```typescript
            <p className="text-xs text-muted-foreground">UW REF: {trip.SupportRef}</p>
```

Replace with:

```typescript
            <p className="text-xs text-muted-foreground">REF: {trip.SupportRef}</p>
```

- [ ] **Step 5: Neutral label in `AdminTrips.tsx`**

Find:

```typescript
                          UW:{selectedTrip.SupportRef}
```

Replace with:

```typescript
                          REF:{selectedTrip.SupportRef}
```

- [ ] **Step 6: Verify — typecheck and build**

Run: `npx tsc -p tsconfig.client.json --noEmit`. Expect 0 exit — this resolves the errors Task 3 Step 4 flagged as expected.

Run: `grep -rn "UW_" src/client` (or the `Grep` tool with pattern `UW_`, path `src/client`). Expect zero matches.

- [ ] **Step 7: Snapshot (no git commit)**

Run `git status` to inspect the diff. Do not commit.

---

### Task 5: New admin page — `MessageTemplatesPage.tsx`

**Files:**
- Create: `src/client/pages/admin/MessageTemplatesPage.tsx`
- Modify: `src/client/App.tsx` (register the route)
- Modify: `src/client/components/Layout.tsx` (add the nav entry)

**Interfaces:**
- Consumes: `getCountryList` (existing), `getMessageTemplateList`/`saveMessageTemplate`/`deleteMessageTemplate` (Task 2), `DEFAULT_TEMPLATES`/`COUNTRY_AWARE_TEMPLATE_TYPES` (exported from Task 3's `emailTemplates.ts`) — `COUNTRY_AWARE_TEMPLATE_TYPES` needs an `export` keyword added in Task 3 if not already exported (it's declared as a plain `const` in Task 3 Step 2 — add `export` to that declaration now: `export const COUNTRY_AWARE_TEMPLATE_TYPES: TemplateType[] = [...]`).

- [ ] **Step 1: Write the page**

`src/client/pages/admin/MessageTemplatesPage.tsx`:

```typescript
import { useState, useMemo } from 'react';
import {
  getCountryList, getMessageTemplateList, saveMessageTemplate, deleteMessageTemplate,
} from '@/lib/dataStore';
import { DEFAULT_TEMPLATES, COUNTRY_AWARE_TEMPLATE_TYPES, type TemplateType } from '@/lib/emailTemplates';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

const TEMPLATE_TYPE_LABELS: Record<string, string> = {
  VIQ_OverflyRequest: 'Overfly Permit — Request',
  VIQ_OverflyRevision: 'Overfly Permit — Revision',
  VIQ_LandingRequest: 'Landing Permit — Request',
  VIQ_LandingRevision: 'Landing Permit — Revision',
  VIQ_GroundHandlingRequest: 'Ground Handling — Request',
  VIQ_GroundHandlingRevision: 'Ground Handling — Revision',
};

const SAMPLE_VARS: Record<string, string> = {
  OPERATOR: 'JETSTREAM EXECUTIVE AVIATION', REG: 'N123AB', ACTYPE: 'GLF6', MTOW: '99,600',
  DEP: 'KTEB', DEP_NAME: 'TETERBORO', ARR: 'EGLL', ARR_NAME: 'LONDON HEATHROW',
  ETD: '25AUG/1200 UTC', ETA: '25AUG/2000 UTC', PREV_ETD: '25AUG/1100 UTC', PREV_ETA: '25AUG/1900 UTC',
  CLIENT: 'SAMPLE CLIENT', SUPPORT_REF: 'SR-12345', PIC: 'JOHN SMITH', CREW_COUNT: '2', PAX_COUNT: '4',
  TRIP_ID: '2608099', TOKEN: '2608099/GEN-SAMPLE', SENDER_NAME: 'OPERATIONS TEAM',
  SENDER_BLOCK: 'PHONE: +1 555 0100   E-MAIL: ops@example.com',
  RECIPIENTS: 'caa@example.gov', COUNTRY_NAME: 'SAMPLE COUNTRY', CALL_SIGN: 'N123AB',
};

function renderPreview(str: string): string {
  return str.replace(/\{\{(\w+)\}\}/g, (_m, key) => SAMPLE_VARS[key] ?? `{{${key}}}`);
}

export default function MessageTemplatesPage() {
  const countries = getCountryList();
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = () => setRefreshKey((k) => k + 1);
  const overrides = useMemo(() => getMessageTemplateList(), [refreshKey]);

  const [countryIso2, setCountryIso2] = useState(countries[0]?.ISO2 || '');
  const [templateType, setTemplateType] = useState<TemplateType>('VIQ_OverflyRequest');
  const existing = overrides.find((o) => o.CountryISO2 === countryIso2 && o.TemplateType === templateType);
  const defaultTpl = DEFAULT_TEMPLATES[templateType];

  const [subject, setSubject] = useState(existing?.Subject || defaultTpl?.subject || '');
  const [body, setBody] = useState(existing?.Body || defaultTpl?.body || '');

  const selectPair = (iso2: string, type: TemplateType) => {
    setCountryIso2(iso2);
    setTemplateType(type);
    const found = overrides.find((o) => o.CountryISO2 === iso2 && o.TemplateType === type);
    const def = DEFAULT_TEMPLATES[type];
    setSubject(found?.Subject || def?.subject || '');
    setBody(found?.Body || def?.body || '');
  };

  const isUnchanged = subject === (existing?.Subject || defaultTpl?.subject || '') && body === (existing?.Body || defaultTpl?.body || '');

  const handleSave = async () => {
    await saveMessageTemplate({ ID: existing?.ID, CountryISO2: countryIso2, TemplateType: templateType, Subject: subject, Body: body });
    refresh();
  };

  const handleResetToDefault = async () => {
    if (!existing) return;
    await deleteMessageTemplate(existing.ID);
    setSubject(defaultTpl?.subject || '');
    setBody(defaultTpl?.body || '');
    refresh();
  };

  const countryOverridesForType = overrides.filter((o) => o.TemplateType === templateType);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Message Templates</h1>
        <p className="text-muted-foreground">Country-specific overrides for CAA-facing permit request templates</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1">
          <Label>Country</Label>
          <Select value={countryIso2} onValueChange={(v) => selectPair(v, templateType)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {countries.map((c) => <SelectItem key={c.ISO2} value={c.ISO2}>{c.Name} ({c.ISO2})</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Template Type</Label>
          <Select value={templateType} onValueChange={(v) => selectPair(countryIso2, v as TemplateType)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {COUNTRY_AWARE_TEMPLATE_TYPES.map((t) => <SelectItem key={t} value={t}>{TEMPLATE_TYPE_LABELS[t] || t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base font-semibold">
              {countries.find((c) => c.ISO2 === countryIso2)?.Name} — {TEMPLATE_TYPE_LABELS[templateType]}
              {existing && <Badge variant="secondary" className="ml-2">OVERRIDE ACTIVE</Badge>}
            </CardTitle>
            <div className="flex gap-2">
              {existing && <Button size="sm" variant="outline" onClick={handleResetToDefault}>Reset to Default</Button>}
              <Button size="sm" onClick={handleSave} disabled={isUnchanged}>Save Override</Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label>Subject</Label>
              <input
                className="h-9 w-full rounded-md border bg-background px-2 text-sm font-mono"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Body</Label>
              <textarea
                className="w-full rounded-md border bg-background p-2 font-mono text-xs"
                rows={24}
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-sm font-semibold">Preview (sample data)</CardTitle></CardHeader>
            <CardContent>
              <div className="mb-2 text-xs font-medium text-muted-foreground">{renderPreview(subject)}</div>
              <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded border bg-muted/20 p-2 text-[10px]">{renderPreview(body)}</pre>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-sm font-semibold">Countries with an override for this type</CardTitle></CardHeader>
            <CardContent className="space-y-1">
              {countryOverridesForType.length === 0 ? (
                <p className="text-xs text-muted-foreground">None yet — every country uses the default.</p>
              ) : (
                countryOverridesForType.map((o) => (
                  <button
                    key={o.ID}
                    className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-accent"
                    onClick={() => selectPair(o.CountryISO2, o.TemplateType as TemplateType)}
                  >
                    {countries.find((c) => c.ISO2 === o.CountryISO2)?.Name || o.CountryISO2}
                  </button>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Export `COUNTRY_AWARE_TEMPLATE_TYPES` from `emailTemplates.ts`**

In `src/client/lib/emailTemplates.ts`, find the declaration added in Task 3 Step 2:

```typescript
const COUNTRY_AWARE_TEMPLATE_TYPES: TemplateType[] = [
```

Change to:

```typescript
export const COUNTRY_AWARE_TEMPLATE_TYPES: TemplateType[] = [
```

- [ ] **Step 3: Register the route**

In `src/client/App.tsx`, find:

```typescript
import AdminAssets from './pages/admin/AdminAssets'
```

Add after it:

```typescript
import MessageTemplatesPage from './pages/admin/MessageTemplatesPage'
```

Find:

```typescript
        <Route path="/admin/assets" element={<AdminAssets />} />
```

Add after it:

```typescript
        <Route path="/admin/message-templates" element={<MessageTemplatesPage />} />
```

- [ ] **Step 4: Add the nav entry**

In `src/client/components/Layout.tsx`, find the `adminItems` array:

```typescript
const adminItems = [
  { path: '/admin', label: 'Admin Dashboard', icon: Shield },
  { path: '/admin/trips', label: 'Manage Trips', icon: Briefcase },
  { path: '/admin/assets', label: 'Assets', icon: Users },
  { path: '/admin/billing', label: 'Billing', icon: DollarSign },
  { path: '/admin/settings', label: 'Settings', icon: Settings },
];
```

Replace with:

```typescript
const adminItems = [
  { path: '/admin', label: 'Admin Dashboard', icon: Shield },
  { path: '/admin/trips', label: 'Manage Trips', icon: Briefcase },
  { path: '/admin/assets', label: 'Assets', icon: Users },
  { path: '/admin/message-templates', label: 'Message Templates', icon: MessageSquare },
  { path: '/admin/billing', label: 'Billing', icon: DollarSign },
  { path: '/admin/settings', label: 'Settings', icon: Settings },
];
```

`MessageSquare` is already imported at the top of `Layout.tsx` (used elsewhere in the `navItems` array for `/comms`) — no new icon import needed.

- [ ] **Step 5: Verify — typecheck and build**

Run: `npx tsc -p tsconfig.client.json --noEmit`. Expect 0 exit.

Run: `npm run build:client`. Expect 0 exit, 0 errors.

- [ ] **Step 6: Snapshot (no git commit)**

Run `git status` to inspect the diff. Do not commit.

---

### Task 6: Full build + end-to-end verification + docs (controller-performed)

**Files:** `README.md`, `ARCHITECTURE.md` (documentation only).

- [ ] **Step 1: Full build**

Stop any running dev server (`taskkill //F //IM node.exe` on Windows if the Prisma query engine DLL is locked), then run in order: `npm run prisma:generate`, `npx nest build`, `npm run build:client`. Expect 0 exit on all three.

- [ ] **Step 2: Restart the server**

`npm run start:prod` in the background; poll `curl http://localhost:4001/` until it returns 200.

- [ ] **Step 3: Live-verify the override lifecycle**

Mint a JWT (`node -e "const jwt = require('jsonwebtoken'); require('dotenv').config(); console.log(jwt.sign({ sub: process.env.ADMIN_USERNAME, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '15m' }));"`).

`GET /api/message-templates` — confirm empty array (baseline, 0 rows).

`POST /api/message-templates` with a real seeded country ISO2, `templateType: "VIQ_OverflyRequest"`, and a short test `subject`/`body` containing a `{{REG}}` placeholder. Confirm the response echoes it back with an `id`.

Attempt a second `POST` for the same country + `templateType` — confirm it returns `400` with the spec's exact duplicate-pair message, not a raw 500.

`PATCH /api/message-templates/:id` changing only `subject` — confirm `body` is unchanged (partial update).

`DELETE /api/message-templates/:id` — confirm removal, `GET /api/message-templates` back to empty.

- [ ] **Step 4: Live-verify the override lookup + rendering logic**

Since `getMessageTemplateOverride`/`renderTemplate`/`generateEmail` are pure client-side functions with no server endpoint to curl directly, replicate the lookup+render logic in a `node -e` script against live API data — the same verification style used for 4d-3's `personExpiryStatus` and the Aircraft/Operator sub-project's `resolveBillToAddress`. Create a throwaway override for a real country + `VIQ_LandingRequest` with body text `Hello {{REG}} at {{ARR_NAME}}`, fetch it back via `GET /api/message-templates`, and confirm a simple regex substitution (`str.replace(/\{\{(\w+)\}\}/g, ...)`) against sample `REG`/`ARR_NAME` values produces the expected rendered string. Delete the throwaway override afterward.

- [ ] **Step 5: Confirm the rename left no stray references**

Run (via the `Grep` tool, not raw shell, per this session's tool conventions): pattern `UW_`, path `src/client`. Expect zero matches.

- [ ] **Step 6: Confirm counts back at baseline**

`GET /api/message-templates` → 0.

- [ ] **Step 7: Update `README.md` / `ARCHITECTURE.md`**

Add a section to `README.md` (near the existing "Service request templates and admin history" section if one exists, else near the Aircraft/Operator section — check what's already there before choosing the location) covering: the `UW_` → `VIQ_` rename and why, the Universal-Weather-specific text cleanup, the `MessageTemplate` model and its 6-type scope, the `DEFAULT_TEMPLATES`/`renderTemplate`/cache mechanism (one rendering path for both default and override), and the new `/admin/message-templates` page. Add a short `ARCHITECTURE.md` note only if this introduces an owning-surface contract worth recording (e.g. "the 6 country-aware template types are the only ones `MessageTemplate` accepts — enforced at the DTO layer") — judge against what's already written rather than assuming a new section is needed.

---

## Completion notes (2026-08-25)

All 6 tasks executed inline (executing-plans, no subagents/worktree), no
`git commit` run at any point.

- **Task 1** (schema/backend): migration generated and read before
  applying — purely additive (`CREATE TABLE message_templates` + 2
  indexes + 1 FK, nothing touching existing tables), matching the spec's
  prediction exactly. `npx nest build` clean.
- **Task 2** (frontend cache/CRUD): `MessageTemplateOverride` interface,
  cache, mapper, 6th `preloadReferenceData` fetch, `getMessageTemplateList`/
  `getMessageTemplateOverride`/`saveMessageTemplate`/`deleteMessageTemplate`
  all added. `npx tsc --noEmit` clean.
- **Task 3** (rename + `DEFAULT_TEMPLATES` + restructure): all 6
  `UW_*` → `VIQ_*` renames, all 6 template bodies converted to
  `{{PLACEHOLDER}}` format with Universal-Weather-specific text
  genericized, `generateEmail` restructured into a lookup+render path
  for the 6 country-aware types plus an `else` branch for the rest.
  `requestSubject()` removed as dead code (caught before it could trip
  `noUnusedLocals`, which is enabled in this file unlike `dataStore.ts`).
  Typecheck showed exactly the two expected consumer errors, nothing
  unexpected.
- **Task 4** (consumer renames): `ComposerPage.tsx`, `ComposeDrawer.tsx`
  renamed; 3 "UW:"/"UW REF:" labels genericized. `npx tsc --noEmit`
  clean; `Grep` for `UW_` across `src/client` returned zero matches.
- **Task 5** (admin page): `MessageTemplatesPage.tsx` built, route +
  nav entry added. `COUNTRY_AWARE_TEMPLATE_TYPES` was already exported
  from Task 3 (no separate export step needed). Full client build clean.
- **Task 6** (verify + docs): full build chain clean, server restarted.
  Live-verified via curl + JWT: baseline empty → create → duplicate-pair
  correctly rejected with the spec's exact message → partial `PATCH`
  left `body` untouched → render simulation (`node -e` replicating
  `renderTemplate`) produced the exact expected output against live
  data → delete → baseline restored. Final `Grep` for `UW_` across all
  of `src` (not just `src/client`) also returned zero matches. README.md
  and ARCHITECTURE.md both updated — the latter's pre-existing "Service
  request templates and admin history" section (which still referenced
  `UW_*` and the now-removed `requestSubject()`) was corrected, not just
  appended to.

**Known, not fully verified:** the same standing limitation as every
prior sub-project — the new admin page's actual rendering/interaction
(pickers, save/reset buttons, live preview) was not exercised in a real
browser, since this session has no browser access. Build artifact and
every API-level behavior are confirmed; the in-browser UI is not.

**Mid-execution interruption:** the user sent a 15-point VIQ UX
simplification proposal partway through Task 6 (after the server build
but before the final live-verification steps), explicitly asking for it
to be debated, not implemented. Task 6 was completed to a clean,
verified state first (build/server left mid-flight would have been a
worse handoff), then the debate was addressed as a separate response —
no part of that proposal was implemented as part of this plan.

## Self-Review Notes

- **Spec coverage:** Rename (Tasks 3-4), UW-text cleanup (Task 3's `DEFAULT_TEMPLATES`), schema/backend (Task 1), cache/CRUD (Task 2), `generateEmail` restructure with the single-rendering-path design (Task 3), admin page (Task 5), verification including the duplicate-pair rejection and fallback behavior (Task 6). Every spec section has a task.
- **Placeholder scan:** All 6 template bodies are reproduced verbatim (converted) in Task 3 Step 2 — no "similar to the original" shorthand. The one deviation from the spec's exact enumerated placeholder list (`{{CALL_SIGN}}`, needed by `VIQ_GroundHandlingRequest`'s existing "FLIGHT NBR" line) is called out explicitly, not silently added.
- **Type consistency:** `getMessageTemplateOverride(countryIso2, templateType)` (Task 2) is called with that exact signature in Task 3 Step 3. `DEFAULT_TEMPLATES`/`COUNTRY_AWARE_TEMPLATE_TYPES` (Task 3) are imported and used with matching names in Task 5's page. `MessageTemplateOverride`'s field names (`ID`/`CountryISO2`/`TemplateType`/`Subject`/`Body`) match exactly between Task 2's interface definition, `saveMessageTemplate`'s parameter shape, and Task 5's page usage.
