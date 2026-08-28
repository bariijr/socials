# VIQ Multi-Channel Contacts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single Email/Phone(/AOGContact/ContactEmail/ContactPhone/BillingEmails) fields on Provider, Operator, Client, and Person with a shared, typed, multi-entry `ContactChannel` list (Email/Phone/SMS/WhatsApp, each entry independently markable `preferred` and/or `forBilling`).

**Architecture:** One new Prisma model (`ContactChannel`) with four optional owner FKs (exactly one set per row, `onDelete: Cascade`), following the same "exactly one owner" convention `DocAttachment` already uses in this codebase. A single shared `ContactChannelsService.replace()` (whole-list delete+insert in a transaction) is called from all four entity services on create/update — no separate `/contacts` CRUD routes. Client-side, a shared `<ContactChannelEditor>` component and a `getPreferredContact()` helper are reused everywhere a channel needs editing or reading.

**Tech Stack:** NestJS 10 + Prisma 5 + PostgreSQL 16 (backend), React + Vite + TypeScript (frontend). No automated test suite exists in this project — verification is `tsc --noEmit` + a full build + live browser checks against the running app at `http://localhost:4001`, matching this project's established practice.

**Spec:** `docs/superpowers/specs/2026-08-28-viq-contact-channels-design.md`

## Global Constraints

- Migrations in this environment are hand-written SQL under
  `prisma/migrations/<timestamp>_<name>/migration.sql` and applied via
  `npx prisma migrate deploy` followed by `npx prisma generate` —
  `prisma migrate dev` does not work non-interactively here. Never run
  `prisma migrate dev`.
- Every mutating service method logs to `AuditService` (`this.audit.log`
  or `.logDiff`) — follow the existing pattern in each file being edited,
  don't drop audit calls.
- After any client-side edit, run `npm run build:client` (not
  `build:server` alone — it wipes `dist/public`) before calling a task
  done.
- Column names in Postgres are `snake_case` via Prisma `@map`; TypeScript
  interface fields on the client are `PascalCase` (e.g. `ChannelType`,
  not `channelType`) to match every existing type in
  `src/client/data/types.ts` / `src/client/lib/dataStore.ts`.
- `channelType` values are exactly the strings `'Email'`, `'Phone'`,
  `'SMS'`, `'WhatsApp'` (both server DTOs and client TypeScript union)
  — no other casing or extra types.

---

## Task 1: Prisma schema — `ContactChannel` model + migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260828120000_add_contact_channels/migration.sql`

**Interfaces:**
- Produces: `ContactChannel` Prisma model (table `contact_channels`) with
  columns `id, channel_type, value, label, preferred, for_billing,
  sort_order, provider_id, operator_id, client_id, person_id`. Later
  tasks query this via `prisma.contactChannel` and reference the back-relation
  `channels` added to `Provider`/`Operator`/`Client`/`Person`.

- [ ] **Step 1: Add the `ContactChannel` model and back-relations to `prisma/schema.prisma`**

Add this new model directly after the `Client` model (around line 350,
right before `AppSettings`):

```prisma
// Shared multi-channel contact list for Provider/Operator/Client/Person —
// exactly one of the four owner FKs is set per row, same convention as
// DocAttachment's tripId/personId/aircraftRegistration exclusivity
// (enforced in ContactChannelsService, not a DB constraint).
model ContactChannel {
  id          Int      @id @default(autoincrement())
  channelType String   @map("channel_type") // Email | Phone | SMS | WhatsApp
  value       String
  label       String?
  preferred   Boolean  @default(false)
  forBilling  Boolean  @default(false) @map("for_billing")
  sortOrder   Int      @default(0) @map("sort_order")

  providerId String? @map("provider_id")
  operatorId String? @map("operator_id")
  clientId   String? @map("client_id")
  personId   String? @map("person_id")

  provider Provider? @relation(fields: [providerId], references: [providerId], onDelete: Cascade)
  operator Operator? @relation(fields: [operatorId], references: [operatorId], onDelete: Cascade)
  client   Client?   @relation(fields: [clientId], references: [clientId], onDelete: Cascade)
  person   Person?   @relation(fields: [personId], references: [personId], onDelete: Cascade)

  @@index([providerId])
  @@index([operatorId])
  @@index([clientId])
  @@index([personId])
  @@map("contact_channels")
}
```

In `model Provider` (around line 183), remove the `email`, `aogContact`
lines and add `channels ContactChannel[]` next to the existing `services`/
`priceItems` relation lines:

```prisma
  services   Service[]
  priceItems PriceItem[]
  channels   ContactChannel[]
```

In `model Operator` (around line 163), remove `email` and `phone`, add
to its relations block:

```prisma
  aircraft Aircraft[]
  clients  Client[]
  channels ContactChannel[]
```

In `model Client` (around line 327), remove `contactEmail`,
`contactPhone`, and `billingEmails` lines, add to its relations block:

```prisma
  linkedOperator Operator? @relation(fields: [linkedOperatorId], references: [operatorId])
  trips          Trip[]
  channels       ContactChannel[]
```

In `model Person` (around line 457), remove the `phone` and `email`
lines, add to its relations block:

```prisma
  ratings        PersonRating[]
  legAssignments LegPersonAssignment[]
  docs           DocAttachment[]
  channels       ContactChannel[]
```

- [ ] **Step 2: Write the hand-written migration SQL**

Create `prisma/migrations/20260828120000_add_contact_channels/migration.sql`:

