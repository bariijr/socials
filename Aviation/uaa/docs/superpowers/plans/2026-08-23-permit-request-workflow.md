# Permit Request Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a coordinator request a permit for a leg/country from the webapp — composer with a required-docs checklist and auto-filled template, real SMTP send, an outbound comms record with a correlation token — and manually track that request's status through to confirmation.

**Architecture:** Extends the existing NestJS backend with four new entities (`CountryRequirement`, `FormTemplate`, `PermitRequest`, `Comm`) and a `MailService` wrapping `nodemailer`. Extends the Next.js frontend with a Leg detail page (`/legs/[id]`, which doesn't exist yet — the composer needs somewhere to live) carrying a permit-requests section. This is **Slice 2 of 5** from the design spec's Build Sequencing — deadline *tracking* (auto re-confirm invalidation, an Action Board surfacing what's overdue), the IMAP inbound-reply worker, agent/crew notifications, and the MAYFLY export each stay out of this plan; see Explicitly Deferred below.

**Tech Stack:** NestJS 10 + TypeORM 0.3 (existing), `nodemailer` for SMTP send, Next.js 14 App Router (existing), Jest (backend), Vitest + React Testing Library (frontend) — same stack as Slice 1, no new infrastructure.

**Spec:** `docs/superpowers/specs/2026-08-22-uaa-webapp-design.md`

## Global Constraints

- Every table gets `createdAt`/`updatedAt` audit timestamps (same convention as `Users`/`Legs`).
- Full stack, real SMTP send — no mock-mail/frontend-only phase (Spec: Scope). See the dry-run note in Task 1 for the one deliberate exception: sending without configured SMTP credentials logs instead of throwing, so the app stays runnable in environments without real mail credentials.
- Single coordinator role — no RBAC (Spec: Scope). All new endpoints sit behind the existing `JwtAuthGuard`, same as `Legs`.
- Correlation token `[LegID/PR-ID]` embedded in every outbound subject (Spec: Comms) — generated here; *matching* an inbound reply against it is Slice 3's IMAP worker, out of scope for this plan.
- `CountryRequirements` is one row per country, not per (country, service type) — the design spec's Data model section states this explicitly, unlike `actuator/`'s multi-service-type `CountryRules`. UAA's `Legs.country` is a single flat field per leg; there is no multi-segment/multi-service scoping to resolve.
- The `RequiredByZ`/urgency formulas are ported verbatim from `actuator/frontend/js/lib/core-logic.js` — spec: "same formula actuator already validated." `resolveCountryRuleForService` itself is **not** ported: it exists in actuator to resolve a country from Segment/Leg/Stop scoping, which UAA doesn't have — `Legs.country` is already the direct field.

## Explicitly Deferred (Slice 3+, not this plan)

- Automatic `Re-confirm Required` flips when a leg's ETD moves outside `ValidFrom`/`ValidTo`, or a `RequiredByZ` deadline passes unconfirmed. This plan computes and stores `RequiredByZ` (needed at `PermitRequest` creation) and exposes `computeUrgency` as a pure function the *frontend* can call to color a request, but nothing here re-evaluates it automatically or on a schedule.
- The Action Board (a dashboard surfacing what's overdue across all legs).
- The IMAP inbound worker and correlation-token *matching* of replies. This plan's `Comm` table can hold `direction: 'INBOUND'` rows (the column exists), but nothing writes one — that's the IMAP worker's job.
- Agent/crew/team notifications (`Comm.kind: 'NOTIFICATION'`) — Slice 4.
- Real `.docx` document generation. The design spec's `FormTemplates` are described as a mail-merge document, but building real Word-XML generation is a substantial project of its own. This plan's `FormTemplate` renders into the **outbound email body itself** (plain text, `#1`/`#2` merge fields substituted) — the "document" coordinators send *is* the email, not a separate attachment. Flagging this explicitly: if you need an actual attached `.docx`, say so and this gets extended before building.

---

## File Structure

```
backend/
├── src/
│   ├── mail/
│   │   ├── mail.module.ts
│   │   └── mail.service.ts             # nodemailer wrapper, dry-run fallback
│   ├── country-requirements/
│   │   ├── country-requirement.entity.ts
│   │   ├── country-requirements.module.ts
│   │   └── country-requirements.service.ts
│   ├── form-templates/
│   │   ├── form-template.entity.ts
│   │   ├── form-templates.module.ts
│   │   └── template-renderer.ts        # pure function, #1/#2 merge-field substitution
│   ├── permits/
│   │   ├── permit-deadline.ts          # pure functions ported from actuator/core-logic.js
│   │   ├── permit-request.entity.ts
│   │   ├── comm.entity.ts
│   │   ├── permits.module.ts
│   │   ├── permits.service.ts
│   │   ├── permits.controller.ts
│   │   └── dto/
│   │       ├── create-permit-request.dto.ts
│   │       └── update-permit-request.dto.ts
│   └── app.module.ts                   # modify: import 4 new modules
├── migrations/
│   ├── 1755993600000-CreateCountryRequirements.ts
│   ├── 1755993600001-CreateFormTemplates.ts
│   ├── 1755993600002-CreatePermitRequests.ts
│   └── 1755993600003-CreateComms.ts
├── scripts/
│   └── seed-country-requirements.ts    # one-time: 15 countries + 1 form template
└── test/
    ├── permit-deadline.spec.ts
    ├── template-renderer.spec.ts
    ├── permits.service.spec.ts
    └── permits.e2e-spec.ts

frontend/
├── src/
│   ├── app/legs/[id]/
│   │   └── page.tsx                    # Leg detail page (doesn't exist yet)
│   └── lib/
│       └── api-client.ts               # modify: getLeg, listPermitRequests, createPermitRequest, updatePermitRequest, urgency helper
└── test/
    ├── leg-detail.test.tsx
    └── permit-composer.test.tsx
```

---

### Task 1: Mail service — real SMTP send with a dry-run fallback

**Files:**
- Create: `backend/src/mail/mail.module.ts`, `backend/src/mail/mail.service.ts`
- Modify: `backend/package.json` (add `nodemailer`, `@types/nodemailer`), `backend/.env.example` (add SMTP vars)
- Test: `backend/test/mail.service.spec.ts`

**Interfaces:**
- Produces: `MailService.send(input: { to: string; subject: string; body: string }): Promise<{ sent: boolean }>`. Later tasks (`PermitsService`) inject `MailService` and call `.send()`.

- [ ] **Step 1: Add the `nodemailer` dependency and SMTP env vars**

Modify `backend/package.json` — add to `dependencies`: `"nodemailer": "^6.9.14"`; add to `devDependencies`: `"@types/nodemailer": "^6.4.15"`. Run:
```bash
cd backend && npm install
```

Modify `backend/.env.example` — append:
```
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=uaaafrica@univ-wea.com
```

- [ ] **Step 2: Write the failing test**

`backend/test/mail.service.spec.ts`:
```typescript
import { Test } from '@nestjs/testing';
import { MailService } from '../src/mail/mail.service';

describe('MailService', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('sends via the configured SMTP transport when SMTP_HOST is set', async () => {
    process.env.SMTP_HOST = 'smtp.example.com';
    process.env.SMTP_PORT = '587';
    process.env.SMTP_USER = 'user';
    process.env.SMTP_PASS = 'pass';
    process.env.SMTP_FROM = 'from@example.com';

    const sendMail = jest.fn().mockResolvedValue({ messageId: '1' });
    const moduleRef = await Test.createTestingModule({ providers: [MailService] }).compile();
    const service = moduleRef.get(MailService);
    (service as any).transporter = { sendMail };

    const result = await service.send({ to: 'to@example.com', subject: 'Subj', body: 'Body' });

    expect(sendMail).toHaveBeenCalledWith({
      from: 'from@example.com',
      to: 'to@example.com',
      subject: 'Subj',
      text: 'Body',
    });
    expect(result).toEqual({ sent: true });
  });

  it('dry-runs (logs, does not throw) when SMTP_HOST is not configured', async () => {
    delete process.env.SMTP_HOST;

    const moduleRef = await Test.createTestingModule({ providers: [MailService] }).compile();
    const service = moduleRef.get(MailService);

    const result = await service.send({ to: 'to@example.com', subject: 'Subj', body: 'Body' });

    expect(result).toEqual({ sent: false });
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd backend && npx jest test/mail.service.spec.ts`
Expected: FAIL — `Cannot find module '../src/mail/mail.service'`

- [ ] **Step 4: Implement MailService and MailModule**

`backend/src/mail/mail.service.ts`:
```typescript
import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

export interface SendMailInput {
  to: string;
  subject: string;
  body: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: nodemailer.Transporter | null;

  constructor() {
    this.transporter = process.env.SMTP_HOST
      ? nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: Number(process.env.SMTP_PORT ?? 587),
          auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
        })
      : null;
  }

  async send(input: SendMailInput): Promise<{ sent: boolean }> {
    if (!this.transporter) {
      this.logger.warn(`SMTP not configured — dry-run only. Would send "${input.subject}" to ${input.to}`);
      return { sent: false };
    }
    await this.transporter.sendMail({
      from: process.env.SMTP_FROM,
      to: input.to,
      subject: input.subject,
      text: input.body,
    });
    return { sent: true };
  }
}
```

`backend/src/mail/mail.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { MailService } from './mail.service';

@Module({
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd backend && npx jest test/mail.service.spec.ts`
Expected: PASS (2 tests)

- [ ] **Step 6: Commit**

```bash
git add backend/src/mail backend/package.json backend/package-lock.json backend/.env.example backend/test/mail.service.spec.ts
git commit -m "Add MailService: real SMTP send via nodemailer with a dry-run fallback"
```

---

### Task 2: Permit deadline logic — ported from actuator's validated formulas

**Files:**
- Create: `backend/src/permits/permit-deadline.ts`
- Test: `backend/test/permit-deadline.spec.ts`

**Interfaces:**
- Produces: `computeRequiredByZ(etdZ: string, rule: { leadTimeHours: number; workingDaysOnly: boolean }): string`, `computeUrgency(requiredByZ: string, nowZ: string): 'BREACH' | 'URGENT' | 'DUE' | 'OK'`, `needsReconfirm(basedOnEtdZ: string, currentEtdZ: string, toleranceHours: number): boolean`. Later tasks (`PermitsService`, frontend) call these exact names.

- [ ] **Step 1: Write the failing tests**

`backend/test/permit-deadline.spec.ts` (test cases and expected values ported directly from `actuator/frontend/js/lib/core-logic.test.js`, which already validated this formula against real scheduling behavior):
```typescript
import { computeRequiredByZ, computeUrgency, needsReconfirm } from '../src/permits/permit-deadline';

describe('computeRequiredByZ', () => {
  it('subtracts lead time directly when workingDaysOnly is false', () => {
    const rule = { leadTimeHours: 24, workingDaysOnly: false };
    expect(computeRequiredByZ('2026-08-20T12:00:00.000Z', rule)).toBe('2026-08-19T12:00:00.000Z');
  });

  it('skips weekends when workingDaysOnly is true', () => {
    const rule = { leadTimeHours: 48, workingDaysOnly: true };
    // ETD Monday 2026-08-24T10:00Z; 48 working hours back: Sat/Sun contribute 0 (skipped),
    // Friday contributes 24h, Thursday contributes 24h = 48 total, lands Thu 2026-08-20T10:00Z.
    expect(computeRequiredByZ('2026-08-24T10:00:00.000Z', rule)).toBe('2026-08-20T10:00:00.000Z');
  });
});

describe('computeUrgency', () => {
  it('returns BREACH when RequiredByZ is in the past', () => {
    expect(computeUrgency('2026-08-10T00:00:00.000Z', '2026-08-15T00:00:00.000Z')).toBe('BREACH');
  });
  it('returns URGENT when due within 24 hours', () => {
    expect(computeUrgency('2026-08-15T20:00:00.000Z', '2026-08-15T00:00:00.000Z')).toBe('URGENT');
  });
  it('returns DUE when due within 72 hours but beyond 24', () => {
    expect(computeUrgency('2026-08-17T12:00:00.000Z', '2026-08-15T00:00:00.000Z')).toBe('DUE');
  });
  it('returns OK when beyond 72 hours out', () => {
    expect(computeUrgency('2026-08-25T00:00:00.000Z', '2026-08-15T00:00:00.000Z')).toBe('OK');
  });
});

describe('needsReconfirm', () => {
  it('is false when the ETD shift is within tolerance', () => {
    expect(needsReconfirm('2026-08-20T12:00:00.000Z', '2026-08-20T13:00:00.000Z', 2)).toBe(false);
  });
  it('is true when the ETD shift exceeds tolerance', () => {
    expect(needsReconfirm('2026-08-20T12:00:00.000Z', '2026-08-20T15:30:00.000Z', 2)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && npx jest test/permit-deadline.spec.ts`
Expected: FAIL — `Cannot find module '../src/permits/permit-deadline'`

- [ ] **Step 3: Implement the deadline logic**

`backend/src/permits/permit-deadline.ts`:
```typescript
export interface DeadlineRule {
  leadTimeHours: number;
  workingDaysOnly: boolean;
}

export type Urgency = 'BREACH' | 'URGENT' | 'DUE' | 'OK';

const URGENT_THRESHOLD_HOURS = 24;
const DUE_THRESHOLD_HOURS = 72;

export function computeRequiredByZ(etdZ: string, rule: DeadlineRule): string {
  const etd = new Date(etdZ);
  if (!rule.workingDaysOnly) {
    return new Date(etd.getTime() - rule.leadTimeHours * 3_600_000).toISOString();
  }
  let remainingHours = rule.leadTimeHours;
  let cursor = new Date(etd);
  while (remainingHours > 0) {
    cursor = new Date(cursor.getTime() - 3_600_000);
    const day = cursor.getUTCDay(); // 0 = Sunday, 6 = Saturday
    if (day !== 0 && day !== 6) {
      remainingHours -= 1;
    }
  }
  return cursor.toISOString();
}

export function computeUrgency(requiredByZ: string, nowZ: string): Urgency {
  const hoursRemaining = (new Date(requiredByZ).getTime() - new Date(nowZ).getTime()) / 3_600_000;
  if (hoursRemaining < 0) return 'BREACH';
  if (hoursRemaining <= URGENT_THRESHOLD_HOURS) return 'URGENT';
  if (hoursRemaining <= DUE_THRESHOLD_HOURS) return 'DUE';
  return 'OK';
}

export function needsReconfirm(basedOnEtdZ: string, currentEtdZ: string, toleranceHours: number): boolean {
  const diffHours = Math.abs(new Date(currentEtdZ).getTime() - new Date(basedOnEtdZ).getTime()) / 3_600_000;
  return diffHours > toleranceHours;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && npx jest test/permit-deadline.spec.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/permits/permit-deadline.ts backend/test/permit-deadline.spec.ts
git commit -m "Port permit deadline/urgency formulas from actuator's validated core-logic.js"
```

---

### Task 3: CountryRequirement entity + migration

**Files:**
- Create: `backend/src/country-requirements/country-requirement.entity.ts`, `backend/src/country-requirements/country-requirements.module.ts`
- Create: `backend/migrations/1755993600000-CreateCountryRequirements.ts`
- Modify: `backend/src/database/data-source.ts` (add `CountryRequirement` to entities/imports)

**Interfaces:**
- Produces: `CountryRequirement` entity — `id: string (uuid)`, `country: string (unique)`, `leadTimeHours: number`, `workingDaysOnly: boolean`, `toleranceHours: number`, `requiredDocs: string[]`, `submissionEmail: string | null`, `createdAt: Date`, `updatedAt: Date`. Registered under `TypeOrmModule.forFeature([CountryRequirement])` in `CountryRequirementsModule`, exported for `PermitsModule` to inject `Repository<CountryRequirement>`.

- [ ] **Step 1: Create the CountryRequirement entity**

`backend/src/country-requirements/country-requirement.entity.ts`:
```typescript
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('country_requirements')
export class CountryRequirement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  country: string;

  @Column({ name: 'lead_time_hours', type: 'int' })
  leadTimeHours: number;

  @Column({ name: 'working_days_only', type: 'boolean', default: false })
  workingDaysOnly: boolean;

  @Column({ name: 'tolerance_hours', type: 'int', default: 4 })
  toleranceHours: number;

  @Column({ name: 'required_docs', type: 'text', array: true, default: '{}' })
  requiredDocs: string[];

  @Column({ name: 'submission_email', type: 'varchar', nullable: true })
  submissionEmail: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
```

- [ ] **Step 2: Create the CountryRequirements module**

`backend/src/country-requirements/country-requirements.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CountryRequirement } from './country-requirement.entity';

@Module({
  imports: [TypeOrmModule.forFeature([CountryRequirement])],
  exports: [TypeOrmModule],
})
export class CountryRequirementsModule {}
```

- [ ] **Step 3: Register CountryRequirement on the migration DataSource**

Modify `backend/src/database/data-source.ts` — add the import and add `CountryRequirement` to the `entities` array:
```typescript
import { CountryRequirement } from '../country-requirements/country-requirement.entity';
```
```typescript
entities: [User, Leg, CountryRequirement],
```

- [ ] **Step 4: Write the migration**

`backend/migrations/1755993600000-CreateCountryRequirements.ts`:
```typescript
import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateCountryRequirements1755993600000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'country_requirements',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' },
          { name: 'country', type: 'varchar', isUnique: true },
          { name: 'lead_time_hours', type: 'int' },
          { name: 'working_days_only', type: 'boolean', default: false },
          { name: 'tolerance_hours', type: 'int', default: 4 },
          { name: 'required_docs', type: 'text', isArray: true, default: "'{}'" },
          { name: 'submission_email', type: 'varchar', isNullable: true },
          { name: 'created_at', type: 'timestamptz', default: 'now()' },
          { name: 'updated_at', type: 'timestamptz', default: 'now()' },
        ],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('country_requirements');
  }
}
```

- [ ] **Step 5: Run the migration and verify the table exists**

Run:
```bash
cd backend
DATABASE_URL="postgres://uaa:uaa@localhost:5432/uaa" npx typeorm-ts-node-commonjs migration:run -d src/database/data-source.ts
```
Then (with Postgres reachable per the pattern established in the foundation plan — publish `postgres`'s port temporarily if needed, same as before):
```bash
docker compose exec postgres psql -U uaa -d uaa -c '\d country_requirements'
```
Expected: prints the 9 columns defined above.

- [ ] **Step 6: Commit**

```bash
git add backend/src/country-requirements backend/migrations/1755993600000-CreateCountryRequirements.ts backend/src/database/data-source.ts
git commit -m "Add CountryRequirement entity and migration"
```

---

### Task 4: FormTemplate entity + migration + mail-merge renderer

**Files:**
- Create: `backend/src/form-templates/form-template.entity.ts`, `backend/src/form-templates/form-templates.module.ts`, `backend/src/form-templates/template-renderer.ts`
- Create: `backend/migrations/1755993600001-CreateFormTemplates.ts`
- Modify: `backend/src/database/data-source.ts` (add `FormTemplate`)
- Test: `backend/test/template-renderer.spec.ts`

**Interfaces:**
- Produces: `FormTemplate` entity — `id: string (uuid)`, `country: string`, `name: string`, `bodyTemplate: string`, `mergeFields: string[]`. `renderTemplate(template: { bodyTemplate: string; mergeFields: string[] }, values: Record<string, string>): string` — later tasks (`PermitsService`) call this exact name.

- [ ] **Step 1: Write the failing test for the renderer**

`backend/test/template-renderer.spec.ts`:
```typescript
import { renderTemplate } from '../src/form-templates/template-renderer';

describe('renderTemplate', () => {
  it('substitutes #1/#2-style positional placeholders in mergeFields order', () => {
    const template = {
      bodyTemplate: 'Requesting permit for #1, tail #2, arriving #3.',
      mergeFields: ['tripNo', 'tail', 'arrDate'],
    };

    const result = renderTemplate(template, { tripNo: '482421', tail: 'N148B', arrDate: '2026-09-16' });

    expect(result).toBe('Requesting permit for 482421, tail N148B, arriving 2026-09-16.');
  });

  it('leaves a placeholder untouched when its merge field has no value', () => {
    const template = { bodyTemplate: 'Captain: #1', mergeFields: ['captName'] };

    const result = renderTemplate(template, {});

    expect(result).toBe('Captain: #1');
  });

  it('does not partially match #1 inside #10 and beyond (double digits stay distinct)', () => {
    const template = {
      bodyTemplate: '#1 #2 #3 #4 #5 #6 #7 #8 #9 #10',
      mergeFields: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'],
    };

    const result = renderTemplate(
      template,
      Object.fromEntries(template.mergeFields.map((f, i) => [f, `V${i + 1}`])),
    );

    expect(result).toBe('V1 V2 V3 V4 V5 V6 V7 V8 V9 V10');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && npx jest test/template-renderer.spec.ts`
Expected: FAIL — `Cannot find module '../src/form-templates/template-renderer'`

- [ ] **Step 3: Implement the renderer, entity, and module**

`backend/src/form-templates/template-renderer.ts`:
```typescript
export interface RenderableTemplate {
  bodyTemplate: string;
  mergeFields: string[];
}

export function renderTemplate(template: RenderableTemplate, values: Record<string, string>): string {
  // Replace highest-numbered placeholders first so "#1" doesn't clobber part of "#10".
  return template.mergeFields
    .map((field, index) => ({ index: index + 1, value: values[field] }))
    .sort((a, b) => b.index - a.index)
    .reduce((body, { index, value }) => {
      if (value == null) return body;
      return body.split(`#${index}`).join(value);
    }, template.bodyTemplate);
}
```

`backend/src/form-templates/form-template.entity.ts`:
```typescript
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('form_templates')
export class FormTemplate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  country: string;

  @Column()
  name: string;

  @Column({ name: 'body_template', type: 'text' })
  bodyTemplate: string;

  @Column({ name: 'merge_fields', type: 'text', array: true, default: '{}' })
  mergeFields: string[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
```

`backend/src/form-templates/form-templates.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FormTemplate } from './form-template.entity';

@Module({
  imports: [TypeOrmModule.forFeature([FormTemplate])],
  exports: [TypeOrmModule],
})
export class FormTemplatesModule {}
```

- [ ] **Step 4: Register FormTemplate on the migration DataSource**

Modify `backend/src/database/data-source.ts` — add the import and add `FormTemplate` to `entities`:
```typescript
import { FormTemplate } from '../form-templates/form-template.entity';
```
```typescript
entities: [User, Leg, CountryRequirement, FormTemplate],
```

- [ ] **Step 5: Write the migration**

`backend/migrations/1755993600001-CreateFormTemplates.ts`:
```typescript
import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateFormTemplates1755993600001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'form_templates',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' },
          { name: 'country', type: 'varchar' },
          { name: 'name', type: 'varchar' },
          { name: 'body_template', type: 'text' },
          { name: 'merge_fields', type: 'text', isArray: true, default: "'{}'" },
          { name: 'created_at', type: 'timestamptz', default: 'now()' },
          { name: 'updated_at', type: 'timestamptz', default: 'now()' },
        ],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('form_templates');
  }
}
```

- [ ] **Step 6: Run the test to verify it passes, then run the migration**

Run: `cd backend && npx jest test/template-renderer.spec.ts`
Expected: PASS (3 tests)

Run:
```bash
DATABASE_URL="postgres://uaa:uaa@localhost:5432/uaa" npx typeorm-ts-node-commonjs migration:run -d src/database/data-source.ts
docker compose exec postgres psql -U uaa -d uaa -c '\d form_templates'
```
Expected: prints the 7 columns defined above.

- [ ] **Step 7: Commit**

```bash
git add backend/src/form-templates backend/migrations/1755993600001-CreateFormTemplates.ts backend/src/database/data-source.ts backend/test/template-renderer.spec.ts
git commit -m "Add FormTemplate entity/migration and #1/#2 mail-merge renderer"
```

---

### Task 5: PermitRequest + Comm entities, migrations, and PermitsService

**Files:**
- Create: `backend/src/permits/permit-request.entity.ts`, `backend/src/permits/comm.entity.ts`
- Create: `backend/src/permits/dto/create-permit-request.dto.ts`, `backend/src/permits/dto/update-permit-request.dto.ts`
- Create: `backend/src/permits/permits.service.ts`
- Create: `backend/migrations/1755993600002-CreatePermitRequests.ts`, `backend/migrations/1755993600003-CreateComms.ts`
- Modify: `backend/src/database/data-source.ts` (add `PermitRequest`, `Comm`)
- Test: `backend/test/permits.service.spec.ts`

**Interfaces:**
- Consumes: `Leg` (Task 4 of the foundation plan), `CountryRequirement` (Task 3), `FormTemplate` + `renderTemplate` (Task 4), `computeRequiredByZ` (Task 2), `MailService` (Task 1).
- Produces: `PermitRequestsService.create(legId: string, country: string): Promise<PermitRequest>` (looks up the leg, the country's `CountryRequirement` and `FormTemplate`, computes `requiredByZ`, renders + sends the email, records a `Comm` row, returns the created `PermitRequest`), `.findByLeg(legId: string): Promise<PermitRequest[]>`, `.update(id: string, dto: UpdatePermitRequestDto): Promise<PermitRequest>`. Later tasks (controller, frontend) call these exact names.

- [ ] **Step 1: Create the PermitRequest and Comm entities**

`backend/src/permits/permit-request.entity.ts`:
```typescript
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export type PermitRequestStatus =
  | 'NOT_STARTED'
  | 'REQUESTED'
  | 'CHASING'
  | 'CONFIRMED'
  | 'RECONFIRM_REQUIRED'
  | 'CANCELLED';

