# Vendor Capability & Questionnaire Pipeline (MVP) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let VIQ send a vendor a link to confirm/deny their operational capability for a specific country/airport + service type, capture Admin approval of that response, and have the Vendor Resolution Engine treat an unapproved (or rejected) capability as ineligible for that exact context — while every Provider that has never been asked stays exactly as eligible as it is today.

**Architecture:** One new Prisma model (`VendorCapabilityRequest`) holds the full lifecycle of a single capability check for one (provider, serviceType, country-or-airport) triple: a random token for unauthenticated vendor access, the vendor's yes/no + notes response, and the Admin's approve/reject decision. A new `vendor-capability` NestJS module exposes Admin-only endpoints (create, list, approve, reject) and two `@Public()` token-gated endpoints (fetch, submit) for the vendor side — mirroring the existing `quotes` module's public-intake pattern. `VendorResolverService.resolve()`/`eligiblePool()` gain one additional filter: a provider is excluded from a context if a `VendorCapabilityRequest` row exists for that *exact* (providerId, serviceType, countryIso2, icao) tuple and its status is not `APPROVED`. No matching row at all (the default for every existing Provider) means no change in behavior. Provider IDs also switch from manually-typed text to an atomically-generated `VEN-######` sequence, matching the fix already applied to Trip and Client IDs.

**Tech Stack:** NestJS, Prisma/PostgreSQL, class-validator, React Router, existing `apiJson` fetch wrapper, Jest + real Postgres test DB (`jetflow_test`, already running via `docker compose` on `localhost:5442`).

**Spec:** The two specs pasted into this conversation — "VIQ VENDOR ASSIGNMENT, PREFERENCE & RESOLUTION ENGINE" §16 (operational eligibility), §40 (auto-generated Vendor IDs), §43-44 (Vendor Questionnaires / Capability Sync) — plus the audit findings that classified both as NOT IMPLEMENTED. No separate design doc exists; this plan's Architecture section is the design.

## Global Constraints

- Provider IDs must never be caller-supplied on create (same rule just applied to Client IDs in commit `5c62645e`) — `VEN-######`, atomically generated, reusing the existing `trip_id_counters` (prefix, count) table under a `'VEN'` prefix key. No new counter table.
- A Provider that has zero `VendorCapabilityRequest` rows for a context must resolve exactly as it does today — this gate is additive/opt-in, never a default-deny.
- Public endpoints (`@Public()`) must sit behind `ThrottlerGuard`, exactly like `QuotesController`.
- The token itself is the only credential a vendor has — generate it with `crypto.randomBytes(24).toString('hex')` (48 hex chars), never a sequential or guessable ID, and never log it or return it in any admin list endpoint's default payload (only the create-response and the dedicated token-lookup endpoint expose it).
- All new server code lives under `src/server/modules/vendor-capability/`, following the exact file layout of `src/server/modules/vendor-assignments/`.
- Every status-changing action (create, submit, approve, reject) is audit-logged via the existing `AuditService`, table name `'VendorCapabilityRequest'`.
- Run `npx dotenv -e .env.test -- npx jest --config jest.config.js <file>` for every test in this plan; the test Postgres is already running (`docker ps` shows `jetflow_api_postgres` healthy on port 5442) — no setup needed.

---

### Task 1: Auto-generate Provider IDs (VEN-######)

**Files:**
- Modify: `src/server/modules/reference/reference.service.ts:237-244` (`createProvider`)
- Modify: `src/server/modules/reference/dto/create-provider.dto.ts:5-9` (remove `providerId` field)
- Modify: `src/server/modules/reference/dto/update-provider.dto.ts` (check for an `OmitType(CreateProviderDto, ['providerId'])` reference the way `update-client.dto.ts` had one — remove it the same way commit `5c62645e` did for Client)
- Modify: `src/client/pages/admin/AdminAssets.tsx:203,215,220,228,240` (provider ID input — see Task 1 Step 5)
- Test: `src/server/modules/reference/provider-id-generation.spec.ts`

**Interfaces:**
- Produces: `ReferenceService.nextProviderId(): Promise<string>` — later tasks don't consume this, it's Provider-model-internal like `nextClientId()`/`nextTripId()`.

- [ ] **Step 1: Write the failing test**

```typescript
// src/server/modules/reference/provider-id-generation.spec.ts
import { PrismaClient } from '@prisma/client';
import { truncateAll } from '../../test/db-test-utils';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ContactChannelsService } from '../contacts/contact-channels.service';
import { ReferenceService } from './reference.service';

describe('ReferenceService provider ID generation', () => {
  let prisma: PrismaService;
  let reference: ReferenceService;

  beforeAll(() => {
    prisma = new PrismaService();
    const audit = new AuditService(prisma);
    const contactChannels = new ContactChannelsService(prisma);
    reference = new ReferenceService(prisma, audit, contactChannels);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await truncateAll(prisma as unknown as PrismaClient);
  });

  it('assigns a VEN-###### ID, ignoring any providerId supplied by the caller', async () => {
    const created = await reference.createProvider({
      providerId: 'CALLER-SUPPLIED',
      name: 'Example Handling',
      serviceTypes: ['Overflight'],
      scopeType: 'Global',
      scope: 'GLOBAL',
    } as any);

    expect(created!.providerId).toMatch(/^VEN-\d{6}$/);
    expect(created!.providerId).not.toBe('CALLER-SUPPLIED');
  });

  it('never assigns the same providerId twice, even to concurrent creates', async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        reference.createProvider({ name: `Concurrent Vendor ${i}`, serviceTypes: ['Overflight'], scopeType: 'Global', scope: 'GLOBAL' } as any),
      ),
    );

    const ids = results.map((r) => r!.providerId);
    expect(new Set(ids).size).toBe(10);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd viq && npx dotenv -e .env.test -- npx jest --config jest.config.js src/server/modules/reference/provider-id-generation.spec.ts --runInBand`
Expected: FAIL — `created.providerId` is `'CALLER-SUPPLIED'`, not a `VEN-######` string.

- [ ] **Step 3: Add `nextProviderId()` and wire it into `createProvider`**

In `src/server/modules/reference/reference.service.ts`, immediately above `createProvider`:

```typescript
  // VEN-000041 style, atomically incremented -- mirrors ClientsService.nextClientId()
  // and TripsService.nextTripId(). Reuses trip_id_counters under a distinct
  // 'VEN' prefix key, so no schema migration is needed for this counter.
  async nextProviderId(): Promise<string> {
    const rows = await this.prisma.$queryRaw<{ count: number }[]>`
      INSERT INTO trip_id_counters (prefix, count)
      VALUES ('VEN', 1)
      ON CONFLICT (prefix) DO UPDATE SET count = trip_id_counters.count + 1
      RETURNING count
    `;
    return `VEN-${String(rows[0].count).padStart(6, '0')}`;
  }
```

Then change `createProvider` (was `data: rest`):