```sql
-- CreateTable
CREATE TABLE "contact_channels" (
    "id" SERIAL NOT NULL,
    "channel_type" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "label" TEXT,
    "preferred" BOOLEAN NOT NULL DEFAULT false,
    "for_billing" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "provider_id" TEXT,
    "operator_id" TEXT,
    "client_id" TEXT,
    "person_id" TEXT,

    CONSTRAINT "contact_channels_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contact_channels_provider_id_idx" ON "contact_channels"("provider_id");
CREATE INDEX "contact_channels_operator_id_idx" ON "contact_channels"("operator_id");
CREATE INDEX "contact_channels_client_id_idx" ON "contact_channels"("client_id");
CREATE INDEX "contact_channels_person_id_idx" ON "contact_channels"("person_id");

-- AddForeignKey
ALTER TABLE "contact_channels" ADD CONSTRAINT "contact_channels_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "providers"("provider_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contact_channels" ADD CONSTRAINT "contact_channels_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "operators"("operator_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contact_channels" ADD CONSTRAINT "contact_channels_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("client_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contact_channels" ADD CONSTRAINT "contact_channels_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("person_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Migrate existing single-value contact data into contact_channels before
-- dropping the legacy columns. Each migrated value is marked preferred
-- (it was the only value that entity had).
INSERT INTO "contact_channels" ("channel_type", "value", "preferred", "for_billing", "sort_order", "provider_id")
SELECT 'Email', "email", true, false, 0, "provider_id" FROM "providers" WHERE "email" IS NOT NULL AND "email" <> '';

INSERT INTO "contact_channels" ("channel_type", "value", "preferred", "for_billing", "sort_order", "provider_id")
SELECT 'Phone', "aog_contact", true, false, 1, "provider_id" FROM "providers" WHERE "aog_contact" IS NOT NULL AND "aog_contact" <> '';

INSERT INTO "contact_channels" ("channel_type", "value", "preferred", "for_billing", "sort_order", "operator_id")
SELECT 'Email', "email", true, false, 0, "operator_id" FROM "operators" WHERE "email" IS NOT NULL AND "email" <> '';

INSERT INTO "contact_channels" ("channel_type", "value", "preferred", "for_billing", "sort_order", "operator_id")
SELECT 'Phone', "phone", true, false, 1, "operator_id" FROM "operators" WHERE "phone" IS NOT NULL AND "phone" <> '';

INSERT INTO "contact_channels" ("channel_type", "value", "preferred", "for_billing", "sort_order", "client_id")
SELECT 'Email', "contact_email", true, false, 0, "client_id" FROM "clients" WHERE "contact_email" IS NOT NULL AND "contact_email" <> '';

INSERT INTO "contact_channels" ("channel_type", "value", "preferred", "for_billing", "sort_order", "client_id")
SELECT 'Phone', "contact_phone", true, false, 1, "client_id" FROM "clients" WHERE "contact_phone" IS NOT NULL AND "contact_phone" <> '';

-- billing_emails is an array — unnest() produces one row per element;
-- WHERE guards against both NULL and empty arrays.
INSERT INTO "contact_channels" ("channel_type", "value", "preferred", "for_billing", "sort_order", "client_id")
SELECT 'Email', unnest("billing_emails"), false, true, 2, "client_id" FROM "clients" WHERE "billing_emails" IS NOT NULL AND array_length("billing_emails", 1) > 0;

INSERT INTO "contact_channels" ("channel_type", "value", "preferred", "for_billing", "sort_order", "person_id")
SELECT 'Phone', "phone", true, false, 0, "person_id" FROM "persons" WHERE "phone" IS NOT NULL AND "phone" <> '';

INSERT INTO "contact_channels" ("channel_type", "value", "preferred", "for_billing", "sort_order", "person_id")
SELECT 'Email', "email", true, false, 1, "person_id" FROM "persons" WHERE "email" IS NOT NULL AND "email" <> '';

-- Drop legacy columns now that their data lives in contact_channels.
ALTER TABLE "providers" DROP COLUMN "email";
ALTER TABLE "providers" DROP COLUMN "aog_contact";
ALTER TABLE "operators" DROP COLUMN "email";
ALTER TABLE "operators" DROP COLUMN "phone";
ALTER TABLE "clients" DROP COLUMN "contact_email";
ALTER TABLE "clients" DROP COLUMN "contact_phone";
ALTER TABLE "clients" DROP COLUMN "billing_emails";
ALTER TABLE "persons" DROP COLUMN "phone";
ALTER TABLE "persons" DROP COLUMN "email";
```

- [ ] **Step 3: Apply the migration and regenerate the Prisma client**

Run: `npx prisma migrate deploy && npx prisma generate`
Expected: `1 migration found... contact_channels` applied with no errors,
followed by `Generated Prisma Client`.

- [ ] **Step 4: Verify the data migration against real seed data**

Run: `npx prisma studio` is interactive — instead, verify via a one-off
query:
```bash
node -e "const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.contactChannel.findMany().then(r=>{console.log(r.length,'rows');console.log(r.slice(0,5));process.exit(0)})"
```
Expected: row count roughly matches the sum of previously-non-empty
email/phone/aogContact/contactEmail/contactPhone/billingEmails values
across providers/operators/clients/persons (not zero, given this
project's seed data already has these fields populated per earlier
`AdminAssets` screenshots this session, e.g. provider `GTEST`'s aircraft
data and seeded operators).

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260828120000_add_contact_channels
git commit -m "Add ContactChannel model and migrate legacy contact fields into it"
```

---

## Task 2: Shared `ContactChannelDto` + `ContactChannelsService` + `ContactsModule`

**Files:**
- Create: `src/server/modules/contacts/dto/contact-channel.dto.ts`
- Create: `src/server/modules/contacts/contact-channels.service.ts`
- Create: `src/server/modules/contacts/contacts.module.ts`
- Modify: `src/server/app.module.ts`

**Interfaces:**
- Consumes: `PrismaService` (global, injected via constructor — no import needed, per `Global Constraints`).
- Produces: `ContactChannelDto` class (fields: `channelType: 'Email'|'Phone'|'SMS'|'WhatsApp'`, `value: string`, `label?: string`, `preferred?: boolean`, `forBilling?: boolean`) — imported by every entity DTO in Tasks 3–5. `ContactChannelsService.replace(owner: ContactChannelOwner, channels: ContactChannelDto[])` and `.include()` (a reusable Prisma `include` fragment) — called from every entity service in Tasks 3–5. `ContactChannelOwner = { providerId?: string; operatorId?: string; clientId?: string; personId?: string }`.

- [ ] **Step 1: Write `ContactChannelDto`**

Create `src/server/modules/contacts/dto/contact-channel.dto.ts`:

```typescript
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

const CHANNEL_TYPES = ['Email', 'Phone', 'SMS', 'WhatsApp'] as const;
export type ChannelType = (typeof CHANNEL_TYPES)[number];

export class ContactChannelDto {
  @IsIn(CHANNEL_TYPES)
  channelType!: ChannelType;

  @IsString()
  @MaxLength(200)
  value!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  label?: string;

  @IsOptional()
  @IsBoolean()
  preferred?: boolean;

  @IsOptional()
  @IsBoolean()
  forBilling?: boolean;
}

export { CHANNEL_TYPES };
```

- [ ] **Step 2: Write `ContactChannelsService`**

Create `src/server/modules/contacts/contact-channels.service.ts`:

```typescript
import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ContactChannelDto } from './dto/contact-channel.dto';

export interface ContactChannelOwner {
  providerId?: string;
  operatorId?: string;
  clientId?: string;
  personId?: string;
}

const OWNER_KEYS = ['providerId', 'operatorId', 'clientId', 'personId'] as const;

// Reusable Prisma `include` fragment so every entity's list/get query
// returns channels in a stable, display-ready order.
export const CONTACT_CHANNELS_INCLUDE = {
  channels: { orderBy: { sortOrder: 'asc' as const } },
};

@Injectable()
export class ContactChannelsService {
  constructor(private readonly prisma: PrismaService) {}