@Entity('permit_requests')
export class PermitRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'leg_id', type: 'uuid' })
  legId: string;

  @Column()
  country: string;

  @Column({ type: 'varchar', default: 'NOT_STARTED' })
  status: PermitRequestStatus;

  @Column({ name: 'required_by_z', type: 'timestamptz', nullable: true })
  requiredByZ: Date | null;

  @Column({ name: 'valid_from', type: 'timestamptz', nullable: true })
  validFrom: Date | null;

  @Column({ name: 'valid_to', type: 'timestamptz', nullable: true })
  validTo: Date | null;

  @Column({ name: 'clearance_number', type: 'varchar', nullable: true })
  clearanceNumber: string | null;

  @Column({ name: 'correlation_token', type: 'varchar', unique: true })
  correlationToken: string;

  @Column({ name: 'submission_email', type: 'varchar', nullable: true })
  submissionEmail: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
```

`backend/src/permits/comm.entity.ts`:
```typescript
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('comms')
export class Comm {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  direction: 'OUTBOUND' | 'INBOUND';

  @Column({ name: 'leg_id', type: 'uuid', nullable: true })
  legId: string | null;

  @Column({ name: 'permit_request_id', type: 'uuid', nullable: true })
  permitRequestId: string | null;

  @Column({ name: 'correlation_token', type: 'varchar', nullable: true })
  correlationToken: string | null;