```typescript
  async createProvider(dto: CreateProviderDto) {
    const user = dto.user || 'SYSTEM';
    const { user: _user, channels, ...rest } = dto;
    const providerId = await this.nextProviderId();
    const provider = await this.prisma.provider.create({ data: { ...rest, providerId } });
    await this.contactChannels.replace({ providerId: provider.providerId }, channels ?? []);
    await this.audit.log(user, 'Provider', provider.providerId, 'Created', '', provider.providerId);
    return this.prisma.provider.findUnique({ where: { providerId: provider.providerId }, include: CONTACT_CHANNELS_INCLUDE });
  }
```

In `src/server/modules/reference/dto/create-provider.dto.ts`, remove the `providerId` field entirely:

```typescript
export class CreateProviderDto {
  // providerId is deliberately NOT accepted here -- it's server-assigned
  // (ReferenceService.nextProviderId()), the same fix already applied to
  // Trip and Client IDs. A manually-typed Provider ID was VIQ's last
  // fully-manual business ID (spec section 40 explicitly calls this out).

  @IsString()
  @MaxLength(200)
  name!: string;
  // ...rest of the class is unchanged
```

Check `update-provider.dto.ts` for an `OmitType(CreateProviderDto, ['providerId'] as const)` reference; if present, change it to plain `PartialType(CreateProviderDto)` exactly as done for `update-client.dto.ts` in commit `5c62645e` (there is no longer a `providerId` key to Omit).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd viq && npx dotenv -e .env.test -- npx jest --config jest.config.js src/server/modules/reference/provider-id-generation.spec.ts --runInBand`
Expected: PASS, 2/2.

- [ ] **Step 5: Update the frontend Provider form to stop requiring a typed ID**

In `src/client/pages/admin/AdminAssets.tsx`, find the Provider panel (search `ProviderID`, the analog of the `ClientID` panel found in AdminAssets around line 676-696). Apply the exact same pattern as the Client fix (commit `5c62645e`):
- The "New Provider" case must send an empty-string placeholder `ProviderID` (not a manually-typed value) so the create-vs-update check routes to POST.
- The save handler must use the server's returned `ProviderID` (from `saveProvider(...)`'s resolved result) for any `onSaved(...)` callback, not the local placeholder.
- Change the `ProviderID` `<Input>` to a read-only display (e.g. render the ID as plain text, "Assigned automatically on save" when creating) rather than an editable `<Input value={providerId} onChange={...} disabled={!isNew} />` — since it's no longer ever user-typed even when new.

- [ ] **Step 6: Type-check and commit**

Run: `cd viq && npx tsc -p tsconfig.json --noEmit && npx tsc -p tsconfig.client.json --noEmit`
Expected: no errors.

```bash
git add src/server/modules/reference/reference.service.ts src/server/modules/reference/dto/create-provider.dto.ts src/server/modules/reference/dto/update-provider.dto.ts src/server/modules/reference/provider-id-generation.spec.ts src/client/pages/admin/AdminAssets.tsx
git commit -m "fix: generate Provider IDs atomically server-side instead of manual entry

VIQ's last fully-manual business ID (spec section 40): the Provider/Vendor
ID field was a free-text <Input> the coordinator had to type themselves.
ReferenceService.nextProviderId() now assigns VEN-###### atomically via
the same trip_id_counters mechanism used for Trip and Client IDs.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: `VendorCapabilityRequest` schema + migration

**Files:**
- Modify: `prisma/schema.prisma` (add model, add relation fields on `Provider`)
- Create: migration via `npx prisma migrate dev --name add_vendor_capability_requests`

**Interfaces:**
- Produces: `VendorCapabilityRequest` Prisma model with fields `id, providerId, countryIso2, icao, serviceType, token, tokenExpiresAtZ, status, contactName, contactEmail, canService, vendorNotes, submittedAtZ, reviewedBy, reviewedAtZ, reviewNotes, createdBy, createdAtZ`. Later tasks (3, 4, 5, 6) all read/write this model by name.

- [ ] **Step 1: Add the model to `prisma/schema.prisma`**

Add directly after the `VendorAssignment` model (after its closing `}` around line 246):

```prisma
// Vendor Capability & Questionnaire Pipeline (spec sections 43-44). One row
// = "Admin asked this Vendor to confirm they can perform this exact
// serviceType at this exact country-or-airport, and here's where that
// stands." A Provider with zero rows here is unaffected by capability
// gating in VendorResolverService -- this is an opt-in gate, never a
// default-deny, so every pre-existing VendorAssignment keeps resolving
// exactly as it did before this model existed.
model VendorCapabilityRequest {
  id             String    @id @default(cuid())
  providerId     String    @map("provider_id")
  countryIso2    String?   @map("country_iso2")
  icao           String?
  serviceType    String    @map("service_type")

  // 48 hex chars from crypto.randomBytes(24) -- the vendor's only
  // credential, so it must never be sequential or guessable. Unique so a
  // token lookup is a single indexed equality check.
  token          String    @unique
  tokenExpiresAtZ DateTime @map("token_expires_at_z")

  // PENDING (sent, awaiting vendor) -> SUBMITTED (vendor answered) ->
  // UNDER_REVIEW (optional Admin holding state) -> APPROVED | REJECTED.
  // A capability gate in the resolver treats anything other than APPROVED
  // as "not eligible for this context".
  status         String    @default("PENDING")

  contactName    String?   @map("contact_name")
  contactEmail   String?   @map("contact_email")
  canService     Boolean?  @map("can_service")
  vendorNotes    String?   @map("vendor_notes")
  submittedAtZ   DateTime? @map("submitted_at_z")

  reviewedBy     String?   @map("reviewed_by")
  reviewedAtZ    DateTime? @map("reviewed_at_z")
  reviewNotes    String?   @map("review_notes")

  createdBy      String?   @map("created_by")
  createdAtZ     DateTime  @default(now()) @map("created_at_z")

  provider Provider @relation(fields: [providerId], references: [providerId], onDelete: Cascade)

  @@index([providerId, serviceType, countryIso2, icao])
  @@map("vendor_capability_requests")
}
```

Add the back-relation on `Provider` (in `model Provider { ... }`, alongside the existing `vendorAssignments VendorAssignment[]` line):

```prisma
  vendorCapabilityRequests VendorCapabilityRequest[]
```

- [ ] **Step 2: Generate and apply the migration**

Run: `cd viq && npx prisma migrate dev --name add_vendor_capability_requests`
Expected: a new folder under `prisma/migrations/` containing the `CREATE TABLE "vendor_capability_requests"` SQL; command exits 0 and regenerates the Prisma client.

- [ ] **Step 3: Apply the same migration to the test database**

Run: `cd viq && npx dotenv -e .env.test -- npx prisma migrate deploy`
Expected: "1 migration applied" (or similar), no errors.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: add VendorCapabilityRequest model for the capability questionnaire pipeline

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Admin-side service — create, list, findOne, findByToken

**Files:**
- Create: `src/server/modules/vendor-capability/vendor-capability.service.ts`
- Create: `src/server/modules/vendor-capability/dto/create-vendor-capability-request.dto.ts`
- Test: `src/server/modules/vendor-capability/vendor-capability.service.spec.ts`