  // Whole-list replace: delete every existing row for this owner, then
  // insert the new set in the order given (array index becomes sortOrder).
  // No separate CRUD routes — every entity's create/update passes its
  // full `channels` array here after the entity row itself is written.
  async replace(owner: ContactChannelOwner, channels: ContactChannelDto[] = []) {
    const setKeys = OWNER_KEYS.filter((k) => owner[k]);
    if (setKeys.length !== 1) {
      throw new BadRequestException('Exactly one owner (providerId, operatorId, clientId, or personId) must be set.');
    }
    await this.prisma.$transaction([
      this.prisma.contactChannel.deleteMany({ where: owner }),
      ...channels.map((c, i) =>
        this.prisma.contactChannel.create({
          data: {
            ...owner,
            channelType: c.channelType,
            value: c.value,
            label: c.label,
            preferred: c.preferred ?? false,
            forBilling: c.forBilling ?? false,
            sortOrder: i,
          },
        }),
      ),
    ]);
  }
}
```

- [ ] **Step 3: Write `ContactsModule` as `@Global()`**

Create `src/server/modules/contacts/contacts.module.ts`:

```typescript
import { Global, Module } from '@nestjs/common';
import { ContactChannelsService } from './contact-channels.service';

// @Global(): every entity module (Reference/Clients/Persons) injects
// ContactChannelsService without listing ContactsModule in its own
// `imports` — same convention this codebase already uses for
// PrismaModule/AuditModule (see src/server/prisma/prisma.module.ts).
@Global()
@Module({
  providers: [ContactChannelsService],
  exports: [ContactChannelsService],
})
export class ContactsModule {}
```

- [ ] **Step 4: Register `ContactsModule` in `app.module.ts`**

In `src/server/app.module.ts`, add the import:
```typescript
import { ContactsModule } from './modules/contacts/contacts.module';
```
And add `ContactsModule,` to the `imports` array, right after `AuditModule,` (both are global cross-cutting modules, keep them grouped):
```typescript
    AuditModule,
    ContactsModule,
    ReferenceModule,
```

- [ ] **Step 5: Verify the server still boots**

Run: `npm run build:server`
Expected: `nest build` succeeds with no errors (this only compiles —
Tasks 3-5 wire the new service into real controllers before this is
runtime-tested end to end).

- [ ] **Step 6: Commit**

```bash
git add src/server/modules/contacts src/server/app.module.ts
git commit -m "Add shared ContactChannelsService and ContactsModule"
```

---

## Task 3: Wire Provider + Operator (reference module)

**Files:**
- Modify: `src/server/modules/reference/dto/create-provider.dto.ts`
- Modify: `src/server/modules/reference/dto/create-operator.dto.ts`
- Modify: `src/server/modules/reference/reference.service.ts`

**Interfaces:**
- Consumes: `ContactChannelDto`, `ContactChannelsService`, `CONTACT_CHANNELS_INCLUDE` from Task 2.
- Produces: `providers()`/`operators()`/`operator(id)` now return rows with a `channels: ContactChannel[]` array attached (Prisma's raw field names — `channelType`/`forBilling`/`sortOrder` etc., not yet client-shaped). Consumed by Task 6's `mapProviderFromApi`/`mapOperatorFromApi`.

- [ ] **Step 1: Update `CreateProviderDto`**

In `src/server/modules/reference/dto/create-provider.dto.ts`, remove the
`email` and `aogContact` fields entirely, and add at the end (before the
`user` field):

```typescript
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { ContactChannelDto } from '../../contacts/dto/contact-channel.dto';
```
(replaces the existing import line — `IsEmail` is no longer used since
`email` is removed)

Add before the `user` field:
```typescript
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ContactChannelDto)
  channels?: ContactChannelDto[];
```

- [ ] **Step 2: Update `CreateOperatorDto`**

In `src/server/modules/reference/dto/create-operator.dto.ts`, remove the
`email` and `phone` fields, update the import (drop `IsEmail`, add the
same `Type`/`IsArray`/`ValidateNested` + `ContactChannelDto` import as
Step 1), and add the same `channels?: ContactChannelDto[]` block before
`user`.

- [ ] **Step 3: Wire `reference.service.ts`**

Add the import at the top of `src/server/modules/reference/reference.service.ts`:
```typescript
import { ContactChannelsService, CONTACT_CHANNELS_INCLUDE } from '../contacts/contact-channels.service';
```

Add `private readonly contactChannels: ContactChannelsService,` to the
constructor parameter list (alongside the existing `prisma`/`audit`
params — match whatever the existing constructor already injects).

Replace the `operators()`/`operator()`/`createOperator()`/
`updateOperator()`/`providers()`/`createProvider()`/`updateProvider()`
methods (lines 188–249 as read during planning) with:

```typescript
  operators() {
    return this.prisma.operator.findMany({ orderBy: { name: 'asc' }, include: CONTACT_CHANNELS_INCLUDE });
  }

  operator(operatorId: string) {
    return this.prisma.operator.findUnique({ where: { operatorId }, include: CONTACT_CHANNELS_INCLUDE });
  }

  async createOperator(dto: CreateOperatorDto) {
    const user = dto.user || 'SYSTEM';
    const { user: _user, channels, ...rest } = dto;
    const operator = await this.prisma.operator.create({ data: rest });
    await this.contactChannels.replace({ operatorId: operator.operatorId }, channels ?? []);
    await this.audit.log(user, 'Operator', operator.operatorId, 'Created', '', operator.operatorId);
    return this.operator(operator.operatorId);
  }

  async updateOperator(operatorId: string, dto: UpdateOperatorDto) {
    const before = await this.prisma.operator.findUnique({ where: { operatorId } });
    if (!before) throw new NotFoundException(`Operator ${operatorId} not found`);
    const user = dto.user || 'SYSTEM';
    const { user: _user, channels, ...rest } = dto;
    const operator = await this.prisma.operator.update({ where: { operatorId }, data: rest });
    if (channels !== undefined) await this.contactChannels.replace({ operatorId }, channels);
    await this.audit.logDiff(user, 'Operator', operatorId, before as unknown as Record<string, unknown>, operator as unknown as Record<string, unknown>);
    return this.operator(operatorId);
  }

  providers() {
    return this.prisma.provider.findMany({ orderBy: { name: 'asc' }, include: CONTACT_CHANNELS_INCLUDE });
  }

  async createProvider(dto: CreateProviderDto) {
    const user = dto.user || 'SYSTEM';
    const { user: _user, channels, ...rest } = dto;
    const provider = await this.prisma.provider.create({ data: rest });
    await this.contactChannels.replace({ providerId: provider.providerId }, channels ?? []);
    await this.audit.log(user, 'Provider', provider.providerId, 'Created', '', provider.providerId);
    return this.prisma.provider.findUnique({ where: { providerId: provider.providerId }, include: CONTACT_CHANNELS_INCLUDE });
  }

  async updateProvider(providerId: string, dto: UpdateProviderDto) {
    const before = await this.prisma.provider.findUnique({ where: { providerId } });
    if (!before) throw new NotFoundException(`Provider ${providerId} not found`);
    const user = dto.user || 'SYSTEM';
    const { user: _user, channels, ...rest } = dto;
    const provider = await this.prisma.provider.update({ where: { providerId }, data: rest });
    if (channels !== undefined) await this.contactChannels.replace({ providerId }, channels);
    await this.audit.logDiff(user, 'Provider', providerId, before as unknown as Record<string, unknown>, provider as unknown as Record<string, unknown>);
    return this.prisma.provider.findUnique({ where: { providerId }, include: CONTACT_CHANNELS_INCLUDE });
  }