  @Column({ name: 'from_address', type: 'varchar' })
  fromAddress: string;

  @Column({ name: 'to_address', type: 'varchar' })
  toAddress: string;

  @Column()
  subject: string;

  @Column({ type: 'text' })
  body: string;

  @Column({ type: 'varchar' })
  kind: 'REQUEST' | 'REVISION' | 'CANCEL' | 'NOTIFICATION';

  @Column({ name: 'sent_at', type: 'timestamptz' })
  sentAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
```

- [ ] **Step 2: Create the DTOs**

`backend/src/permits/dto/create-permit-request.dto.ts`:
```typescript
import { IsString } from 'class-validator';

export class CreatePermitRequestDto {
  @IsString()
  country: string;
}
```

`backend/src/permits/dto/update-permit-request.dto.ts`:
```typescript
import { IsDateString, IsIn, IsOptional, IsString } from 'class-validator';
import type { PermitRequestStatus } from '../permit-request.entity';

const STATUSES: PermitRequestStatus[] = [
  'NOT_STARTED',
  'REQUESTED',
  'CHASING',
  'CONFIRMED',
  'RECONFIRM_REQUIRED',
  'CANCELLED',
];

export class UpdatePermitRequestDto {
  @IsOptional() @IsIn(STATUSES) status?: PermitRequestStatus;
  @IsOptional() @IsString() clearanceNumber?: string;
  @IsOptional() @IsDateString() validFrom?: string;
  @IsOptional() @IsDateString() validTo?: string;
}
```

- [ ] **Step 3: Write the failing tests for PermitsService**

`backend/test/permits.service.spec.ts`:
```typescript
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { PermitsService } from '../src/permits/permits.service';
import { PermitRequest } from '../src/permits/permit-request.entity';
import { Comm } from '../src/permits/comm.entity';
import { Leg } from '../src/legs/leg.entity';
import { CountryRequirement } from '../src/country-requirements/country-requirement.entity';
import { FormTemplate } from '../src/form-templates/form-template.entity';
import { MailService } from '../src/mail/mail.service';

describe('PermitsService', () => {
  let service: PermitsService;
  let permitRequestRepo: { create: jest.Mock; save: jest.Mock; find: jest.Mock; findOne: jest.Mock };
  let commRepo: { create: jest.Mock; save: jest.Mock };
  let legRepo: { findOne: jest.Mock };
  let countryRequirementRepo: { findOne: jest.Mock };
  let formTemplateRepo: { findOne: jest.Mock };
  let mailService: { send: jest.Mock };

  const leg = {
    id: 'leg-1',
    legId: 149,
    tripNo: '482421',
    icao: 'HECA',
    tail: 'N148B',
    country: 'Egypt',
    arrDate: new Date('2026-09-16T16:20:00.000Z'),
    captName: 'ADAM HEBERT',
    captEmail: 'adam@example.com',
  };

  const countryRequirement = {
    id: 'cr-1',
    country: 'Egypt',
    leadTimeHours: 96,
    workingDaysOnly: true,
    toleranceHours: 6,
    requiredDocs: ['AOC', 'Insurance', 'Crew List'],
    submissionEmail: 'permits.eg@example.com',
  };

  const formTemplate = {
    id: 'ft-1',
    country: 'Egypt',
    name: 'Egypt Overflight/Landing Request',
    bodyTemplate: 'Requesting permit for trip #1, tail #2.',
    mergeFields: ['tripNo', 'tail'],
  };

  beforeEach(async () => {
    permitRequestRepo = {
      create: jest.fn((dto) => dto),
      save: jest.fn(async (entity) => ({ id: 'pr-1', ...entity })),
      find: jest.fn(),
      findOne: jest.fn(),
    };
    commRepo = { create: jest.fn((dto) => dto), save: jest.fn(async (entity) => ({ id: 'comm-1', ...entity })) };
    legRepo = { findOne: jest.fn().mockResolvedValue(leg) };
    countryRequirementRepo = { findOne: jest.fn().mockResolvedValue(countryRequirement) };
    formTemplateRepo = { findOne: jest.fn().mockResolvedValue(formTemplate) };
    mailService = { send: jest.fn().mockResolvedValue({ sent: true }) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        PermitsService,
        { provide: getRepositoryToken(PermitRequest), useValue: permitRequestRepo },
        { provide: getRepositoryToken(Comm), useValue: commRepo },
        { provide: getRepositoryToken(Leg), useValue: legRepo },
        { provide: getRepositoryToken(CountryRequirement), useValue: countryRequirementRepo },
        { provide: getRepositoryToken(FormTemplate), useValue: formTemplateRepo },
        { provide: MailService, useValue: mailService },
      ],
    }).compile();
    service = moduleRef.get(PermitsService);
  });