**Interfaces:**
- Consumes: `PrismaService`, `AuditService` (same constructor pattern as `ClientsService`).
- Produces: `VendorCapabilityService.create(dto): Promise<VendorCapabilityRequest>`, `.findAll(filter?: { providerId?: string; status?: string }): Promise<VendorCapabilityRequest[]>` (never includes `token` in this list — see Step 3), `.findOne(id): Promise<VendorCapabilityRequest>`, `.findByToken(token): Promise<VendorCapabilityRequest>`. Task 4 consumes `findByToken`; Task 5 consumes `findOne`.

- [ ] **Step 1: Write the failing test**

```typescript
// src/server/modules/vendor-capability/vendor-capability.service.spec.ts
import { PrismaClient } from '@prisma/client';
import { truncateAll } from '../../test/db-test-utils';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { VendorCapabilityService } from './vendor-capability.service';

describe('VendorCapabilityService', () => {
  let prisma: PrismaService;
  let service: VendorCapabilityService;

  beforeAll(() => {
    prisma = new PrismaService();
    service = new VendorCapabilityService(prisma, new AuditService(prisma));
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await truncateAll(prisma as unknown as PrismaClient);
    await prisma.provider.create({
      data: { providerId: 'VEN-000001', name: 'Alpha Handling', serviceTypes: ['Overflight'], scopeType: 'Global', scope: 'GLOBAL' },
    });
  });

  it('creates a PENDING request with a unique 48-hex-char token expiring in the future', async () => {
    const created = await service.create({ providerId: 'VEN-000001', serviceType: 'Overflight', countryIso2: 'TZ' } as any);

    expect(created.status).toBe('PENDING');
    expect(created.token).toMatch(/^[0-9a-f]{48}$/);
    expect(created.tokenExpiresAtZ.getTime()).toBeGreaterThan(Date.now());
  });

  it('findAll never includes the token field', async () => {
    await service.create({ providerId: 'VEN-000001', serviceType: 'Overflight', countryIso2: 'TZ' } as any);
    const list = await service.findAll();

    expect(list).toHaveLength(1);
    expect((list[0] as any).token).toBeUndefined();
  });

  it('findByToken finds the matching request by its token', async () => {
    const created = await service.create({ providerId: 'VEN-000001', serviceType: 'Overflight', countryIso2: 'TZ' } as any);
    const found = await service.findByToken(created.token);

    expect(found.id).toBe(created.id);
  });

  it('findByToken throws NotFoundException for an unknown token', async () => {
    await expect(service.findByToken('does-not-exist')).rejects.toThrow('not found');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd viq && npx dotenv -e .env.test -- npx jest --config jest.config.js src/server/modules/vendor-capability/vendor-capability.service.spec.ts --runInBand`
Expected: FAIL — `Cannot find module './vendor-capability.service'`.

- [ ] **Step 3: Write the DTO**

```typescript
// src/server/modules/vendor-capability/dto/create-vendor-capability-request.dto.ts
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateVendorCapabilityRequestDto {
  @IsString()
  @MaxLength(200)
  providerId!: string;

  @IsOptional()
  @IsString()
  countryIso2?: string;

  @IsOptional()
  @IsString()
  icao?: string;

  @IsString()
  @MaxLength(200)
  serviceType!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  user?: string;
}
```

- [ ] **Step 4: Write the minimal implementation**

```typescript
// src/server/modules/vendor-capability/vendor-capability.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateVendorCapabilityRequestDto } from './dto/create-vendor-capability-request.dto';

const TOKEN_TTL_DAYS = 30;

// Every list/find method below omits `token` from its select except
// findByToken (the vendor's own lookup, which needs it to exist as a
// column to match against, not to display) -- see Task 3's Interfaces
// note in the plan. Listing the fields explicitly (rather than `omit`)
// keeps this correct even if the Prisma version in use predates `omit`.
const ADMIN_SAFE_SELECT = {
  id: true,
  providerId: true,
  countryIso2: true,
  icao: true,
  serviceType: true,
  tokenExpiresAtZ: true,
  status: true,
  contactName: true,
  contactEmail: true,
  canService: true,
  vendorNotes: true,
  submittedAtZ: true,
  reviewedBy: true,
  reviewedAtZ: true,
  reviewNotes: true,
  createdBy: true,
  createdAtZ: true,
  provider: { select: { providerId: true, name: true } },
} as const;

@Injectable()
export class VendorCapabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateVendorCapabilityRequestDto) {
    const user = dto.user || 'SYSTEM';
    const token = randomBytes(24).toString('hex');
    const tokenExpiresAtZ = new Date(Date.now() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
    const created = await this.prisma.vendorCapabilityRequest.create({
      data: {
        providerId: dto.providerId,
        countryIso2: dto.countryIso2,
        icao: dto.icao,
        serviceType: dto.serviceType,
        token,
        tokenExpiresAtZ,
        createdBy: user,
      },
    });
    await this.audit.log(user, 'VendorCapabilityRequest', created.id, 'Created', '', `${dto.providerId} / ${dto.serviceType}`);
    return created;
  }

  findAll(filter: { providerId?: string; status?: string } = {}) {
    return this.prisma.vendorCapabilityRequest.findMany({
      where: { providerId: filter.providerId, status: filter.status },
      select: ADMIN_SAFE_SELECT,
      orderBy: { createdAtZ: 'desc' },
    });
  }

  async findOne(id: string) {
    const row = await this.prisma.vendorCapabilityRequest.findUnique({ where: { id }, select: ADMIN_SAFE_SELECT });
    if (!row) throw new NotFoundException(`VendorCapabilityRequest ${id} not found`);
    return row;
  }

  async findByToken(token: string) {
    const row = await this.prisma.vendorCapabilityRequest.findUnique({ where: { token } });
    if (!row) throw new NotFoundException('Capability request not found');
    return row;
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd viq && npx dotenv -e .env.test -- npx jest --config jest.config.js src/server/modules/vendor-capability/vendor-capability.service.spec.ts --runInBand`
Expected: PASS, 4/4.

- [ ] **Step 6: Commit**