```

Leave `deleteOperator`/`deleteProvider` unchanged — the `ContactChannel`
rows for a deleted owner are removed automatically by the FK's
`onDelete: Cascade`.

- [ ] **Step 4: Build and smoke-test**

Run: `npm run build:server`
Expected: compiles with no errors — this confirms the DTO field removals
didn't leave any other reference.service.ts code still reading
`dto.email`/`dto.aogContact`/`dto.phone` (search the file for those
identifiers if the build fails on them).

- [ ] **Step 5: Commit**

```bash
git add src/server/modules/reference
git commit -m "Wire Provider and Operator to ContactChannel"
```

---

## Task 4: Wire Client (clients module)

**Files:**
- Modify: `src/server/modules/clients/dto/create-client.dto.ts`
- Modify: `src/server/modules/clients/clients.service.ts`

**Interfaces:**
- Consumes: `ContactChannelDto`, `ContactChannelsService`, `CONTACT_CHANNELS_INCLUDE` from Task 2.
- Produces: `findAll()`/`findOne()` return `Client` rows with `channels: ContactChannel[]` attached — consumed by Task 6's `mapClientFromApi`.

- [ ] **Step 1: Update `CreateClientDto`**

In `src/server/modules/clients/dto/create-client.dto.ts`, remove
`contactEmail`, `contactPhone`, and `billingEmails` fields. Update the
import line to drop `ArrayMaxSize`/`IsEmail` (no longer used) and add
`IsArray`/`ValidateNested`/`Type`/`ContactChannelDto`:

```typescript
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { ContactChannelDto } from '../../contacts/dto/contact-channel.dto';
```

Add before the `user` field:
```typescript
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ContactChannelDto)
  channels?: ContactChannelDto[];
```

- [ ] **Step 2: Wire `clients.service.ts`**

Add the import and constructor injection (same pattern as Task 3, Step 3):
```typescript
import { ContactChannelsService, CONTACT_CHANNELS_INCLUDE } from '../contacts/contact-channels.service';
```
Add `private readonly contactChannels: ContactChannelsService,` to the constructor.

Replace `findAll`, `findOne`, `create`, `update`:

```typescript
  findAll(search?: string) {
    const where: Prisma.ClientWhereInput | undefined = search
      ? { name: { contains: search, mode: 'insensitive' } }
      : undefined;
    return this.prisma.client.findMany({ where, orderBy: { name: 'asc' }, take: search ? 20 : undefined, include: CONTACT_CHANNELS_INCLUDE });
  }

  async findOne(clientId: string) {
    const client = await this.prisma.client.findUnique({ where: { clientId }, include: CONTACT_CHANNELS_INCLUDE });
    if (!client) throw new NotFoundException(`Client ${clientId} not found`);
    return client;
  }

  async create(dto: CreateClientDto) {
    const user = dto.user || 'SYSTEM';
    const { user: _user, channels, ...rest } = dto;
    const client = await this.prisma.client.create({ data: rest });
    await this.contactChannels.replace({ clientId: client.clientId }, channels ?? []);
    await this.audit.log(user, 'Client', client.clientId, 'Created', '', client.clientId);
    return this.findOne(client.clientId);
  }

  async update(clientId: string, dto: UpdateClientDto) {
    const before = await this.findOne(clientId);
    const user = dto.user || 'SYSTEM';
    const { user: _user, channels, ...rest } = dto;
    const client = await this.prisma.client.update({ where: { clientId }, data: rest });
    if (channels !== undefined) await this.contactChannels.replace({ clientId }, channels);
    await this.audit.logDiff(user, 'Client', clientId, before as unknown as Record<string, unknown>, client as unknown as Record<string, unknown>);
    return this.findOne(clientId);
  }
```

Leave `remove()` unchanged.

- [ ] **Step 3: Build**

Run: `npm run build:server`
Expected: compiles clean.

- [ ] **Step 4: Commit**

```bash
git add src/server/modules/clients
git commit -m "Wire Client to ContactChannel"
```

---

## Task 5: Wire Person (persons module)

**Files:**
- Modify: `src/server/modules/persons/dto/create-person.dto.ts`
- Modify: `src/server/modules/persons/persons.service.ts`

**Interfaces:**
- Consumes: `ContactChannelDto`, `ContactChannelsService`, `CONTACT_CHANNELS_INCLUDE` from Task 2.
- Produces: `findAll()`/`findAllPaginated()`/`findOne()` return `Person`-shaped rows with `channels: ContactChannel[]` attached — consumed by Task 6's `mapPersonFromApi`.

- [ ] **Step 1: Update `CreatePersonDto`**

In `src/server/modules/persons/dto/create-person.dto.ts`, remove `phone`
and `email` fields. Update the import to drop `IsEmail` and add
`IsArray`/`ValidateNested`/`Type`/`ContactChannelDto` (same pattern as
prior tasks). Add before `user`:

```typescript
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ContactChannelDto)
  channels?: ContactChannelDto[];