  it('computes requiredByZ from the country requirement and the leg arrival date', async () => {
    await service.create('leg-1', 'Egypt');

    // 96 working hours back from 2026-09-16T16:20:00Z (a Wednesday) — trust the ported,
    // separately-tested computeRequiredByZ for the exact value; just assert it was set.
    expect(permitRequestRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ legId: 'leg-1', country: 'Egypt', status: 'REQUESTED' }),
    );
    const createdArg = permitRequestRepo.create.mock.calls[0][0];
    expect(createdArg.requiredByZ).toBeInstanceOf(Date);
  });

  it('renders the country template with leg fields and sends it', async () => {
    await service.create('leg-1', 'Egypt');

    expect(mailService.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'permits.eg@example.com',
        body: expect.stringContaining('Requesting permit for trip 482421, tail N148B.'),
      }),
    );
  });

  it('embeds a [LegID/PR-ID] correlation token in the subject', async () => {
    await service.create('leg-1', 'Egypt');

    expect(mailService.send).toHaveBeenCalledWith(
      expect.objectContaining({ subject: expect.stringMatching(/\[149\/pr-1\]/) }),
    );
  });

  it('records an outbound Comm row for the sent request', async () => {
    await service.create('leg-1', 'Egypt');

    expect(commRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ direction: 'OUTBOUND', kind: 'REQUEST', toAddress: 'permits.eg@example.com' }),
    );
    expect(commRepo.save).toHaveBeenCalled();
  });

  it('throws NotFoundException when the leg does not exist', async () => {
    legRepo.findOne.mockResolvedValue(null);

    await expect(service.create('missing-leg', 'Egypt')).rejects.toThrow(NotFoundException);
  });

  it('throws NotFoundException when there is no CountryRequirement for the country', async () => {
    countryRequirementRepo.findOne.mockResolvedValue(null);

    await expect(service.create('leg-1', 'Nowhereland')).rejects.toThrow(NotFoundException);
  });

  it('lists permit requests for a leg', async () => {
    permitRequestRepo.find.mockResolvedValue([{ id: 'pr-1' }, { id: 'pr-2' }]);

    const result = await service.findByLeg('leg-1');

    expect(permitRequestRepo.find).toHaveBeenCalledWith({ where: { legId: 'leg-1' } });
    expect(result).toHaveLength(2);
  });

  it('updates status and confirmation fields', async () => {
    permitRequestRepo.findOne.mockResolvedValue({ id: 'pr-1', status: 'REQUESTED' });

    const result = await service.update('pr-1', { status: 'CONFIRMED', clearanceNumber: 'EG-4471' });

    expect(permitRequestRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'CONFIRMED', clearanceNumber: 'EG-4471' }),
    );
    expect(result).toEqual(expect.objectContaining({ status: 'CONFIRMED' }));
  });

  it('throws NotFoundException when updating a permit request that does not exist', async () => {
    permitRequestRepo.findOne.mockResolvedValue(null);

    await expect(service.update('missing', { status: 'CONFIRMED' })).rejects.toThrow(NotFoundException);
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `cd backend && npx jest test/permits.service.spec.ts`
Expected: FAIL — `Cannot find module '../src/permits/permits.service'`

- [ ] **Step 5: Implement PermitsService**

`backend/src/permits/permits.service.ts`:
```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PermitRequest } from './permit-request.entity';
import { Comm } from './comm.entity';
import { Leg } from '../legs/leg.entity';
import { CountryRequirement } from '../country-requirements/country-requirement.entity';
import { FormTemplate } from '../form-templates/form-template.entity';
import { renderTemplate } from '../form-templates/template-renderer';
import { computeRequiredByZ } from './permit-deadline';
import { MailService } from '../mail/mail.service';
import { UpdatePermitRequestDto } from './dto/update-permit-request.dto';

@Injectable()
export class PermitsService {
  constructor(
    @InjectRepository(PermitRequest) private readonly permitRequestRepo: Repository<PermitRequest>,
    @InjectRepository(Comm) private readonly commRepo: Repository<Comm>,
    @InjectRepository(Leg) private readonly legRepo: Repository<Leg>,
    @InjectRepository(CountryRequirement) private readonly countryRequirementRepo: Repository<CountryRequirement>,
    @InjectRepository(FormTemplate) private readonly formTemplateRepo: Repository<FormTemplate>,
    private readonly mailService: MailService,
  ) {}

  async create(legId: string, country: string): Promise<PermitRequest> {
    const leg = await this.legRepo.findOne({ where: { id: legId } });
    if (!leg) throw new NotFoundException(`Leg ${legId} not found`);

    const countryRequirement = await this.countryRequirementRepo.findOne({ where: { country } });
    if (!countryRequirement) throw new NotFoundException(`No CountryRequirement for ${country}`);

    const requiredByZ = leg.arrDate
      ? new Date(computeRequiredByZ(leg.arrDate.toISOString(), countryRequirement))
      : null;

    const permitRequest = await this.permitRequestRepo.save(
      this.permitRequestRepo.create({
        legId,
        country,
        status: 'REQUESTED',
        requiredByZ,
        submissionEmail: countryRequirement.submissionEmail,
        correlationToken: '',
      }),
    );

    const correlationToken = `${leg.legId}/${permitRequest.id}`;
    permitRequest.correlationToken = correlationToken;
    await this.permitRequestRepo.save(permitRequest);

    const template = await this.formTemplateRepo.findOne({ where: { country } });
    const body = template
      ? renderTemplate(template, {
          tripNo: leg.tripNo,
          tail: leg.tail ?? '',
          icao: leg.icao,
          acType: leg.acType ?? '',
          captName: leg.captName ?? '',
          captEmail: leg.captEmail ?? '',
        })
      : `Requesting permit for trip ${leg.tripNo}, tail ${leg.tail ?? 'N/A'}.`;

    if (countryRequirement.submissionEmail) {
      await this.mailService.send({
        to: countryRequirement.submissionEmail,
        subject: `Permit Request — Trip ${leg.tripNo} — ${country} [${correlationToken}]`,
        body,
      });

      await this.commRepo.save(
        this.commRepo.create({
          direction: 'OUTBOUND',
          legId,
          permitRequestId: permitRequest.id,
          correlationToken,
          fromAddress: process.env.SMTP_FROM ?? '',
          toAddress: countryRequirement.submissionEmail,
          subject: `Permit Request — Trip ${leg.tripNo} — ${country} [${correlationToken}]`,
          body,
          kind: 'REQUEST',
          sentAt: new Date(),
        }),
      );
    }

    return permitRequest;
  }

  findByLeg(legId: string): Promise<PermitRequest[]> {
    return this.permitRequestRepo.find({ where: { legId } });
  }

  async update(id: string, dto: UpdatePermitRequestDto): Promise<PermitRequest> {
    const permitRequest = await this.permitRequestRepo.findOne({ where: { id } });
    if (!permitRequest) throw new NotFoundException(`PermitRequest ${id} not found`);

    if (dto.status) permitRequest.status = dto.status;
    if (dto.clearanceNumber) permitRequest.clearanceNumber = dto.clearanceNumber;
    if (dto.validFrom) permitRequest.validFrom = new Date(dto.validFrom);
    if (dto.validTo) permitRequest.validTo = new Date(dto.validTo);

    return this.permitRequestRepo.save(permitRequest);
  }
}
```

Note: `correlationToken` is written in two saves (created empty, then set once the row's real `id` exists) because the token embeds the `PermitRequest`'s own id — it can't be known before the first insert. The unique constraint on `correlation_token` still holds since each row is only "live" with a real token after the second save.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd backend && npx jest test/permits.service.spec.ts`
Expected: PASS (9 tests)

- [ ] **Step 7: Write the migrations**

`backend/migrations/1755993600002-CreatePermitRequests.ts`:
```typescript
import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreatePermitRequests1755993600002 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'permit_requests',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' },
          { name: 'leg_id', type: 'uuid' },
          { name: 'country', type: 'varchar' },
          { name: 'status', type: 'varchar', default: "'NOT_STARTED'" },
          { name: 'required_by_z', type: 'timestamptz', isNullable: true },
          { name: 'valid_from', type: 'timestamptz', isNullable: true },
          { name: 'valid_to', type: 'timestamptz', isNullable: true },
          { name: 'clearance_number', type: 'varchar', isNullable: true },
          { name: 'correlation_token', type: 'varchar', isUnique: true },
          { name: 'submission_email', type: 'varchar', isNullable: true },
          { name: 'created_at', type: 'timestamptz', default: 'now()' },
          { name: 'updated_at', type: 'timestamptz', default: 'now()' },
        ],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('permit_requests');
  }
}
```

`backend/migrations/1755993600003-CreateComms.ts`:
```typescript
import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateComms1755993600003 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'comms',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' },
          { name: 'direction', type: 'varchar' },
          { name: 'leg_id', type: 'uuid', isNullable: true },
          { name: 'permit_request_id', type: 'uuid', isNullable: true },
          { name: 'correlation_token', type: 'varchar', isNullable: true },
          { name: 'from_address', type: 'varchar' },
          { name: 'to_address', type: 'varchar' },
          { name: 'subject', type: 'varchar' },
          { name: 'body', type: 'text' },
          { name: 'kind', type: 'varchar' },
          { name: 'sent_at', type: 'timestamptz' },
          { name: 'created_at', type: 'timestamptz', default: 'now()' },
          { name: 'updated_at', type: 'timestamptz', default: 'now()' },
        ],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('comms');
  }
}
```

- [ ] **Step 8: Register PermitRequest and Comm on the migration DataSource, then run the migrations**

Modify `backend/src/database/data-source.ts` — add both imports and add both to `entities`:
```typescript
import { PermitRequest } from '../permits/permit-request.entity';
import { Comm } from '../permits/comm.entity';
```
```typescript
entities: [User, Leg, CountryRequirement, FormTemplate, PermitRequest, Comm],
```

Run:
```bash
cd backend
DATABASE_URL="postgres://uaa:uaa@localhost:5432/uaa" npx typeorm-ts-node-commonjs migration:run -d src/database/data-source.ts
docker compose exec postgres psql -U uaa -d uaa -c '\d permit_requests'
docker compose exec postgres psql -U uaa -d uaa -c '\d comms'
```
Expected: `\d permit_requests` prints 12 columns, `\d comms` prints 12 columns.

- [ ] **Step 9: Commit**

```bash
git add backend/src/permits backend/migrations/1755993600002-CreatePermitRequests.ts backend/migrations/1755993600003-CreateComms.ts backend/src/database/data-source.ts backend/test/permits.service.spec.ts
git commit -m "Add PermitRequest/Comm entities, migrations, and PermitsService"
```

---

### Task 6: Permit requests REST API

**Files:**
- Create: `backend/src/permits/permits.controller.ts`, `backend/src/permits/permits.module.ts`
- Modify: `backend/src/app.module.ts` (import `PermitsModule`)
- Test: `backend/test/permits.e2e-spec.ts`

**Interfaces:**
- Consumes: `PermitsService` (Task 5), `JwtAuthGuard` (foundation plan Task 3).
- Produces: `POST /legs/:legId/permit-requests` (201, body `{ country: string }`), `GET /legs/:legId/permit-requests` (200, array), `PATCH /permit-requests/:id` (200), all guarded by `JwtAuthGuard`.

- [ ] **Step 1: Write the failing e2e test**

`backend/test/permits.e2e-spec.ts`:
```typescript
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PermitsModule } from '../src/permits/permits.module';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { PermitRequest } from '../src/permits/permit-request.entity';
import { Comm } from '../src/permits/comm.entity';
import { Leg } from '../src/legs/leg.entity';
import { CountryRequirement } from '../src/country-requirements/country-requirement.entity';
import { FormTemplate } from '../src/form-templates/form-template.entity';
import { MailService } from '../src/mail/mail.service';

describe('Permits (e2e)', () => {
  let app: INestApplication;
  let permitRequestRepo: { create: jest.Mock; save: jest.Mock; find: jest.Mock; findOne: jest.Mock };

  beforeAll(async () => {
    permitRequestRepo = {
      create: jest.fn((dto) => dto),
      save: jest.fn(async (entity) => ({ id: 'pr-1', ...entity })),
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
    };
    const legRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'leg-1',
        legId: 149,
        tripNo: '482421',
        icao: 'HECA',
        tail: 'N148B',
        arrDate: new Date('2026-09-16T16:20:00.000Z'),
      }),
    };
    const countryRequirementRepo = {
      findOne: jest.fn().mockResolvedValue({
        country: 'Egypt',
        leadTimeHours: 96,
        workingDaysOnly: true,
        submissionEmail: 'permits.eg@example.com',
      }),
    };
    const formTemplateRepo = { findOne: jest.fn().mockResolvedValue(null) };
    const commRepo = { create: jest.fn((dto) => dto), save: jest.fn(async (entity) => ({ id: 'comm-1', ...entity })) };

    const moduleRef = await Test.createTestingModule({
      imports: [PermitsModule],
    })
      .overrideProvider(getRepositoryToken(PermitRequest))
      .useValue(permitRequestRepo)
      .overrideProvider(getRepositoryToken(Comm))
      .useValue(commRepo)
      .overrideProvider(getRepositoryToken(Leg))
      .useValue(legRepo)
      .overrideProvider(getRepositoryToken(CountryRequirement))
      .useValue(countryRequirementRepo)
      .overrideProvider(getRepositoryToken(FormTemplate))
      .useValue(formTemplateRepo)
      .overrideProvider(MailService)
      .useValue({ send: jest.fn().mockResolvedValue({ sent: true }) })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /legs/:legId/permit-requests creates and returns 201', async () => {
    const response = await request(app.getHttpServer())
      .post('/legs/leg-1/permit-requests')
      .send({ country: 'Egypt' });

    expect(response.status).toBe(201);
    expect(response.body).toEqual(expect.objectContaining({ country: 'Egypt', status: 'REQUESTED' }));
  });

  it('GET /legs/:legId/permit-requests returns an array', async () => {
    const response = await request(app.getHttpServer()).get('/legs/leg-1/permit-requests');

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
  });

  it('PATCH /permit-requests/:id updates status', async () => {
    permitRequestRepo.findOne.mockResolvedValue({ id: 'pr-1', status: 'REQUESTED' });

    const response = await request(app.getHttpServer())
      .patch('/permit-requests/pr-1')
      .send({ status: 'CONFIRMED', clearanceNumber: 'EG-4471' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(expect.objectContaining({ status: 'CONFIRMED' }));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && npx jest test/permits.e2e-spec.ts --config test/jest-e2e.json`
Expected: FAIL — `Cannot find module '../src/permits/permits.module'`

- [ ] **Step 3: Implement PermitsController and PermitsModule**

`backend/src/permits/permits.controller.ts`:
```typescript
import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermitsService } from './permits.service';
import { CreatePermitRequestDto } from './dto/create-permit-request.dto';
import { UpdatePermitRequestDto } from './dto/update-permit-request.dto';

@Controller()
@UseGuards(JwtAuthGuard)
export class PermitsController {
  constructor(private readonly permitsService: PermitsService) {}

  @Post('legs/:legId/permit-requests')
  create(@Param('legId') legId: string, @Body() dto: CreatePermitRequestDto) {
    return this.permitsService.create(legId, dto.country);
  }

  @Get('legs/:legId/permit-requests')
  findByLeg(@Param('legId') legId: string) {
    return this.permitsService.findByLeg(legId);
  }

  @Patch('permit-requests/:id')
  update(@Param('id') id: string, @Body() dto: UpdatePermitRequestDto) {
    return this.permitsService.update(id, dto);
  }
}
```

`backend/src/permits/permits.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PermitRequest } from './permit-request.entity';
import { Comm } from './comm.entity';
import { Leg } from '../legs/leg.entity';
import { CountryRequirement } from '../country-requirements/country-requirement.entity';
import { FormTemplate } from '../form-templates/form-template.entity';
import { PermitsService } from './permits.service';
import { PermitsController } from './permits.controller';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PermitRequest, Comm, Leg, CountryRequirement, FormTemplate]),
    MailModule,
  ],
  providers: [PermitsService],
  controllers: [PermitsController],
  exports: [PermitsService],
})
export class PermitsModule {}
```

Note: `PermitsModule` does **not** import `AuthModule`, same reasoning as `LegsModule` in the foundation plan — `JwtAuthGuard` has no constructor dependencies of its own, and importing `AuthModule` here would transitively pull in `UsersModule`'s `User` repository, breaking this task's isolated e2e test (only `Leg`, `CountryRequirement`, `FormTemplate`, `PermitRequest`, and `Comm` repositories are mocked there).

- [ ] **Step 4: Wire PermitsModule into AppModule**

Modify `backend/src/app.module.ts` — add `import { PermitsModule } from './permits/permits.module';` and add `PermitsModule` to the `imports` array.

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd backend && npx jest test/permits.e2e-spec.ts --config test/jest-e2e.json`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add backend/src/permits/permits.controller.ts backend/src/permits/permits.module.ts backend/src/app.module.ts backend/test/permits.e2e-spec.ts
git commit -m "Add JWT-protected permit-requests REST endpoints"
```

---

### Task 7: Seed CountryRequirements + FormTemplates from real data

**Files:**
- Create: `backend/scripts/seed-country-requirements.ts`
- Modify: `backend/package.json` (add `seed:country-requirements` script)

**Interfaces:**
- Consumes: `AppDataSource` (foundation plan Task 2), `CountryRequirement`/`FormTemplate` entities.
- Produces: a runnable script (`npm run seed:country-requirements`) inserting one `CountryRequirement` row per country actually present in the seeded MAYFLY data, plus one generic `FormTemplate` per country. Not a TDD unit-test target (an I/O seed script) — verified by Step 3's run + row-count check.

- [ ] **Step 1: Write the seed script**

`backend/scripts/seed-country-requirements.ts`:
```typescript
import 'reflect-metadata';
import { AppDataSource } from '../src/database/data-source';
import { CountryRequirement } from '../src/country-requirements/country-requirement.entity';
import { FormTemplate } from '../src/form-templates/form-template.entity';

// Lead times/working-days-only for TZ/KE/EG/ZA/AE/SA sourced directly from
// actuator/frontend/js/lib/mock-data/countryRules.js (the design spec names this as the
// reused, already-validated source). The remaining countries — the rest of what's actually
// present in the real seeded MAYFLY legs — don't have an actuator entry; their values below
// are reasonable regional defaults (72h, working-days-only for countries with slower permit
// bureaucracies; 24-48h non-working-days-only for faster ones) and should be confirmed with
// a coordinator before this is relied on for a real deadline, not treated as authoritative.
const COUNTRY_REQUIREMENTS: Array<Omit<CountryRequirement, 'id' | 'createdAt' | 'updatedAt'>> = [
  { country: 'Tanzania', leadTimeHours: 48, workingDaysOnly: false, toleranceHours: 3, requiredDocs: ['AOC', 'Insurance'], submissionEmail: 'permits.tz@example.com' },
  { country: 'Kenya', leadTimeHours: 24, workingDaysOnly: false, toleranceHours: 2, requiredDocs: ['GenDec'], submissionEmail: 'permits.ke@example.com' },
  { country: 'Egypt', leadTimeHours: 96, workingDaysOnly: true, toleranceHours: 6, requiredDocs: ['AOC', 'Insurance', 'Crew List'], submissionEmail: 'permits.eg@example.com' },
  { country: 'South Africa', leadTimeHours: 24, workingDaysOnly: false, toleranceHours: 2, requiredDocs: [], submissionEmail: 'permits.za@example.com' },
  { country: 'UAE', leadTimeHours: 12, workingDaysOnly: false, toleranceHours: 1, requiredDocs: [], submissionEmail: 'permits.ae@example.com' },
  { country: 'Saudi Arabia', leadTimeHours: 72, workingDaysOnly: true, toleranceHours: 2, requiredDocs: ['AOC', 'Insurance', 'Overflight Clearance'], submissionEmail: 'permits.sa@example.com' },
  { country: 'Qatar', leadTimeHours: 48, workingDaysOnly: true, toleranceHours: 3, requiredDocs: ['AOC', 'Insurance'], submissionEmail: 'permits.qa@example.com' },
  { country: 'Kuwait', leadTimeHours: 48, workingDaysOnly: true, toleranceHours: 3, requiredDocs: ['AOC', 'Insurance'], submissionEmail: 'permits.kw@example.com' },
  { country: 'India', leadTimeHours: 72, workingDaysOnly: true, toleranceHours: 4, requiredDocs: ['AOC', 'Insurance', 'GenDec'], submissionEmail: 'permits.in@example.com' },
  { country: 'Morocco', leadTimeHours: 48, workingDaysOnly: false, toleranceHours: 3, requiredDocs: ['AOC'], submissionEmail: 'permits.ma@example.com' },
  { country: 'Nigeria', leadTimeHours: 72, workingDaysOnly: true, toleranceHours: 4, requiredDocs: ['AOC', 'Insurance'], submissionEmail: 'permits.ng@example.com' },
  { country: 'Zambia', leadTimeHours: 48, workingDaysOnly: false, toleranceHours: 3, requiredDocs: ['AOC'], submissionEmail: 'permits.zm@example.com' },
  { country: 'Botswana', leadTimeHours: 48, workingDaysOnly: false, toleranceHours: 3, requiredDocs: ['AOC'], submissionEmail: 'permits.bw@example.com' },
  { country: 'Algeria', leadTimeHours: 72, workingDaysOnly: true, toleranceHours: 4, requiredDocs: ['AOC', 'Insurance'], submissionEmail: 'permits.dz@example.com' },
  { country: 'Israel', leadTimeHours: 72, workingDaysOnly: true, toleranceHours: 4, requiredDocs: ['AOC', 'Insurance', 'Crew List'], submissionEmail: 'permits.il@example.com' },
];

async function main() {
  await AppDataSource.initialize();

  const countryRequirementRepo = AppDataSource.getRepository(CountryRequirement);
  const formTemplateRepo = AppDataSource.getRepository(FormTemplate);

  let crCreated = 0;
  let ftCreated = 0;

  for (const cr of COUNTRY_REQUIREMENTS) {
    const exists = await countryRequirementRepo.findOne({ where: { country: cr.country } });
    if (!exists) {
      await countryRequirementRepo.save(countryRequirementRepo.create(cr));
      crCreated++;
    }

    const templateExists = await formTemplateRepo.findOne({ where: { country: cr.country } });
    if (!templateExists) {
      await formTemplateRepo.save(
        formTemplateRepo.create({
          country: cr.country,
          name: `${cr.country} Permit Request`,
          bodyTemplate:
            'Requesting a landing/overflight permit for trip #1, aircraft #2 (#3), ' +
            'arriving #4. Captain: #5 (#6). Please confirm clearance number and validity window.',
          mergeFields: ['tripNo', 'tail', 'acType', 'icao', 'captName', 'captEmail'],
        }),
      );
      ftCreated++;
    }
  }

  console.log(`Seeded ${crCreated} CountryRequirement(s), ${ftCreated} FormTemplate(s).`);
  await AppDataSource.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Add the npm script**

Modify `backend/package.json` — add to `scripts`: `"seed:country-requirements": "ts-node scripts/seed-country-requirements.ts"`.

- [ ] **Step 3: Run the seed script and verify row counts**

Run:
```bash
cd backend
DATABASE_URL="postgres://uaa:uaa@localhost:5432/uaa" npm run seed:country-requirements
```
Expected: `Seeded 15 CountryRequirement(s), 15 FormTemplate(s).` Verify independently:
```bash
docker compose exec postgres psql -U uaa -d uaa -c "SELECT count(*) FROM country_requirements;"
docker compose exec postgres psql -U uaa -d uaa -c "SELECT count(*) FROM form_templates;"
```
Both should return 15.

- [ ] **Step 4: Commit**

```bash
git add backend/scripts/seed-country-requirements.ts backend/package.json
git commit -m "Seed CountryRequirements and FormTemplates for the 15 countries in real leg data"
```

---

### Task 8: Frontend — Leg detail page

**Files:**
- Create: `frontend/src/app/legs/[id]/page.tsx`
- Modify: `frontend/src/lib/api-client.ts` (add `getLeg`)
- Modify: `frontend/src/app/legs/page.tsx` (link each row to its detail page)
- Test: `frontend/test/leg-detail.test.tsx`

**Interfaces:**
- Consumes: widened `Leg` interface (already has the fields this page needs, from the tail-prefill feature already shipped).
- Produces: `getLeg(token: string, id: string): Promise<Leg>` in `api-client.ts`. Route `/legs/[id]` rendering a leg's full detail. Task 9's permit composer mounts inside this page.

- [ ] **Step 1: Write the failing test for `getLeg`**

Add to `frontend/test/api-client.test.ts`:
```typescript
  it('getLeg fetches a single leg by id with the bearer token', async () => {
    const leg = { id: '1', tripNo: '482421', icao: 'HECA', tail: 'N148B', country: 'Egypt', arrDate: null, depDate: null, legId: 149 };
    (fetch as any).mockResolvedValue({ ok: true, json: async () => leg });

    const result = await getLeg('token-123', '1');

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/legs/1'),
      expect.objectContaining({ headers: { Authorization: 'Bearer token-123' } }),
    );
    expect(result).toEqual(leg);
  });
```
Add `getLeg` to the import at the top of `frontend/test/api-client.test.ts`:
```typescript
import { login, getLegs, createLeg, getLeg } from '../src/lib/api-client';
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run test/api-client.test.ts`
Expected: FAIL — `getLeg is not a function`

- [ ] **Step 3: Implement `getLeg`**

Modify `frontend/src/lib/api-client.ts` — add after `getLegs`:
```typescript
export async function getLeg(token: string, id: string): Promise<Leg> {
  const response = await fetch(`${API_URL}/legs/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('Failed to load leg');
  return response.json();
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx vitest run test/api-client.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Write the failing test for the Leg detail page**

`frontend/test/leg-detail.test.tsx`:
```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import * as apiClient from '../src/lib/api-client';
import LegDetailPage from '../src/app/legs/[id]/page';

vi.mock('../src/lib/api-client', async () => {
  const actual = await vi.importActual<typeof apiClient>('../src/lib/api-client');
  return { ...actual, getLeg: vi.fn(), getLegs: vi.fn() };
});

vi.mock('next/navigation', async () => {
  const actual = await vi.importActual<typeof import('next/navigation')>('next/navigation');
  return {
    ...actual,
    useParams: () => ({ id: '1' }),
    useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  };
});

describe('LegDetailPage', () => {
  beforeEach(() => {
    localStorage.setItem('uaa_token', 'test-token');
  });

  it('renders the leg trip no, ICAO, and tail', async () => {
    vi.mocked(apiClient.getLeg).mockResolvedValue({
      id: '1',
      tripNo: '482421',
      icao: 'HECA',
      tail: 'N148B',
      country: 'Egypt',
      arrDate: null,
      depDate: null,
      legId: 149,
    });
    vi.mocked(apiClient.getLegs).mockResolvedValue([]);

    render(<LegDetailPage />);

    await waitFor(() => expect(screen.getByRole('heading', { name: /482421/ })).toBeInTheDocument());
    expect(screen.getByText('HECA')).toBeInTheDocument();
    expect(screen.getByText('N148B')).toBeInTheDocument();
  });
});
```

Note: two real bugs found running this test, both in the test itself, not the component. First — `next/navigation`'s `useRouter` is mocked globally in `frontend/test/setup.ts` (added when the foundation plan's Legs page picked up a redirect), but this file's own local `vi.mock('next/navigation', ...)` (needed for `useParams`) replaces that mock entirely and spreads in the *real* `useRouter` via `importActual`, which throws `invariant expected app router to be mounted` outside a real Next.js router tree. Any test file that locally mocks `next/navigation` needs to re-declare `useRouter` itself — the global setup mock doesn't compose with a local one. Second — `getByText('482421')` fails because the page renders `Trip {leg.tripNo}` as sibling text nodes inside one `<h1>` (JSX interpolation, not a wrapping element around just the number), so no single node's text content is the exact string `'482421'` — `getByRole('heading', { name: /482421/ })` matches the heading's full accessible name instead, which is the correct fix here (not a component restructure).

- [ ] **Step 6: Run the test to verify it fails**

Run: `cd frontend && npx vitest run test/leg-detail.test.tsx`
Expected: FAIL — `Cannot find module '../src/app/legs/[id]/page'`

- [ ] **Step 7: Implement the Leg detail page**

`frontend/src/app/legs/[id]/page.tsx`:
```tsx
'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getLeg, type Leg } from '@/lib/api-client';
import PermitRequests from './permit-requests';

export default function LegDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [leg, setLeg] = useState<Leg | null>(null);
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('uaa_token');
    if (!token) {
      router.replace('/login');
      return;
    }
    getLeg(token, id)
      .then(setLeg)
      .catch(() => router.replace('/legs'));
  }, [id, router]);

  if (!leg) return null;

  return (
    <div className="board-shell">
      <div className="board-header">
        <h1 className="board-title">
          UAA Coordinator — Trip {leg.tripNo}
        </h1>
        <a className="btn-link" href="/legs">
          Back to legs
        </a>
      </div>
      <div className="runway-rule" />

      <div className="leg-detail-summary">
        <div>
          <span className="col-muted">ICAO</span>
          <span className="col-mono">{leg.icao}</span>
        </div>
        <div>
          <span className="col-muted">Tail</span>
          <span className="col-mono">{leg.tail}</span>
        </div>
        <div>
          <span className="col-muted">Country</span>
          <span>{leg.country}</span>
        </div>
      </div>

      <PermitRequests legId={leg.id} country={leg.country} />
    </div>
  );
}
```

Note: `PermitRequests` (the composer) is a separate component created in Task 9 — this task creates the file as an empty stub so the page compiles standalone first, and Task 9 fills it in. Create `frontend/src/app/legs/[id]/permit-requests.tsx`:
```tsx
export default function PermitRequests(_props: { legId: string; country: string | null }) {
  return null;
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `cd frontend && npx vitest run test/leg-detail.test.tsx`
Expected: PASS (1 test)

- [ ] **Step 9: Link each legs-list row to its detail page**

Modify `frontend/src/app/legs/page.tsx` — wrap the trip-no cell in a link:
```tsx
                <td className="col-mono">
                  <a href={`/legs/${leg.id}`}>{leg.tripNo}</a>
                </td>
```
(replacing the existing `<td className="col-mono">{leg.tripNo}</td>` line).

- [ ] **Step 10: Run the full frontend suite and the build**

Run:
```bash
cd frontend
npx vitest run
npm run build
```
Expected: all tests PASS, build succeeds, new route `/legs/[id]` listed in the build output.

- [ ] **Step 11: Commit**

```bash
git add frontend/src/lib/api-client.ts frontend/src/app/legs/[id] frontend/src/app/legs/page.tsx frontend/test/leg-detail.test.tsx frontend/test/api-client.test.ts
git commit -m "Add Leg detail page, linked from the legs list"
```

---

### Task 9: Frontend — Permit request composer

**Files:**
- Modify: `frontend/src/app/legs/[id]/permit-requests.tsx` (fill in the stub from Task 8)
- Modify: `frontend/src/lib/api-client.ts` (add `PermitRequest` type, `listPermitRequests`, `createPermitRequest`, `updatePermitRequest`)
- Modify: `frontend/src/app/globals.css` (permit list/status styling)
- Test: `frontend/test/permit-composer.test.tsx`

**Interfaces:**
- Consumes: `Leg` detail page (Task 8).
- Produces: a "Request Permit" action per leg that calls `POST /legs/:legId/permit-requests`, a list of existing requests with status, and a status-update control calling `PATCH /permit-requests/:id`.

- [ ] **Step 1: Write the failing test for the new api-client functions**

Add to `frontend/test/api-client.test.ts`:
```typescript
  it('listPermitRequests fetches permit requests for a leg', async () => {
    const requests = [{ id: 'pr-1', legId: '1', country: 'Egypt', status: 'REQUESTED' }];
    (fetch as any).mockResolvedValue({ ok: true, json: async () => requests });

    const result = await listPermitRequests('token-123', '1');

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/legs/1/permit-requests'),
      expect.objectContaining({ headers: { Authorization: 'Bearer token-123' } }),
    );
    expect(result).toEqual(requests);
  });

  it('createPermitRequest posts the country and returns the created request', async () => {
    const created = { id: 'pr-1', legId: '1', country: 'Egypt', status: 'REQUESTED' };
    (fetch as any).mockResolvedValue({ ok: true, json: async () => created });

    const result = await createPermitRequest('token-123', '1', 'Egypt');

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/legs/1/permit-requests'),
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token-123' },
        body: JSON.stringify({ country: 'Egypt' }),
      }),
    );
    expect(result).toEqual(created);
  });

  it('updatePermitRequest patches status and confirmation fields', async () => {
    const updated = { id: 'pr-1', status: 'CONFIRMED' };
    (fetch as any).mockResolvedValue({ ok: true, json: async () => updated });

    const result = await updatePermitRequest('token-123', 'pr-1', { status: 'CONFIRMED', clearanceNumber: 'EG-4471' });

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/permit-requests/pr-1'),
      expect.objectContaining({
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token-123' },
        body: JSON.stringify({ status: 'CONFIRMED', clearanceNumber: 'EG-4471' }),
      }),
    );
    expect(result).toEqual(updated);
  });
```
Add the new names to the import: `import { login, getLegs, createLeg, getLeg, listPermitRequests, createPermitRequest, updatePermitRequest } from '../src/lib/api-client';`

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run test/api-client.test.ts`
Expected: FAIL — `listPermitRequests is not a function`

- [ ] **Step 3: Implement the api-client functions**

Modify `frontend/src/lib/api-client.ts` — add after `getLeg`:
```typescript
export interface PermitRequest {
  id: string;
  legId: string;
  country: string;
  status: 'NOT_STARTED' | 'REQUESTED' | 'CHASING' | 'CONFIRMED' | 'RECONFIRM_REQUIRED' | 'CANCELLED';
  requiredByZ: string | null;
  validFrom: string | null;
  validTo: string | null;
  clearanceNumber: string | null;
}

export interface UpdatePermitRequestInput {
  status?: PermitRequest['status'];
  clearanceNumber?: string;
  validFrom?: string;
  validTo?: string;
}

export async function listPermitRequests(token: string, legId: string): Promise<PermitRequest[]> {
  const response = await fetch(`${API_URL}/legs/${legId}/permit-requests`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('Failed to load permit requests');
  return response.json();
}

export async function createPermitRequest(token: string, legId: string, country: string): Promise<PermitRequest> {
  const response = await fetch(`${API_URL}/legs/${legId}/permit-requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ country }),
  });
  if (!response.ok) throw new Error('Failed to create permit request');
  return response.json();
}

export async function updatePermitRequest(
  token: string,
  id: string,
  input: UpdatePermitRequestInput,
): Promise<PermitRequest> {
  const response = await fetch(`${API_URL}/permit-requests/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error('Failed to update permit request');
  return response.json();
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run test/api-client.test.ts`
Expected: PASS (10 tests)

- [ ] **Step 5: Write the failing test for the composer**

`frontend/test/permit-composer.test.tsx`:
```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as apiClient from '../src/lib/api-client';
import PermitRequests from '../src/app/legs/[id]/permit-requests';

vi.mock('../src/lib/api-client', async () => {
  const actual = await vi.importActual<typeof apiClient>('../src/lib/api-client');
  return { ...actual, listPermitRequests: vi.fn(), createPermitRequest: vi.fn(), updatePermitRequest: vi.fn() };
});

describe('PermitRequests', () => {
  beforeEach(() => {
    localStorage.setItem('uaa_token', 'test-token');
    vi.mocked(apiClient.listPermitRequests).mockReset().mockResolvedValue([]);
    vi.mocked(apiClient.createPermitRequest).mockReset();
    vi.mocked(apiClient.updatePermitRequest).mockReset();
  });

  it('lists existing permit requests with their status', async () => {
    vi.mocked(apiClient.listPermitRequests).mockResolvedValue([
      { id: 'pr-1', legId: '1', country: 'Egypt', status: 'REQUESTED', requiredByZ: null, validFrom: null, validTo: null, clearanceNumber: null },
    ]);

    render(<PermitRequests legId="1" country="Egypt" />);

    await waitFor(() => expect(screen.getByText('Egypt')).toBeInTheDocument());
    expect(screen.getByText('REQUESTED')).toBeInTheDocument();
  });

  it('requests a permit for the leg\'s country and refreshes the list', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.createPermitRequest).mockResolvedValue({
      id: 'pr-1', legId: '1', country: 'Egypt', status: 'REQUESTED', requiredByZ: null, validFrom: null, validTo: null, clearanceNumber: null,
    });

    render(<PermitRequests legId="1" country="Egypt" />);

    await user.click(await screen.findByRole('button', { name: /request permit/i }));

    await waitFor(() => expect(apiClient.createPermitRequest).toHaveBeenCalledWith('test-token', '1', 'Egypt'));
    expect(apiClient.listPermitRequests).toHaveBeenCalledTimes(2); // initial load + refresh after create
  });

  it('marks a permit confirmed with a clearance number', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.listPermitRequests).mockResolvedValue([
      { id: 'pr-1', legId: '1', country: 'Egypt', status: 'REQUESTED', requiredByZ: null, validFrom: null, validTo: null, clearanceNumber: null },
    ]);
    vi.mocked(apiClient.updatePermitRequest).mockResolvedValue({
      id: 'pr-1', legId: '1', country: 'Egypt', status: 'CONFIRMED', requiredByZ: null, validFrom: null, validTo: null, clearanceNumber: 'EG-4471',
    });

    render(<PermitRequests legId="1" country="Egypt" />);

    await user.type(await screen.findByLabelText(/clearance number/i), 'EG-4471');
    await user.click(screen.getByRole('button', { name: /mark confirmed/i }));

    await waitFor(() =>
      expect(apiClient.updatePermitRequest).toHaveBeenCalledWith('test-token', 'pr-1', {
        status: 'CONFIRMED',
        clearanceNumber: 'EG-4471',
      }),
    );
  });
});
```

- [ ] **Step 6: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run test/permit-composer.test.tsx`
Expected: FAIL — the stub `PermitRequests` renders `null`, so none of the queried text/roles exist.

- [ ] **Step 7: Implement the composer**

`frontend/src/app/legs/[id]/permit-requests.tsx`:
```tsx
'use client';

import { useEffect, useState } from 'react';
import { createPermitRequest, listPermitRequests, updatePermitRequest, type PermitRequest } from '@/lib/api-client';

export default function PermitRequests({ legId, country }: { legId: string; country: string | null }) {
  const [requests, setRequests] = useState<PermitRequest[]>([]);
  const [clearanceDrafts, setClearanceDrafts] = useState<Record<string, string>>({});
  const [requesting, setRequesting] = useState(false);

  function refresh() {
    const token = localStorage.getItem('uaa_token');
    if (!token) return Promise.resolve();
    return listPermitRequests(token, legId).then(setRequests);
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [legId]);

  async function handleRequest() {
    const token = localStorage.getItem('uaa_token');
    if (!token || !country) return;
    setRequesting(true);
    try {
      await createPermitRequest(token, legId, country);
      await refresh();
    } finally {
      setRequesting(false);
    }
  }

  async function handleConfirm(id: string) {
    const token = localStorage.getItem('uaa_token');
    if (!token) return;
    await updatePermitRequest(token, id, { status: 'CONFIRMED', clearanceNumber: clearanceDrafts[id] ?? '' });
    await refresh();
  }

  return (
    <fieldset className="permits-section">
      <legend>Permits</legend>

      {country && (
        <button type="button" className="btn-primary" onClick={handleRequest} disabled={requesting}>
          {requesting ? 'Requesting…' : `Request Permit — ${country}`}
        </button>
      )}

      <table className="legs-table permits-table">
        <thead>
          <tr>
            <th>Country</th>
            <th>Status</th>
            <th>Clearance No</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {requests.map((r) => (
            <tr key={r.id}>
              <td>{r.country}</td>
              <td>{r.status}</td>
              <td>
                {r.status === 'CONFIRMED' ? (
                  r.clearanceNumber
                ) : (
                  <>
                    <label htmlFor={`clearance-${r.id}`} className="sr-only">
                      Clearance Number
                    </label>
                    <input
                      id={`clearance-${r.id}`}
                      value={clearanceDrafts[r.id] ?? ''}
                      onChange={(e) => setClearanceDrafts((prev) => ({ ...prev, [r.id]: e.target.value }))}
                    />
                  </>
                )}
              </td>
              <td>
                {r.status !== 'CONFIRMED' && (
                  <button type="button" className="btn-link" onClick={() => handleConfirm(r.id)}>
                    Mark Confirmed
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </fieldset>
  );
}
```

- [ ] **Step 8: Add supporting CSS**

Modify `frontend/src/app/globals.css` — append:
```css
.leg-detail-summary {
  display: flex;
  gap: 32px;
  margin-bottom: 24px;
}

.leg-detail-summary > div {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 13px;
}

.leg-detail-summary .col-muted {
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.permits-section {
  border: 1px solid var(--line);
  border-radius: 2px;
  padding: 16px 20px 20px;
  margin: 0;
}

.permits-section legend {
  padding: 0 8px;
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--accent);
}

.permits-table {
  margin-top: 16px;
}

.permits-table input {
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: 2px;
  color: var(--ink);
  font-family: var(--font-mono);
  font-size: 12px;
  padding: 4px 8px;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
}
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run test/permit-composer.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 10: Run the full frontend suite and the build**

Run:
```bash
cd frontend
npx vitest run
npm run build
```
Expected: all tests PASS, build succeeds.

- [ ] **Step 11: Commit**

```bash
git add frontend/src/app/legs/[id]/permit-requests.tsx frontend/src/lib/api-client.ts frontend/src/app/globals.css frontend/test/permit-composer.test.tsx frontend/test/api-client.test.ts
git commit -m "Add permit request composer to the Leg detail page"
```

---

### Task 10: End-to-end smoke check against the real seeded stack

**Files:** none (verification-only task)

- [ ] **Step 1: Bring up the full stack fresh and run every migration + seed script in order**

Run:
```bash
docker compose down -v
docker compose up --build -d
cd backend
DATABASE_URL="postgres://uaa:uaa@localhost:5432/uaa" npx typeorm-ts-node-commonjs migration:run -d src/database/data-source.ts
DATABASE_URL="postgres://uaa:uaa@localhost:5432/uaa" npm run seed -- "C:/Backups/InsiderTechSol/Aviation/uaa/UAA_Coordinator_v5.xlsm"
DATABASE_URL="postgres://uaa:uaa@localhost:5432/uaa" npm run seed:country-requirements
```
Expected: 6 migrations run (2 from the foundation plan + 4 from this one), leg/user seed reports real counts, country-requirements seed reports `Seeded 15 CountryRequirement(s), 15 FormTemplate(s).`

- [ ] **Step 2: Request a real permit via the API and confirm the dry-run mail log**

Using a real seeded coordinator's token (see the foundation plan's Task 10 for the login flow) and a real leg id (`GET /legs`, take the first entry's `id`):
```bash
curl -s -X POST http://localhost:3011/legs/<leg-id>/permit-requests -H "Authorization: Bearer <token>" -H 'Content-Type: application/json' -d '{"country":"Egypt"}'
```
Expected: `201` with a `PermitRequest` body — `status: "REQUESTED"`, a `correlationToken` matching `<legId>/<uuid>`, `requiredByZ` set. Then:
```bash
docker compose logs backend --tail 5
```
Expected (no `SMTP_HOST` configured in this local environment, per Task 1's dry-run fallback): a `WARN` log line — `SMTP not configured — dry-run only. Would send "Permit Request — Trip ... — Egypt [...]" to permits.eg@example.com`. Confirms the composer→template→send pipeline actually ran end-to-end, without requiring real SMTP credentials for this check.

- [ ] **Step 3: Confirm the outbound Comm row was recorded**

```bash
docker compose exec postgres psql -U uaa -d uaa -c "SELECT direction, kind, to_address, correlation_token FROM comms ORDER BY created_at DESC LIMIT 1;"
```
Expected: one row, `direction = OUTBOUND`, `kind = REQUEST`, `to_address = permits.eg@example.com`, `correlation_token` matching Step 2's response.

- [ ] **Step 4: Confirm the frontend composer renders the same request**

Visit `http://localhost:3012/legs`, sign in, click into the trip used in Step 2, confirm the Permits section shows the request with status `REQUESTED`. Type a clearance number and click "Mark Confirmed"; confirm the row updates to `CONFIRMED` and shows the clearance number.

- [ ] **Step 5: No commit for this task** — it's verification only. If anything fails, fix it in the task that owns the broken piece and re-run this check.

---

## Self-Review

**1. Spec coverage** — this plan implements exactly Build Sequencing item 2 ("Permit request composer + form auto-fill + send, `CountryRequirements` lookups for lead time/docs"). Covered: `CountryRequirements` (Task 3), `FormTemplates` + mail-merge (Task 4), `PermitRequests` + `Comms` + real SMTP send (Tasks 1, 5, 6), reference-data seeding (Task 7), composer UI (Tasks 8-9). Not covered, and explicitly out of scope per Build Sequencing items 3-5: automatic `RequiredByZ`/`ValidFrom`/`ValidTo` re-confirm invalidation, the Action Board, the IMAP inbound worker, agent/crew/team notifications, "Mark Complete" + MAYFLY export. All listed in "Explicitly Deferred" above with the reason each stays out.

**2. Placeholder scan** — no TBD/TODO/"add error handling"/"similar to Task N" found; every step has real, complete code. The one deliberate scope-narrowing (FormTemplate renders into the email body, not a generated `.docx`) is flagged explicitly in Global Constraints and Explicitly Deferred, not silently assumed.

**3. Type consistency** — checked field names across every consumer: `PermitRequest` entity (Task 5) fields match what `PermitsController` (Task 6), the seed script (n/a — seed only touches `CountryRequirement`/`FormTemplate`), and the frontend `PermitRequest` interface (Task 9) all reference; `CountryRequirement.country`/`FormTemplate.country` values match the exact 15 country strings already present in `Legs.country` from the real seeded data (verified via direct read of the workbook, not assumed); `renderTemplate`'s `mergeFields` order used in `PermitsService.create` (Task 5: `tripNo, tail, icao, acType, captName, captEmail`) matches the seed script's `FormTemplate.mergeFields` (Task 7: `tripNo, tail, acType, icao, captName, captEmail`) — **mismatch caught during self-review**: Task 5's call passes values in a different key order than Task 7's template declares (`icao`/`acType` swapped). Since `renderTemplate` looks up by field *name*, not position, in the `values` record — order of the `values` object literal in Task 5 doesn't matter, only `mergeFields`' order (which determines `#1`, `#2`, ...) and that every name in `mergeFields` has a matching key somewhere in `values`. Confirmed both tasks' field-name sets match (`tripNo, tail, icao, acType, captName, captEmail`); no actual bug, just re-confirming the renderer's contract (order comes from `mergeFields`, not from the `values` object) is worth restating here since it's easy to misread as positional-by-object-order at a glance.

---

Plan complete and saved to `docs/superpowers/plans/2026-08-23-permit-request-workflow.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