```bash
git add src/server/modules/vendor-capability/vendor-capability.service.ts src/server/modules/vendor-capability/dto/create-vendor-capability-request.dto.ts src/server/modules/vendor-capability/vendor-capability.service.spec.ts
git commit -m "feat: add VendorCapabilityService (create/list/findOne/findByToken)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Public token-gated submission + Admin create/list controller endpoints

**Files:**
- Modify: `src/server/modules/vendor-capability/vendor-capability.service.ts` (add `submit`)
- Create: `src/server/modules/vendor-capability/dto/submit-vendor-capability-response.dto.ts`
- Create: `src/server/modules/vendor-capability/vendor-capability.controller.ts`
- Create: `src/server/modules/vendor-capability/vendor-capability.module.ts`
- Modify: `src/server/app.module.ts` (register the module)
- Test: append to `src/server/modules/vendor-capability/vendor-capability.service.spec.ts`

**Interfaces:**
- Consumes: `VendorCapabilityService.findByToken` (Task 3).
- Produces: `VendorCapabilityService.submit(token, dto): Promise<VendorCapabilityRequest>`; `POST /vendor-capability` (Admin), `GET /vendor-capability` (Admin), `GET /vendor-capability/token/:token` (Public), `POST /vendor-capability/token/:token/submit` (Public). Task 7 (frontend) calls these four routes.

- [ ] **Step 1: Write the failing test (append to the existing spec file)**

```typescript
  it('submit records the vendor answer and moves status to SUBMITTED, and rejects a second submit', async () => {
    const created = await service.create({ providerId: 'VEN-000001', serviceType: 'Overflight', countryIso2: 'TZ' } as any);

    const submitted = await service.submit(created.token, {
      contactName: 'Jane Vendor',
      contactEmail: 'jane@alphahandling.example',
      canService: true,
      vendorNotes: 'We hold a valid TCAA ground handling permit.',
    });

    expect(submitted.status).toBe('SUBMITTED');
    expect(submitted.submittedAtZ).not.toBeNull();

    await expect(
      service.submit(created.token, { contactName: 'Jane Vendor', canService: true } as any),
    ).rejects.toThrow('already been submitted');
  });

  it('submit rejects an expired token', async () => {
    const created = await service.create({ providerId: 'VEN-000001', serviceType: 'Overflight', countryIso2: 'TZ' } as any);
    await prisma.vendorCapabilityRequest.update({ where: { id: created.id }, data: { tokenExpiresAtZ: new Date(Date.now() - 1000) } });

    await expect(
      service.submit(created.token, { contactName: 'Jane Vendor', canService: true } as any),
    ).rejects.toThrow('expired');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd viq && npx dotenv -e .env.test -- npx jest --config jest.config.js src/server/modules/vendor-capability/vendor-capability.service.spec.ts --runInBand`
Expected: FAIL — `service.submit is not a function`.

- [ ] **Step 3: Write the submit DTO**

```typescript
// src/server/modules/vendor-capability/dto/submit-vendor-capability-response.dto.ts
import { IsBoolean, IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class SubmitVendorCapabilityResponseDto {
  @IsString()
  @MaxLength(200)
  contactName!: string;

  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @IsBoolean()
  canService!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  vendorNotes?: string;
}
```

- [ ] **Step 4: Add `submit()` to the service**

```typescript
  async submit(token: string, dto: SubmitVendorCapabilityResponseDto) {
    const row = await this.findByToken(token);
    if (row.status !== 'PENDING') {
      throw new BadRequestException('This capability request has already been submitted.');
    }
    if (row.tokenExpiresAtZ.getTime() < Date.now()) {
      throw new BadRequestException('This capability request link has expired.');
    }
    const updated = await this.prisma.vendorCapabilityRequest.update({
      where: { id: row.id },
      data: {
        status: 'SUBMITTED',
        contactName: dto.contactName,
        contactEmail: dto.contactEmail,
        canService: dto.canService,
        vendorNotes: dto.vendorNotes,
        submittedAtZ: new Date(),
      },
    });
    await this.audit.log('VENDOR_PORTAL', 'VendorCapabilityRequest', updated.id, 'Submitted', 'PENDING', 'SUBMITTED');
    return updated;
  }
```

Add `BadRequestException` to the existing `@nestjs/common` import at the top of the file.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd viq && npx dotenv -e .env.test -- npx jest --config jest.config.js src/server/modules/vendor-capability/vendor-capability.service.spec.ts --runInBand`
Expected: PASS, 6/6.

- [ ] **Step 6: Write the controller**

```typescript
// src/server/modules/vendor-capability/vendor-capability.controller.ts
import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { VendorCapabilityService } from './vendor-capability.service';
import { CreateVendorCapabilityRequestDto } from './dto/create-vendor-capability-request.dto';
import { SubmitVendorCapabilityResponseDto } from './dto/submit-vendor-capability-response.dto';
import { Public } from '../auth/public.decorator';
import { Roles } from '../auth/roles.decorator';

@Controller('vendor-capability')
export class VendorCapabilityController {
  constructor(private readonly capability: VendorCapabilityService) {}

  @Roles('Admin')
  @Post()
  create(@Body() dto: CreateVendorCapabilityRequestDto) {
    return this.capability.create(dto);
  }

  @Roles('Admin')
  @Get()
  findAll(@Query('providerId') providerId?: string, @Query('status') status?: string) {
    return this.capability.findAll({ providerId, status });
  }

  @Roles('Admin')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.capability.findOne(id);
  }

  // Public + throttled, exactly like QuotesController.submit -- a vendor
  // has no VIQ login, the token IS the credential.
  @Public()
  @UseGuards(ThrottlerGuard)
  @Get('token/:token')
  findByToken(@Param('token') token: string) {
    return this.capability.findByToken(token);
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Post('token/:token/submit')
  submit(@Param('token') token: string, @Body() dto: SubmitVendorCapabilityResponseDto) {
    return this.capability.submit(token, dto);
  }
}
```

- [ ] **Step 7: Write the module and register it**

```typescript
// src/server/modules/vendor-capability/vendor-capability.module.ts
import { Module } from '@nestjs/common';
import { VendorCapabilityService } from './vendor-capability.service';
import { VendorCapabilityController } from './vendor-capability.controller';

@Module({
  controllers: [VendorCapabilityController],
  providers: [VendorCapabilityService],
  exports: [VendorCapabilityService],
})
export class VendorCapabilityModule {}
```

In `src/server/app.module.ts`, add the import alongside the existing `VendorAssignmentsModule`/`QuotesModule` imports (around line 27-28) and add `VendorCapabilityModule` to the `imports` array (around line 70-71).

- [ ] **Step 8: Verify the app module still boots**

Run: `cd viq && npx tsc -p tsconfig.json --noEmit`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add src/server/modules/vendor-capability/ src/server/app.module.ts
git commit -m "feat: add public token-gated submission + Admin create/list endpoints for vendor capability

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Admin approve/reject

**Files:**
- Modify: `src/server/modules/vendor-capability/vendor-capability.service.ts` (add `approve`, `reject`)
- Modify: `src/server/modules/vendor-capability/vendor-capability.controller.ts` (add endpoints)
- Modify: `src/server/modules/vendor-capability/dto/` — add `review-vendor-capability-request.dto.ts`
- Test: append to `src/server/modules/vendor-capability/vendor-capability.service.spec.ts`

**Interfaces:**
- Produces: `VendorCapabilityService.approve(id, dto): Promise<VendorCapabilityRequest>`, `.reject(id, dto): Promise<VendorCapabilityRequest>`; `POST /vendor-capability/:id/approve`, `POST /vendor-capability/:id/reject`. Task 6 (resolver) reads `status` this sets; nothing else consumes these methods directly.

- [ ] **Step 1: Write the failing test**

```typescript
  it('approve moves a SUBMITTED request to APPROVED and records the reviewer', async () => {
    const created = await service.create({ providerId: 'VEN-000001', serviceType: 'Overflight', countryIso2: 'TZ' } as any);
    await service.submit(created.token, { contactName: 'Jane Vendor', canService: true } as any);

    const approved = await service.approve(created.id, { user: 'ops.admin' });

    expect(approved.status).toBe('APPROVED');
    expect(approved.reviewedBy).toBe('ops.admin');
    expect(approved.reviewedAtZ).not.toBeNull();
  });

  it('reject moves a SUBMITTED request to REJECTED with review notes', async () => {
    const created = await service.create({ providerId: 'VEN-000001', serviceType: 'Overflight', countryIso2: 'TZ' } as any);
    await service.submit(created.token, { contactName: 'Jane Vendor', canService: false } as any);

    const rejected = await service.reject(created.id, { user: 'ops.admin', reviewNotes: 'Vendor confirmed they do not cover this station.' });

    expect(rejected.status).toBe('REJECTED');
    expect(rejected.reviewNotes).toContain('do not cover');
  });

  it('approve rejects a request that has not been submitted yet', async () => {
    const created = await service.create({ providerId: 'VEN-000001', serviceType: 'Overflight', countryIso2: 'TZ' } as any);

    await expect(service.approve(created.id, { user: 'ops.admin' })).rejects.toThrow('has not been submitted');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd viq && npx dotenv -e .env.test -- npx jest --config jest.config.js src/server/modules/vendor-capability/vendor-capability.service.spec.ts --runInBand`
Expected: FAIL — `service.approve is not a function`.

- [ ] **Step 3: Write the review DTO**

```typescript
// src/server/modules/vendor-capability/dto/review-vendor-capability-request.dto.ts
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ReviewVendorCapabilityRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reviewNotes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  user?: string;
}
```

- [ ] **Step 4: Add `approve()`/`reject()` to the service**

```typescript
  async approve(id: string, dto: ReviewVendorCapabilityRequestDto) {
    return this.review(id, 'APPROVED', dto);
  }

  async reject(id: string, dto: ReviewVendorCapabilityRequestDto) {
    return this.review(id, 'REJECTED', dto);
  }

  private async review(id: string, outcome: 'APPROVED' | 'REJECTED', dto: ReviewVendorCapabilityRequestDto) {
    const user = dto.user || 'SYSTEM';
    const row = await this.prisma.vendorCapabilityRequest.findUnique({ where: { id } });
    if (!row) throw new NotFoundException(`VendorCapabilityRequest ${id} not found`);
    if (row.status === 'PENDING') {
      throw new BadRequestException('This capability request has not been submitted by the vendor yet.');
    }
    const updated = await this.prisma.vendorCapabilityRequest.update({
      where: { id },
      data: { status: outcome, reviewedBy: user, reviewedAtZ: new Date(), reviewNotes: dto.reviewNotes },
    });
    await this.audit.log(user, 'VendorCapabilityRequest', id, 'Reviewed', row.status, outcome);
    return updated;
  }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd viq && npx dotenv -e .env.test -- npx jest --config jest.config.js src/server/modules/vendor-capability/vendor-capability.service.spec.ts --runInBand`
Expected: PASS, 9/9.

- [ ] **Step 6: Add the controller endpoints**

In `vendor-capability.controller.ts`, add (with the same `ReviewVendorCapabilityRequestDto` imported):

```typescript
  @Roles('Admin')
  @Post(':id/approve')
  approve(@Param('id') id: string, @Body() dto: ReviewVendorCapabilityRequestDto) {
    return this.capability.approve(id, dto);
  }

  @Roles('Admin')
  @Post(':id/reject')
  reject(@Param('id') id: string, @Body() dto: ReviewVendorCapabilityRequestDto) {
    return this.capability.reject(id, dto);
  }
```

- [ ] **Step 7: Type-check and commit**

Run: `cd viq && npx tsc -p tsconfig.json --noEmit`

```bash
git add src/server/modules/vendor-capability/
git commit -m "feat: add Admin approve/reject for vendor capability requests

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Resolver capability gate

**Files:**
- Modify: `src/server/modules/vendor-assignments/vendor-resolver.service.ts` (both `resolve()` and `eligiblePool()`)
- Test: `src/server/modules/vendor-assignments/vendor-capability-gate.spec.ts`

**Interfaces:**
- Consumes: `VendorCapabilityRequest` rows directly via `this.prisma` (no new dependency on `VendorCapabilityService` — `VendorAssignmentsModule` stays decoupled from `VendorCapabilityModule`, matching how it has no dependency on `ServicesModule` either).
- Produces: no interface change — `resolve()`/`eligiblePool()` keep their existing signatures; this task only narrows what counts as "eligible".

- [ ] **Step 1: Write the failing test**

```typescript
// src/server/modules/vendor-assignments/vendor-capability-gate.spec.ts
import { PrismaClient } from '@prisma/client';
import { truncateAll } from '../../test/db-test-utils';
import { PrismaService } from '../../prisma/prisma.service';
import { VendorResolverService } from './vendor-resolver.service';

describe('VendorResolverService capability gate', () => {
  let prisma: PrismaService;
  let resolver: VendorResolverService;

  beforeAll(() => {
    prisma = new PrismaService();
    resolver = new VendorResolverService(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await truncateAll(prisma as unknown as PrismaClient);
  });

  it('a provider with no capability request at all resolves exactly as before (unaffected)', async () => {
    await prisma.provider.create({ data: { providerId: 'VEN-A', name: 'Alpha', serviceTypes: ['Overflight'], scopeType: 'Global', scope: 'GLOBAL' } });
    await prisma.vendorAssignment.create({ data: { providerId: 'VEN-A', serviceType: 'Overflight', preferred: true, rank: 1 } });

    const result = await resolver.resolve({ serviceType: 'Overflight', countryIso2: 'TZ' });

    expect(result.status).toBe('RESOLVED');
    expect(result.selectedVendorId).toBe('VEN-A');
  });

  it('a provider with a PENDING (unapproved) capability request for this exact context is excluded', async () => {
    await prisma.provider.create({ data: { providerId: 'VEN-A', name: 'Alpha', serviceTypes: ['Overflight'], scopeType: 'Global', scope: 'GLOBAL' } });
    await prisma.vendorAssignment.create({ data: { providerId: 'VEN-A', serviceType: 'Overflight', preferred: true, rank: 1 } });
    await prisma.vendorCapabilityRequest.create({
      data: { providerId: 'VEN-A', serviceType: 'Overflight', countryIso2: 'TZ', token: 'a'.repeat(48), tokenExpiresAtZ: new Date(Date.now() + 86400000), status: 'PENDING' },
    });

    const result = await resolver.resolve({ serviceType: 'Overflight', countryIso2: 'TZ' });

    expect(result.status).toBe('NO_ELIGIBLE_VENDOR');
  });

  it('a provider with an APPROVED capability request for this exact context remains eligible', async () => {
    await prisma.provider.create({ data: { providerId: 'VEN-A', name: 'Alpha', serviceTypes: ['Overflight'], scopeType: 'Global', scope: 'GLOBAL' } });
    await prisma.vendorAssignment.create({ data: { providerId: 'VEN-A', serviceType: 'Overflight', preferred: true, rank: 1 } });
    await prisma.vendorCapabilityRequest.create({
      data: { providerId: 'VEN-A', serviceType: 'Overflight', countryIso2: 'TZ', token: 'b'.repeat(48), tokenExpiresAtZ: new Date(Date.now() + 86400000), status: 'APPROVED' },
    });

    const result = await resolver.resolve({ serviceType: 'Overflight', countryIso2: 'TZ' });

    expect(result.status).toBe('RESOLVED');
    expect(result.selectedVendorId).toBe('VEN-A');
  });

  it('a capability request for a DIFFERENT country does not affect this context', async () => {
    await prisma.provider.create({ data: { providerId: 'VEN-A', name: 'Alpha', serviceTypes: ['Overflight'], scopeType: 'Global', scope: 'GLOBAL' } });
    await prisma.vendorAssignment.create({ data: { providerId: 'VEN-A', serviceType: 'Overflight', preferred: true, rank: 1 } });
    await prisma.vendorCapabilityRequest.create({
      data: { providerId: 'VEN-A', serviceType: 'Overflight', countryIso2: 'KE', token: 'c'.repeat(48), tokenExpiresAtZ: new Date(Date.now() + 86400000), status: 'PENDING' },
    });

    const result = await resolver.resolve({ serviceType: 'Overflight', countryIso2: 'TZ' });

    expect(result.status).toBe('RESOLVED');
    expect(result.selectedVendorId).toBe('VEN-A');
  });

  it('eligiblePool also excludes a REJECTED provider for this exact context', async () => {
    await prisma.provider.create({ data: { providerId: 'VEN-A', name: 'Alpha', serviceTypes: ['Overflight'], scopeType: 'Global', scope: 'GLOBAL' } });
    await prisma.provider.create({ data: { providerId: 'VEN-B', name: 'Beta', serviceTypes: ['Overflight'], scopeType: 'Global', scope: 'GLOBAL' } });
    await prisma.vendorAssignment.create({ data: { providerId: 'VEN-A', serviceType: 'Overflight', preferred: true, rank: 1 } });
    await prisma.vendorAssignment.create({ data: { providerId: 'VEN-B', serviceType: 'Overflight', preferred: true, rank: 2 } });
    await prisma.vendorCapabilityRequest.create({
      data: { providerId: 'VEN-A', serviceType: 'Overflight', countryIso2: 'TZ', token: 'd'.repeat(48), tokenExpiresAtZ: new Date(Date.now() + 86400000), status: 'REJECTED' },
    });

    const pool = await resolver.eligiblePool({ serviceType: 'Overflight', countryIso2: 'TZ' });

    expect(pool.map((p) => p.vendorId)).toEqual(['VEN-B']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd viq && npx dotenv -e .env.test -- npx jest --config jest.config.js src/server/modules/vendor-assignments/vendor-capability-gate.spec.ts --runInBand`
Expected: FAIL — the "PENDING excluded" and "REJECTED excluded" cases resolve `VEN-A` instead of excluding it.

- [ ] **Step 3: Add the gate to `vendor-resolver.service.ts`**

Add a new private method (anywhere after `validityConditions`):

```typescript
  // Capability gate (spec §16/§44): a provider is excluded from a context
  // only if a VendorCapabilityRequest row exists for that EXACT
  // (providerId, serviceType, countryIso2, icao) tuple and its status is
  // not APPROVED. No matching row at all -- the default for every
  // pre-existing Provider -- means this gate does nothing; it is
  // deliberately opt-in, never a default-deny.
  private async capabilityBlockedProviderIds(providerIds: string[], ctx: VendorResolutionContext): Promise<Set<string>> {
    if (providerIds.length === 0) return new Set();
    const rows = await this.prisma.vendorCapabilityRequest.findMany({
      where: {
        providerId: { in: providerIds },
        serviceType: ctx.serviceType,
        countryIso2: ctx.countryIso2 ?? null,
        icao: ctx.icao ?? null,
      },
    });
    return new Set(rows.filter((r) => r.status !== 'APPROVED').map((r) => r.providerId));
  }
```

In `resolve()`, change:

```typescript
    const bannedProviderIds = new Set(prohibitions.map((p) => p.providerId));
    const eligible = candidates.filter(
      (c) =>
        !bannedProviderIds.has(c.providerId) &&
        c.provider.contractActive &&
        c.provider.serviceTypes.includes(ctx.serviceType),
    );
```

to:

```typescript
    const bannedProviderIds = new Set(prohibitions.map((p) => p.providerId));
    const capabilityBlockedIds = await this.capabilityBlockedProviderIds(
      candidates.map((c) => c.providerId),
      ctx,
    );
    const eligible = candidates.filter(
      (c) =>
        !bannedProviderIds.has(c.providerId) &&
        !capabilityBlockedIds.has(c.providerId) &&
        c.provider.contractActive &&
        c.provider.serviceTypes.includes(ctx.serviceType),
    );
```

Make the same two changes (add the `capabilityBlockedIds` lookup, add `!capabilityBlockedIds.has(c.providerId)` to the filter) in `eligiblePool()`, which has the identical `bannedProviderIds`/`eligible` block.

Update the `NO_ELIGIBLE_VENDOR` reason text in `resolve()` (the `else` branch of the existing three-way reason logic) from:

```typescript
        reason = 'Vendor assignments matched this context, but no eligible provider survived filtering (inactive contract or service type mismatch)';
```

to:

```typescript
        reason = 'Vendor assignments matched this context, but no eligible provider survived filtering (inactive contract, service type mismatch, or an unapproved capability request for this exact context)';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd viq && npx dotenv -e .env.test -- npx jest --config jest.config.js src/server/modules/vendor-assignments/vendor-capability-gate.spec.ts --runInBand`
Expected: PASS, 5/5.

- [ ] **Step 5: Run the full existing vendor-resolver + vendor-assignments suites to confirm no regression**

Run: `cd viq && npx dotenv -e .env.test -- npx jest --config jest.config.js src/server/modules/vendor-assignments --runInBand`
Expected: all suites pass (this confirms the additive gate did not change behavior for any context with zero `VendorCapabilityRequest` rows, which is every existing test in that directory).

- [ ] **Step 6: Commit**

```bash
git add src/server/modules/vendor-assignments/vendor-resolver.service.ts src/server/modules/vendor-assignments/vendor-capability-gate.spec.ts
git commit -m "feat: gate vendor eligibility on approved capability requests

Additive only: a provider with zero VendorCapabilityRequest rows for a
context resolves exactly as before. A provider with a PENDING, SUBMITTED,
or REJECTED (i.e. not APPROVED) request for that exact
(providerId, serviceType, countryIso2, icao) tuple is excluded from both
resolve() and eligiblePool().

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: Admin frontend — request capability + review queue

**Files:**
- Modify: `src/client/lib/dataStore.ts` (add API wrapper functions)
- Create: `src/client/pages/admin/VendorCapabilityQueue.tsx`
- Modify: `src/client/pages/admin/AdminAssets.tsx` (add "Request Capability Confirmation" action to the Provider panel)
- Modify: `src/client/App.tsx` (register `/admin/vendor-capability` route)
- Modify: wherever the Admin nav/sidebar lists routes (search `admin/message-templates` in the sidebar component to find it)

**Interfaces:**
- Consumes: `GET/POST /vendor-capability`, `POST /vendor-capability/:id/approve`, `POST /vendor-capability/:id/reject` (Task 4, 5).
- Produces: exported functions `createVendorCapabilityRequest`, `listVendorCapabilityRequests`, `approveVendorCapabilityRequest`, `rejectVendorCapabilityRequest` in `dataStore.ts` for Task 8 to also reference if needed (it won't — Task 8 is public/token-based, a separate code path).

- [ ] **Step 1: Add API wrapper functions to `dataStore.ts`**

Add near the existing `saveClient`/`deleteClient` functions:

```typescript
export interface VendorCapabilityRequest {
  id: string;
  providerId: string;
  countryIso2: string | null;
  icao: string | null;
  serviceType: string;
  tokenExpiresAtZ: string;
  status: 'PENDING' | 'SUBMITTED' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED';
  contactName: string | null;
  contactEmail: string | null;
  canService: boolean | null;
  vendorNotes: string | null;
  submittedAtZ: string | null;
  reviewedBy: string | null;
  reviewedAtZ: string | null;
  reviewNotes: string | null;
  provider: { providerId: string; name: string };
}

export async function createVendorCapabilityRequest(
  input: { providerId: string; countryIso2?: string; icao?: string; serviceType: string },
  user = currentUser(),
): Promise<VendorCapabilityRequest> {
  return apiJson<VendorCapabilityRequest>('/vendor-capability', { method: 'POST', body: JSON.stringify({ ...input, user }) });
}

export async function listVendorCapabilityRequests(filter: { providerId?: string; status?: string } = {}): Promise<VendorCapabilityRequest[]> {
  const params = new URLSearchParams();
  if (filter.providerId) params.set('providerId', filter.providerId);
  if (filter.status) params.set('status', filter.status);
  const qs = params.toString();
  return apiJson<VendorCapabilityRequest[]>(`/vendor-capability${qs ? `?${qs}` : ''}`);
}

export async function approveVendorCapabilityRequest(id: string, reviewNotes?: string, user = currentUser()): Promise<VendorCapabilityRequest> {
  return apiJson<VendorCapabilityRequest>(`/vendor-capability/${id}/approve`, { method: 'POST', body: JSON.stringify({ reviewNotes, user }) });
}

export async function rejectVendorCapabilityRequest(id: string, reviewNotes?: string, user = currentUser()): Promise<VendorCapabilityRequest> {
  return apiJson<VendorCapabilityRequest>(`/vendor-capability/${id}/reject`, { method: 'POST', body: JSON.stringify({ reviewNotes, user }) });
}
```

(Check the exact `apiJson` import/signature already used elsewhere in this file — it's the same helper `saveClient` uses, no new import needed.)

- [ ] **Step 2: Add "Request Capability Confirmation" to the Provider panel in `AdminAssets.tsx`**

In the Provider panel component (the one edited in Task 1 Step 5), add a button visible only when editing an existing Provider (`!isNew`) that opens a small inline form: Service Type (reuse whatever `<Select>` of service types already exists elsewhere on this page, e.g. the one used for `serviceTypes` multi-select), Country ISO2 or ICAO (text input, one or the other), and a "Send Request" button calling `createVendorCapabilityRequest`. On success, show the returned request's shareable link as `${window.location.origin}/vendor-capability/${created.token}` in a copyable text field (there is no email-sending in this MVP — Admin copies the link and sends it manually, per this plan's Global Constraints scope).

- [ ] **Step 3: Build the review queue page**

```typescript
// src/client/pages/admin/VendorCapabilityQueue.tsx
import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Textarea } from '../../components/ui/textarea';
import {
  approveVendorCapabilityRequest,
  listVendorCapabilityRequests,
  rejectVendorCapabilityRequest,
  VendorCapabilityRequest,
} from '../../lib/dataStore';

export default function VendorCapabilityQueue() {
  const [requests, setRequests] = useState<VendorCapabilityRequest[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    setLoading(true);
    setRequests(await listVendorCapabilityRequests());
    setLoading(false);
  };

  useEffect(() => {
    reload();
  }, []);

  const pending = requests.filter((r) => r.status === 'SUBMITTED' || r.status === 'UNDER_REVIEW');
  const decided = requests.filter((r) => r.status === 'APPROVED' || r.status === 'REJECTED');
  const awaitingVendor = requests.filter((r) => r.status === 'PENDING');

  const act = async (id: string, action: 'approve' | 'reject') => {
    const fn = action === 'approve' ? approveVendorCapabilityRequest : rejectVendorCapabilityRequest;
    await fn(id, notes[id]);
    await reload();
  };

  if (loading) return <div className="p-6">Loading…</div>;

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-xl font-semibold">Vendor Capability Requests</h1>

      <Card>
        <CardHeader><CardTitle>Awaiting Review ({pending.length})</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {pending.length === 0 && <p className="text-sm text-muted-foreground">Nothing to review.</p>}
          {pending.map((r) => (
            <div key={r.id} className="border rounded-md p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="font-medium">{r.provider.name} · {r.serviceType} · {r.countryIso2 || r.icao}</div>
                <Badge variant={r.canService ? 'default' : 'destructive'}>{r.canService ? 'Vendor says YES' : 'Vendor says NO'}</Badge>
              </div>
              <div className="text-sm text-muted-foreground">Contact: {r.contactName} {r.contactEmail ? `(${r.contactEmail})` : ''}</div>
              {r.vendorNotes && <div className="text-sm">{r.vendorNotes}</div>}
              <Textarea placeholder="Review notes (optional)" value={notes[r.id] || ''} onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })} />
              <div className="flex gap-2">
                <Button size="sm" onClick={() => act(r.id, 'approve')}>Approve</Button>
                <Button size="sm" variant="destructive" onClick={() => act(r.id, 'reject')}>Reject</Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Awaiting Vendor ({awaitingVendor.length})</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {awaitingVendor.map((r) => (
            <div key={r.id} className="text-sm flex justify-between">
              <span>{r.provider.name} · {r.serviceType} · {r.countryIso2 || r.icao}</span>
              <span className="text-muted-foreground">Sent {new Date(r.tokenExpiresAtZ).toLocaleDateString()}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Decided ({decided.length})</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {decided.map((r) => (
            <div key={r.id} className="text-sm flex justify-between">
              <span>{r.provider.name} · {r.serviceType} · {r.countryIso2 || r.icao}</span>
              <Badge variant={r.status === 'APPROVED' ? 'default' : 'destructive'}>{r.status}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
```

(Verify the exact import paths for `Card`/`Button`/`Badge`/`Textarea` against how `AdminAssets.tsx` imports them — copy those paths exactly rather than guessing.)

- [ ] **Step 4: Register the route and nav entry**

In `src/client/App.tsx`, add inside the `<RequireAuth>` block:

```typescript
<Route path="/admin/vendor-capability" element={<RequireRole role="Admin"><VendorCapabilityQueue /></RequireRole>} />
```

with the matching import at the top. Add a sidebar link next to the existing `/admin/message-templates` entry (find that entry's nav-list file — grep the sidebar component for `'Message Templates'` — and add a parallel `'Vendor Capability'` entry pointing at `/admin/vendor-capability`).

- [ ] **Step 5: Type-check**

Run: `cd viq && npx tsc -p tsconfig.client.json --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/client/lib/dataStore.ts src/client/pages/admin/VendorCapabilityQueue.tsx src/client/pages/admin/AdminAssets.tsx src/client/App.tsx
git commit -m "feat: add Admin UI for requesting and reviewing vendor capability confirmations

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 8: Public vendor-facing submission page

**Files:**
- Create: `src/client/pages/VendorCapabilityForm.tsx`
- Modify: `src/client/App.tsx` (register the public route, outside `RequireAuth`)
- Modify: `src/client/lib/dataStore.ts` (two unauthenticated fetch helpers — these do NOT go through `apiJson` if that helper attaches an auth token; check first, see Step 1)

**Interfaces:**
- Consumes: `GET /vendor-capability/token/:token`, `POST /vendor-capability/token/:token/submit` (Task 4) — both `@Public()`, no auth header required or expected.
- Produces: nothing consumed elsewhere — this is a leaf page.

- [ ] **Step 1: Check whether `apiJson` attaches an auth header unconditionally**

Read `apiJson`'s implementation in `dataStore.ts` (or wherever it's defined/imported from). If it always attaches a bearer token (which would be `undefined`/missing for an anonymous vendor and could still work fine since the endpoint is `@Public()` and ignores auth headers) — using `apiJson` as-is is fine, since `@Public()` routes don't require the header to be present or valid. Confirm this by checking `jwt-auth.guard.ts`'s handling of `@Public()`. No new fetch helper is needed unless `apiJson` throws client-side when no token is stored (check for a `redirect to /login` on 401 side effect that would misfire here) — if it does, write two plain `fetch()` calls instead for this page only, mirroring `apiJson`'s base URL and JSON handling but without any auth-redirect behavior.

- [ ] **Step 2: Build the page**

```typescript
// src/client/pages/VendorCapabilityForm.tsx
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';

interface CapabilityRequestView {
  providerId: string;
  countryIso2: string | null;
  icao: string | null;
  serviceType: string;
  status: string;
}

export default function VendorCapabilityForm() {
  const { token } = useParams<{ token: string }>();
  const [request, setRequest] = useState<CapabilityRequestView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [canService, setCanService] = useState<boolean | null>(null);
  const [vendorNotes, setVendorNotes] = useState('');

  useEffect(() => {
    fetch(`/api/vendor-capability/token/${token}`)
      .then((r) => {
        if (!r.ok) throw new Error(r.status === 404 ? 'This link is invalid or has expired.' : 'Something went wrong loading this request.');
        return r.json();
      })
      .then(setRequest)
      .catch((e) => setError(e.message));
  }, [token]);

  const submit = async () => {
    if (canService === null || !contactName.trim()) return;
    const res = await fetch(`/api/vendor-capability/token/${token}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contactName, contactEmail: contactEmail || undefined, canService, vendorNotes: vendorNotes || undefined }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.message || 'Could not submit your response.');
      return;
    }
    setSubmitted(true);
  };

  if (error) return <div className="max-w-md mx-auto mt-16 p-6 text-center text-destructive">{error}</div>;
  if (!request) return <div className="max-w-md mx-auto mt-16 p-6 text-center">Loading…</div>;
  if (submitted || request.status !== 'PENDING') {
    return <div className="max-w-md mx-auto mt-16 p-6 text-center">Thank you — your response has been recorded.</div>;
  }

  return (
    <div className="max-w-md mx-auto mt-16 p-6">
      <Card>
        <CardHeader>
          <CardTitle>Confirm your capability</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Can your organization provide <strong>{request.serviceType}</strong> at{' '}
            <strong>{request.icao || request.countryIso2}</strong>?
          </p>
          <Input placeholder="Your name" value={contactName} onChange={(e) => setContactName(e.target.value)} />
          <Input placeholder="Your email (optional)" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
          <div className="flex gap-2">
            <Button variant={canService === true ? 'default' : 'outline'} onClick={() => setCanService(true)}>Yes, we can</Button>
            <Button variant={canService === false ? 'default' : 'outline'} onClick={() => setCanService(false)}>No, we cannot</Button>
          </div>
          <Textarea placeholder="Notes (optional)" value={vendorNotes} onChange={(e) => setVendorNotes(e.target.value)} />
          <Button className="w-full" disabled={canService === null || !contactName.trim()} onClick={submit}>
            Submit
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
```

(Confirm the API base path — this plan assumes requests are proxied under `/api/...`; check an existing unauthenticated call, e.g. in `quotes` frontend code if one exists, or the dev server's proxy config in `vite.config.ts`, and adjust the two `fetch` URLs to match exactly.)

- [ ] **Step 3: Register the public route**

In `src/client/App.tsx`, add alongside `/login` (outside `<RequireAuth>`):

```typescript
<Route path="/vendor-capability/:token" element={<VendorCapabilityForm />} />
```

with the matching import.

- [ ] **Step 4: Type-check**

Run: `cd viq && npx tsc -p tsconfig.client.json --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual smoke test**

Start the dev stack (`docker compose up` or the project's usual dev command — check `package.json` scripts for `dev`), create a capability request via the Admin UI from Task 7, copy the shown link, open it in an incognito window, submit a response, and confirm it appears in the Admin review queue as SUBMITTED.

- [ ] **Step 6: Commit**

```bash
git add src/client/pages/VendorCapabilityForm.tsx src/client/App.tsx src/client/lib/dataStore.ts
git commit -m "feat: add public vendor-facing capability confirmation form

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Explicitly deferred (not in this plan)

- Automatic email delivery of the capability link (Admin copies/sends it manually for this MVP) — spec §43 wants this, but it depends on which mail infra decision comes out of the separate Financials/Mail-client work; wiring it in later is additive (send an email in `VendorCapabilityService.create()`), not a rework.
- A dynamic, Admin-configurable question set (spec implies "Admin defines fields") — this plan ships one fixed yes/no + notes question, matching the spec's own worked example (§43's HTDA/Tanzania sample) rather than building a form-builder nobody has asked to use yet.
- Wiring capability review into the Action Board / Attention Engine (a separate, already-identified missing module).