```

- [ ] **Step 2: Wire `persons.service.ts`**

Add the import and constructor injection (same pattern as prior tasks).

Replace `findAll`, `findAllPaginated`, `findOne`, `create`, `update`:

```typescript
  async findAll(params: { legId?: string; tripId?: string }) {
    const { legId, tripId } = params;
    if (legId) {
      const assignments = await this.prisma.legPersonAssignment.findMany({
        where: { legId },
        include: { person: { include: CONTACT_CHANNELS_INCLUDE } },
      });
      return assignments.map((a) => ({
        ...a.person, role: a.role, commercialFlightEta: a.commercialFlightEta, hotel: a.hotel,
      }));
    }
    if (tripId) {
      const assignments = await this.prisma.legPersonAssignment.findMany({
        where: { leg: { tripId } },
        include: { person: { include: CONTACT_CHANNELS_INCLUDE }, leg: { select: { legId: true, seq: true, depIcao: true, arrIcao: true } } },
        orderBy: { leg: { seq: 'asc' } },
      });
      return assignments.map((a) => ({
        ...a.person, role: a.role, commercialFlightEta: a.commercialFlightEta, hotel: a.hotel,
        legId: a.leg.legId, legSeq: a.leg.seq, legDepIcao: a.leg.depIcao, legArrIcao: a.leg.arrIcao,
      }));
    }
    return this.prisma.person.findMany({ include: CONTACT_CHANNELS_INCLUDE });
  }

  async findAllPaginated(page: number, limit: number) {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.prisma.person.findMany({ skip, take: limit, include: CONTACT_CHANNELS_INCLUDE }),
      this.prisma.person.count(),
    ]);
    return { data, page, limit, total, totalPages: Math.ceil(total / limit) };
  }

  async findOne(personId: string) {
    const person = await this.prisma.person.findUnique({ where: { personId }, include: CONTACT_CHANNELS_INCLUDE });
    if (!person) throw new NotFoundException(`Person ${personId} not found`);
    return person;
  }

  async create(dto: CreatePersonDto) {
    const user = dto.user || 'SYSTEM';
    const { user: _user, channels, medicalValidUntil, passportExpiryDate, passportDateOfBirth, ...rest } = dto;
    const person = await this.prisma.person.create({
      data: {
        ...rest,
        medicalValidUntil: medicalValidUntil ? new Date(medicalValidUntil) : undefined,
        passportExpiryDate: passportExpiryDate ? new Date(passportExpiryDate) : undefined,
        passportDateOfBirth: passportDateOfBirth ? new Date(passportDateOfBirth) : undefined,
      },
    });
    await this.contactChannels.replace({ personId: person.personId }, channels ?? []);
    await this.audit.log(user, 'Person', person.personId, 'Created', '', person.personId);
    return this.findOne(person.personId);
  }

  async update(personId: string, dto: UpdatePersonDto) {
    const before = await this.findOne(personId);
    const user = dto.user || 'SYSTEM';
    const { user: _user, channels, medicalValidUntil, passportExpiryDate, passportDateOfBirth, ...rest } = dto;
    const person = await this.prisma.person.update({
      where: { personId },
      data: {
        ...rest,
        medicalValidUntil: medicalValidUntil ? new Date(medicalValidUntil) : undefined,
        passportExpiryDate: passportExpiryDate ? new Date(passportExpiryDate) : undefined,
        passportDateOfBirth: passportDateOfBirth ? new Date(passportDateOfBirth) : undefined,
      },
    });
    if (channels !== undefined) await this.contactChannels.replace({ personId }, channels);
    await this.audit.logDiff(user, 'Person', personId, before as unknown as Record<string, unknown>, person as unknown as Record<string, unknown>);
    return this.findOne(personId);
  }
```

Leave `remove`/`assign`/`unassign`/`assignAllLegs`/`findAssignments`
unchanged.

- [ ] **Step 3: Build**

Run: `npm run build:server`
Expected: compiles clean.

- [ ] **Step 4: Commit**

```bash
git add src/server/modules/persons
git commit -m "Wire Person to ContactChannel"
```

---

## Task 6: Client-side types + `getPreferredContact` helper

**Files:**
- Modify: `src/client/data/types.ts`
- Modify: `src/client/lib/dataStore.ts`

**Interfaces:**
- Produces: `ContactChannel` interface (`{ ID: number; ChannelType: 'Email'|'Phone'|'SMS'|'WhatsApp'; Value: string; Label?: string; Preferred: boolean; ForBilling: boolean }`), `getPreferredContact(channels: ContactChannel[] | undefined, type: ContactChannel['ChannelType']): string | undefined` (exported from `dataStore.ts`) — consumed by every UI task below. Updated `Provider`/`Operator`/`Client`/`Person` interfaces each gain `Channels: ContactChannel[]` and lose their old single-value fields.

- [ ] **Step 1: Add `ContactChannel` type and update `Person`/`Provider` in `types.ts`**

In `src/client/data/types.ts`, add near the top (before `Person`, since
`Person` will reference it):

```typescript
export interface ContactChannel {
  ID: number;
  ChannelType: 'Email' | 'Phone' | 'SMS' | 'WhatsApp';
  Value: string;
  Label?: string;
  Preferred: boolean;
  ForBilling: boolean;
}
```

In `Person` (line 240), remove the `Phone?: string;` and `Email?: string;`
lines (and the `// Contact` comment above them), replace with:
```typescript
  // Contact
  Channels: ContactChannel[];
```

In `Provider` (line 110), remove `Email: string;`, `Contacts: { Label: string; Email: string }[];`, keep `AOGContact` removed too (it becomes a Phone-type channel), and add `Channels: ContactChannel[];`:
```typescript
export interface Provider {
  ProviderID: string;
  Name: string;
  ServiceTypes: ServiceType[];
  ScopeType: 'ICAO' | 'Country' | 'Global';
  Scope: string;
  WorkingHoursZ: string;
  Channels: ContactChannel[];
}
```

- [ ] **Step 2: Update `Operator`/`Client` in `dataStore.ts`**

In `src/client/lib/dataStore.ts`, update `Operator` (remove `Email`,
`Phone`; add `Channels`):
```typescript
export interface Operator {
  OperatorID: string;
  Name: string;
  Type: string;
  Address: string;
  Fleet: string[];
  PrimaryContact: string;
  BillingAddress: string;
  PaymentTerms: string;
  Status: string;
  Notes: string;
  Channels: ContactChannel[];
}
```

Update `Client` (remove `ContactEmail`, `ContactPhone`, `BillingEmails`;
add `Channels`):
```typescript
export interface Client {
  ClientID: string;
  Name: string;
  IsOperator: boolean;
  LinkedOperatorID?: string;
  BillingAddressLine1?: string;
  BillingAddressLine2?: string;
  BillingCity?: string;
  BillingState?: string;
  BillingPostalCode?: string;
  BillingCountry?: string;
  Notes?: string;
  Channels: ContactChannel[];
}
```

Add the import for `ContactChannel` at the top of `dataStore.ts` next to
the existing `import type { ... } from '@/data/types'` line (add
`ContactChannel` to that import list).

- [ ] **Step 3: Add a shared channel mapper and `getPreferredContact`**

In `src/client/lib/dataStore.ts`, add near the top of the file (after the
imports, before the first mapper function — this is used by every
`map*FromApi` function below):

```typescript
function mapChannelsFromApi(channels: any[] | undefined): ContactChannel[] {
  return (channels ?? []).map((c) => ({
    ID: c.id,
    ChannelType: c.channelType,
    Value: c.value,
    Label: c.label ?? undefined,
    Preferred: c.preferred,
    ForBilling: c.forBilling,
  }));
}

// Used everywhere a UI needs a single display/autofill value rather than
// the full list (e.g. "what email do we send this trip's invoice to").
// Preferred entries of the requested type win; falls back to the first
// entry of that type if none is marked preferred; undefined if there are
// none at all.
export function getPreferredContact(channels: ContactChannel[] | undefined, type: ContactChannel['ChannelType']): string | undefined {
  const matches = (channels ?? []).filter((c) => c.ChannelType === type);
  return matches.find((c) => c.Preferred)?.Value ?? matches[0]?.Value;
}

// Used by the New Trip wizard's single-value Phone/Email quick-entry
// inputs — upserts a single preferred entry of the given type into a
// channels array without disturbing any other channel types already
// present (e.g. setting Phone doesn't wipe an existing Email).
export function setPreferredChannelValue(channels: ContactChannel[], type: ContactChannel['ChannelType'], value: string): ContactChannel[] {
  const others = channels.filter((c) => c.ChannelType !== type);
  if (!value.trim()) return others;
  return [...others, { ID: 0, ChannelType: type, Value: value, Preferred: true, ForBilling: false }];
}
```

- [ ] **Step 4: Update `mapProviderFromApi`/`mapOperatorFromApi`/`mapClientFromApi`/`mapPersonFromApi`**

Replace `mapProviderFromApi` (the one with the `Contacts` synthesis
comment) with:
```typescript
function mapProviderFromApi(p: any): Provider {
  return {
    ProviderID: p.providerId,
    Name: p.name,
    ServiceTypes: p.serviceTypes,
    ScopeType: p.scopeType,
    Scope: p.scope,
    WorkingHoursZ: p.workingHoursZ ?? '',
    Channels: mapChannelsFromApi(p.channels),
  };
}
```

Replace `mapOperatorFromApi`'s `email`/`phone` lines with
`Channels: mapChannelsFromApi(o.channels),` (keep every other field
unchanged).

Replace `mapClientFromApi`'s `contactEmail`/`contactPhone`/
`billingEmails` lines with `Channels: mapChannelsFromApi(c.channels),`
(keep every other field unchanged).

Replace `mapPersonFromApi`'s `Phone`/`Email` lines with
`Channels: mapChannelsFromApi(p.channels),` (keep every other field
unchanged).

- [ ] **Step 5: Update `saveProvider`/`saveOperator`/`saveClient`/`savePerson` request bodies**

In `saveProvider` (around line 1402), the request body currently sends
`email`/`aogContact`/etc. — remove those two, add `channels` built from
the client-shaped array:
```typescript
    channels: p.Channels.map((c) => ({ channelType: c.ChannelType, value: c.Value, label: c.Label, preferred: c.Preferred, forBilling: c.ForBilling })),
```
Apply the identical `channels:` line (same mapping) to `saveOperator`'s
body (remove its `email:`/`phone:` lines), `saveClient`'s body (remove
its `contactEmail: c.ContactEmail || undefined,`, `contactPhone: c.ContactPhone || undefined,`,
and `billingEmails: c.BillingEmails,` lines — `dataStore.ts:1600-1601`
and `:1608`), and `savePerson`'s body (remove its `phone:`/`email:`
lines, currently `dataStore.ts:829`).

- [ ] **Step 6: Typecheck**

Run: `npx tsc -p tsconfig.client.json --noEmit`
Expected: errors listing every remaining call site that still reads the
removed fields (`.Email`, `.Phone`, `.ContactEmail`, `.ContactPhone`,
`.AOGContact`, `.BillingEmails`, `.Contacts`) — this is expected and
exactly the list Tasks 8–12 fix. Do not "fix" those call sites in this
task; just confirm the error list matches the files named in this plan's
later tasks (`AdminAssets.tsx`, `ComposeDrawer.tsx`, `ReferencePage.tsx`,
`TripDetail.tsx`, `NewTripWizard.tsx`) and no others.

- [ ] **Step 7: Commit**

```bash
git add src/client/data/types.ts src/client/lib/dataStore.ts
git commit -m "Add ContactChannel client type, mappers, and save-body wiring"
```

---

## Task 7: Shared `ContactChannelEditor` UI component

**Files:**
- Create: `src/client/components/ContactChannelEditor.tsx`

**Interfaces:**
- Consumes: `ContactChannel` type from `@/data/types`.
- Produces: `<ContactChannelEditor channels={ContactChannel[]} onChange={(next: ContactChannel[]) => void} />` — consumed by Task 8's four `AdminAssets.tsx` panels.

- [ ] **Step 1: Write the component**

Create `src/client/components/ContactChannelEditor.tsx`:

```tsx
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Plus, Trash2 } from 'lucide-react';
import type { ContactChannel } from '@/data/types';

const CHANNEL_TYPES: ContactChannel['ChannelType'][] = ['Email', 'Phone', 'SMS', 'WhatsApp'];

// Repeating add/remove list of typed contact entries, shared by every
// AdminAssets detail panel that edits Provider/Operator/Client/Person.
// Whole-array replace on every change — matches the server's
// ContactChannelsService.replace() whole-list-save semantics, so there's
// nothing to reconcile between this component's local edits and what
// gets sent on Save.
export function ContactChannelEditor({ channels, onChange }: {
  channels: ContactChannel[];
  onChange: (next: ContactChannel[]) => void;
}) {
  const update = (index: number, patch: Partial<ContactChannel>) => {
    onChange(channels.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  };
  const remove = (index: number) => {
    onChange(channels.filter((_, i) => i !== index));
  };
  const add = () => {
    onChange([...channels, { ID: 0, ChannelType: 'Email', Value: '', Preferred: false, ForBilling: false }]);
  };

  return (
    <div className="space-y-2">
      <Label>Contact Channels</Label>
      {channels.map((c, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2 rounded-md border p-2">
          <Select value={c.ChannelType} onValueChange={(v) => update(i, { ChannelType: v as ContactChannel['ChannelType'] })}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CHANNEL_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input placeholder="Value" value={c.Value} onChange={(e) => update(i, { Value: e.target.value })} className="w-40 flex-1 min-w-[10rem]" />
          <Input placeholder="Label (optional)" value={c.Label || ''} onChange={(e) => update(i, { Label: e.target.value })} className="w-32" />
          <label className="flex items-center gap-1 text-xs whitespace-nowrap">
            <Checkbox checked={c.Preferred} onCheckedChange={(v) => update(i, { Preferred: v === true })} /> Preferred
          </label>
          {c.ChannelType === 'Email' && (
            <label className="flex items-center gap-1 text-xs whitespace-nowrap">
              <Checkbox checked={c.ForBilling} onCheckedChange={(v) => update(i, { ForBilling: v === true })} /> For Billing
            </label>
          )}
          <Button size="icon" variant="ghost" onClick={() => remove(i)} title="Remove"><Trash2 className="h-3.5 w-3.5 text-rose-600" /></Button>
        </div>
      ))}
      <Button size="sm" variant="outline" onClick={add}><Plus className="h-4 w-4" /> Add Contact</Button>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -p tsconfig.client.json --noEmit`
Expected: no new errors from this file (it isn't imported anywhere yet,
so this only confirms the file itself compiles standalone).

- [ ] **Step 3: Commit**

```bash
git add src/client/components/ContactChannelEditor.tsx
git commit -m "Add shared ContactChannelEditor component"
```

---

## Task 8: Wire `ContactChannelEditor` into AdminAssets' 4 panels

**Files:**
- Modify: `src/client/pages/admin/AdminAssets.tsx`

**Interfaces:**
- Consumes: `ContactChannelEditor` from Task 7, `ContactChannel` type from Task 6.

- [ ] **Step 1: `ProviderPanel`**

In `ProviderPanel` (the Vendors tab's panel), remove the `email`/`aogContact`
`useState` hooks and their `<Label>Email</Label>`/`<Label>AOG Contact</Label>`
`<Input>` fields entirely. Add a `channels` state hook initialized from
the provider prop, and render the editor:
```typescript
  const [channels, setChannels] = useState<ContactChannel[]>(provider?.Channels ?? []);
```
Place `<ContactChannelEditor channels={channels} onChange={setChannels} />`
where the removed Email/AOG Contact fields were. In `handleSave`, remove
`Email: email.trim(), AOGContact: aogContact.trim(),` from the
`saveProvider(...)` payload and add `Channels: channels,` instead.

- [ ] **Step 2: `OperatorPanel`**

Same pattern: remove `email`/`phone` state + fields, add
`channels` state seeded from `operator?.Channels ?? []`, render the
editor where those fields were, replace `Email:`/`Phone:` in
`saveOperator(...)`'s payload with `Channels: channels,`.

- [ ] **Step 3: `ClientPanel`**

Remove `contactEmail`/`contactPhone`/`billingEmails` state + their
`<Input>` fields (including the "Billing Emails (comma-separated)"
field). Add `channels` state seeded from `client?.Channels ?? []`,
render the editor. In `handleSave`, remove
`ContactEmail:`/`ContactPhone:`/`BillingEmails:` from the
`saveClient(...)` payload and add `Channels: channels,`.

- [ ] **Step 4: `PersonPanel`**

Remove `phone`/`email` state + fields, add `channels` state seeded from
`person?.Channels ?? []`, render the editor. In `handleSave`, remove
`Phone:`/`Email:` from the `savePerson(...)` payload and add
`Channels: channels,`.

- [ ] **Step 5: Add the import**

At the top of `AdminAssets.tsx`, add:
```typescript
import { ContactChannelEditor } from '@/components/ContactChannelEditor';
import type { ContactChannel } from '@/data/types';
```

- [ ] **Step 6: Update the 4 list-card `renderItem` callbacks**

Each panel's corresponding `MasterDetailList` `renderItem` in the same
file currently shows the old field in its card `subtitle`/`meta` (e.g.
Provider's card shows `subtitle={p.Email}`, Person's shows
`subtitle={p.Phone}`). Replace each with `getPreferredContact(...,
'Email')` / `getPreferredContact(..., 'Phone')` as appropriate — import
`getPreferredContact` from `@/lib/dataStore` alongside the existing
dataStore imports at the top of the file. Client's card `subtitle`
(`[c.ContactEmail, c.ContactPhone].filter(Boolean).join(' · ')`) becomes
`[getPreferredContact(c.Channels, 'Email'), getPreferredContact(c.Channels, 'Phone')].filter(Boolean).join(' · ')`.

- [ ] **Step 7: Typecheck and build**

Run: `npx tsc -p tsconfig.client.json --noEmit && npm run build:client`
Expected: no errors referencing `AdminAssets.tsx`.

- [ ] **Step 8: Commit**

```bash
git add src/client/pages/admin/AdminAssets.tsx
git commit -m "Wire ContactChannelEditor into AdminAssets' Vendor/Operator/Client/Person panels"
```

---

## Task 9: `TripDetail.tsx` — `VendorContactCard` rewrite + crew table

**Files:**
- Modify: `src/client/pages/TripDetail.tsx`

**Interfaces:**
- Consumes: `getPreferredContact` from `@/lib/dataStore` (Task 6).

- [ ] **Step 1: Rewrite `VendorContactCard`**

Replace the whole `VendorContactCard` function (currently reading
`provider.AOGContact`/`provider.Email`/`provider.Contacts`) with a
version that groups the provider's real channels by type and renders one
pill per entry:

```tsx
const CHANNEL_ICON: Record<ContactChannel['ChannelType'], typeof Phone> = {
  Phone: Phone, WhatsApp: MessageCircle, Email: Mail, SMS: Phone,
};
const CHANNEL_HREF = (type: ContactChannel['ChannelType'], value: string) => {
  const digits = digitsOnly(value);
  if (type === 'Email') return `mailto:${value}`;
  if (type === 'WhatsApp') return `https://wa.me/${digits}`;
  if (type === 'SMS') return `sms:${value}`;
  return `tel:${value}`;
};

// Quick-action contact card for the service's assigned vendor — one
// clickable pill per contact channel (tel:/sms:/mailto:/wa.me), grouped
// in channel-type order rather than a hardcoded single phone+email pair.
function VendorContactCard({ provider }: { provider: Provider }) {
  return (
    <div className="rounded border bg-muted/30 p-2 space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold">{provider.Name}</span>
        {provider.WorkingHoursZ && <span className="text-[10px] text-muted-foreground">{provider.WorkingHoursZ}</span>}
      </div>
      {provider.Channels.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {provider.Channels.map((c, i) => {
            const Icon = CHANNEL_ICON[c.ChannelType];
            return (
              <a
                key={i}
                href={CHANNEL_HREF(c.ChannelType, c.Value)}
                target={c.ChannelType === 'WhatsApp' ? '_blank' : undefined}
                rel={c.ChannelType === 'WhatsApp' ? 'noreferrer' : undefined}
                className="inline-flex items-center gap-1 rounded border bg-background px-1.5 py-0.5 text-[10px] hover:bg-accent"
              >
                <Icon className="h-3 w-3" /> {c.Label || c.Value}
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

Add `ContactChannel` to the existing `import type { ... } from '@/data/types'`
line in this file if it isn't already imported there.

- [ ] **Step 2: Update the crew/pax register table**

Replace the two lines at the "CONTACT" column (`{p.Phone && <div>{p.Phone}</div>}` / `{p.Email && <div>{p.Email}</div>}`) with:
```tsx
                          {getPreferredContact(p.Channels, 'Phone') && <div>{getPreferredContact(p.Channels, 'Phone')}</div>}
                          {getPreferredContact(p.Channels, 'Email') && <div>{getPreferredContact(p.Channels, 'Email')}</div>}
```
Add `getPreferredContact` to this file's existing `import { ... } from '@/lib/dataStore'` line.

- [ ] **Step 3: Typecheck and build**

Run: `npx tsc -p tsconfig.client.json --noEmit && npm run build:client`
Expected: no errors referencing `TripDetail.tsx`.

- [ ] **Step 4: Commit**

```bash
git add src/client/pages/TripDetail.tsx
git commit -m "Rewrite VendorContactCard and crew table for multi-channel contacts"
```

---

## Task 10: `ComposeDrawer.tsx` + `ReferencePage.tsx` Providers card

**Files:**
- Modify: `src/client/components/ComposeDrawer.tsx`
- Modify: `src/client/pages/ReferencePage.tsx`

**Interfaces:**
- Consumes: `getPreferredContact` from `@/lib/dataStore` (Task 6).

- [ ] **Step 1: `ComposeDrawer.tsx` recipients**

Replace:
```typescript
  const recipients = selectedProvider?.Contacts.map((c) => c.Email) ?? [];
```
with:
```typescript
  const recipients = selectedProvider?.Channels.filter((c) => c.ChannelType === 'Email').map((c) => c.Value) ?? [];
```

- [ ] **Step 2: `ReferencePage.tsx` Providers card**

In the Providers tab's `EntityListCard` `meta` (the tile/large-view line
currently showing `p.Email`), and the "details" `<Table>`'s Email column
(`<TableCell className="text-xs text-muted-foreground">{p.Email}</TableCell>`),
and the large-view hardcoded card (the one with `<Fuel className="h-3 w-3" />{p.Email}`) —
replace each `p.Email` with `getPreferredContact(p.Channels, 'Email')`,
and each `p.AOGContact` (the `<Phone className="h-3 w-3" />{p.AOGContact}`
line) with `getPreferredContact(p.Channels, 'Phone')`. Add
`getPreferredContact` to this file's `import { ... } from '@/lib/dataStore'`
line.

- [ ] **Step 3: Typecheck and build**

Run: `npx tsc -p tsconfig.client.json --noEmit && npm run build:client`
Expected: no errors referencing either file.

- [ ] **Step 4: Commit**

```bash
git add src/client/components/ComposeDrawer.tsx src/client/pages/ReferencePage.tsx
git commit -m "Read preferred contact channels in ComposeDrawer and ReferencePage"
```

---

## Task 11: `NewTripWizard.tsx` person rows

**Files:**
- Modify: `src/client/pages/admin/NewTripWizard.tsx`

**Interfaces:**
- Consumes: `getPreferredContact`, `setPreferredChannelValue` from `@/lib/dataStore` (Task 6).

- [ ] **Step 1: Update the person row's Phone/Email inputs**

The wizard's quick-add person row keeps its existing simple single-Phone/
single-Email UX (no repeating editor here — this is a fast trip-creation
flow, not the roster edit panel) but now backs those two inputs with the
`Channels` array so the data round-trips correctly through `savePerson`.
Replace:
```tsx
          <Input
            value={person.Phone || ''}
            onChange={(e) => onChange({ ...person, Phone: e.target.value })}
            placeholder="+1-555-0100"
          />
```
with:
```tsx
          <Input
            value={getPreferredContact(person.Channels, 'Phone') || ''}
            onChange={(e) => onChange({ ...person, Channels: setPreferredChannelValue(person.Channels ?? [], 'Phone', e.target.value) })}
            placeholder="+1-555-0100"
          />
```
and replace the Email input identically, substituting `'Email'` for
`'Phone'` and the placeholder text unchanged.

- [ ] **Step 2: Ensure new person objects start with an empty `Channels` array**

Find where this wizard constructs a blank new person entry (search this
file for wherever a bare `{ PersonID: ..., Name: '', ... }`-shaped object
is created for a newly-added row) and add `Channels: []` to that object
literal.

- [ ] **Step 3: Add the import**

Add `getPreferredContact, setPreferredChannelValue` to this file's
existing `import { ... } from '@/lib/dataStore'` line.

- [ ] **Step 4: Typecheck and build**

Run: `npx tsc -p tsconfig.client.json --noEmit && npm run build:client`
Expected: no errors referencing `NewTripWizard.tsx`.

- [ ] **Step 5: Commit**

```bash
git add src/client/pages/admin/NewTripWizard.tsx
git commit -m "Back NewTripWizard's person Phone/Email inputs with ContactChannel"
```

---

## Task 12: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Full clean build**

Run: `npm run build`
Expected: both `build:server` and `build:client` succeed with zero
TypeScript errors.

- [ ] **Step 2: Confirm the app boots against the migrated database**

Run: `npm run start:dev` (or however this project's dev server is
already running per the current session — check for an existing process
on port 4001 first rather than starting a second one).
Expected: no startup errors, `http://localhost:4001` loads.

- [ ] **Step 3: Live browser verification — Vendor**

Navigate to `/admin/assets`, Vendors tab, select an existing provider
(e.g. one with a pre-migration email). Confirm the Contact Channels
editor shows a migrated `Email` entry marked Preferred. Add a `WhatsApp`
entry, Save, reload the page, reselect the same provider, confirm both
entries persisted.

- [ ] **Step 4: Live browser verification — Operator, Client, Person**

Repeat Step 3's add-entry-and-reload check for one Operator, one Client
(confirm any pre-existing `billingEmails` value shows up as an Email
entry with "For Billing" checked), and one Person.

- [ ] **Step 5: Live browser verification — downstream reads**

Open a trip's `TripDetail` page for a leg with a service assigned to the
provider edited in Step 3; confirm `VendorContactCard` shows a pill for
every channel including the new WhatsApp entry. Open that service's
Compose drawer; confirm the Email recipient field reflects the
provider's Email channel(s). Check `/reference`'s Providers tab shows
the same provider's contact summary correctly in both Details and Tile
view.

- [ ] **Step 6: Live browser verification — New Trip wizard**

Start a new trip, add a crew/pax person with a Phone and Email, complete
the wizard. Open the created trip's Crew & Pax Register tab; confirm
the entered Phone/Email display correctly (round-tripped through
`Channels`, not the old flat fields).

- [ ] **Step 7: Update the project README changelog**

Add a dated section to `README.md` (matching this project's established
per-feature changelog convention — see the many existing `## <Title>
(2026-08-28)` sections) documenting: the new `ContactChannel` model, the
migration of the 7 legacy fields + `billingEmails`, and which files now
read/write channels instead. Note this is sub-project 1 of 3 (settings
multi-provider backend and the in-app mail client are separate,
not-yet-started follow-ups).

- [ ] **Step 8: Final commit**

```bash
git add README.md
git commit -m "Document multi-channel contacts feature in README"
```
