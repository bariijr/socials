# Compatibility / Grouping Engine Implementation Plan (B2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a coordinator merge compatible permit requests (same trip, same country, same Overflight/Landing type, pre-confirmation only) into one Requirement spanning multiple legs, via an explicit confirm step — not silently.

**Architecture:** `Requirement.legId` is replaced by a `requirement_legs` join table. `CountryRequirement`/`FormTemplate` become keyed by `(country, serviceType)`. `PermitsService` gains a compatibility-check method and a merge method; every response's flat shape changes `legId: string` → `legIds: string[]` (a deliberate break from B1's byte-stable contract, per explicit user decision). The reconfirm engine's pure `evaluateReconfirm()` stays untouched — callers now pick which leg's arrival date to check across a requirement's whole leg set.

**Tech Stack:** NestJS 10 + TypeORM 0.3, Next.js 14 + Vitest/RTL — unchanged from B1.

**Spec:** `docs/superpowers/specs/2026-08-24-compatibility-grouping-engine-design.md`

## Global Constraints

- Merging is always coordinator-confirmed — the compatibility check never auto-merges.
- Compatibility matching is scoped to one Trip (via `Leg.tripId`), exact on `country` + `serviceType`.
- A candidate is eligible only while its `ServiceCase.status` is `REQUESTED`, `CHASING`, or `RECONFIRM_REQUIRED` — never `CONFIRMED`/`CANCELLED`.
- Merging never sends a new email — it's a data-model change only.
- `evaluateReconfirm()` (`backend/src/permits/reconfirm.ts`) is not touched — its single-`currentArrDateZ`-parameter contract is preserved; callers compute which leg's date to pass it.
- No DB-level FK constraints on any new join-table column, matching the existing convention in this schema area.

## Explicitly Deferred (not this plan)

- Un-merging a leg once merged.
- A follow-up email/notification when a leg is added to an existing request.
- Real, coordinator-vetted per-type lead times/templates — the migration only duplicates today's placeholder values into both types.
- Merging into an already-`CONFIRMED` request.
- Cross-trip compatibility.
- The ground-services module — Sub-project C.

---

## File Structure

```
backend/
├── src/
│   ├── service-cases/
│   │   ├── requirement.entity.ts        # modify: drop legId, add serviceType
│   │   └── requirement-leg.entity.ts    # new
│   ├── country-requirements/
│   │   └── country-requirement.entity.ts # modify: add serviceType, drop unique(country)
│   ├── form-templates/
│   │   └── form-template.entity.ts       # modify: add serviceType
│   ├── permits/
│   │   ├── permits.service.ts            # modify: compatibility check, merge, legIds
│   │   ├── permits.controller.ts         # modify: two new routes
│   │   ├── permits.module.ts             # modify: register RequirementLeg
│   │   ├── reconfirm-sweep.service.ts    # modify: multi-leg reconfirm
│   │   └── dto/
│   │       ├── create-permit-request.dto.ts  # modify: add serviceType
│   │       ├── update-permit-request.dto.ts  # modify: add serviceType
│   │       └── merge-permit-request.dto.ts   # new
│   └── database/data-source.ts           # modify: register RequirementLeg
└── migrations/
    └── 1756425600000-AddCompatibilityGrouping.ts  # new
scripts/
└── seed-country-requirements.ts          # modify: seed both service types

test/
├── permits.service.spec.ts               # modify: full rewrite
├── permits.e2e-spec.ts                    # modify: full rewrite
├── reconfirm-sweep.service.spec.ts        # modify: multi-leg cases added
├── legs.e2e-spec.ts                        # modify: add RequirementLeg override
└── notifications.e2e-spec.ts               # modify: add RequirementLeg override

frontend/
├── src/
│   ├── lib/api-client.ts                 # modify: legIds, serviceType, compatible/merge fns
│   └── app/
│       ├── legs/[id]/permit-requests.tsx # modify: type select + merge confirm UI
│       └── action-board/page.tsx         # modify: legIds[0]
└── test/
    ├── permit-composer.test.tsx          # modify: new tests for merge flow
    └── action-board.test.tsx              # modify: legIds fixture
```

---

### Task 1: Entities, migration, and seed data

**Files:**
- Modify: `backend/src/service-cases/requirement.entity.ts`, `backend/src/country-requirements/country-requirement.entity.ts`, `backend/src/form-templates/form-template.entity.ts`, `backend/src/database/data-source.ts`, `backend/scripts/seed-country-requirements.ts`
- Create: `backend/src/service-cases/requirement-leg.entity.ts`, `backend/migrations/1756425600000-AddCompatibilityGrouping.ts`

**Interfaces:**
- Produces: `RequirementLeg` (`id`, `requirementId`, `legId`, `createdAt`), `Requirement.serviceType: ServiceType`, `CountryRequirement.serviceType`, `FormTemplate.serviceType`. Task 2 consumes all of these.

- [ ] **Step 1: Add `serviceType` to Requirement, drop legId**

Modify `backend/src/service-cases/requirement.entity.ts`:
```typescript
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export type Responsibility =
  | 'OUR_ARRANGEMENT'
  | 'CLIENT_ARRANGEMENT'
  | 'OPERATOR_ARRANGEMENT'
  | 'THIRD_PARTY_ARRANGEMENT'
  | 'NOT_REQUIRED'
  | 'WAIVED'
  | 'TBD';

export type ServiceType = 'OVERFLIGHT' | 'LANDING';

@Entity('requirements')
export class Requirement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  country: string;

  @Column({ name: 'service_category', type: 'varchar', default: 'PERMIT' })
  serviceCategory: string;

  @Column({ name: 'service_type', type: 'varchar' })
  serviceType: ServiceType;

  @Column({ type: 'varchar', default: 'OUR_ARRANGEMENT' })
  responsibility: Responsibility;

  @Column({ name: 'required_by_z', type: 'timestamptz', nullable: true })
  requiredByZ: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
```
(the `legId` column is removed entirely — leg association now lives in `RequirementLeg`)

- [ ] **Step 2: Create the RequirementLeg entity**

`backend/src/service-cases/requirement-leg.entity.ts`:
```typescript
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('requirement_legs')
export class RequirementLeg {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'requirement_id', type: 'uuid' })
  requirementId: string;

  @Column({ name: 'leg_id', type: 'uuid' })
  legId: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
```

- [ ] **Step 3: Add serviceType to CountryRequirement, drop unique(country)**

Modify `backend/src/country-requirements/country-requirement.entity.ts`:
```typescript
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import type { ServiceType } from '../service-cases/requirement.entity';

@Entity('country_requirements')
export class CountryRequirement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  country: string;

  @Column({ name: 'service_type', type: 'varchar' })
  serviceType: ServiceType;

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
(removed `{ unique: true }` from `country` — uniqueness is now "one row per (country, serviceType)", enforced at the application layer, matching this schema area's no-DB-constraint convention)

- [ ] **Step 4: Add serviceType to FormTemplate**

Modify `backend/src/form-templates/form-template.entity.ts`:
```typescript
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import type { ServiceType } from '../service-cases/requirement.entity';

@Entity('form_templates')
export class FormTemplate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  country: string;

  @Column({ name: 'service_type', type: 'varchar' })
  serviceType: ServiceType;

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

- [ ] **Step 5: Write the migration**

`backend/migrations/1756425600000-AddCompatibilityGrouping.ts`:
```typescript
import { MigrationInterface, QueryRunner, Table, TableColumn } from 'typeorm';

export class AddCompatibilityGrouping1756425600000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'requirement_legs',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' },
          { name: 'requirement_id', type: 'uuid' },
          { name: 'leg_id', type: 'uuid' },
          { name: 'created_at', type: 'timestamptz', default: 'now()' },
        ],
      }),
    );

    // One row per existing Requirement — every request today covers exactly one leg,
    // so this backfill is lossless.
    await queryRunner.query(`
      INSERT INTO requirement_legs (id, requirement_id, leg_id, created_at)
      SELECT gen_random_uuid(), id, leg_id, now()
      FROM requirements
    `);

    await queryRunner.query(`ALTER TABLE requirements DROP COLUMN leg_id`);
    await queryRunner.addColumn(
      'requirements',
      new TableColumn({ name: 'service_type', type: 'varchar', isNullable: false, default: "'OVERFLIGHT'" }),
    );

    const countryRequirementsTable = await queryRunner.getTable('country_requirements');
    const countryUnique = countryRequirementsTable!.uniques.find((u) => u.columnNames.includes('country'));
    if (countryUnique) {
      await queryRunner.dropUniqueConstraint('country_requirements', countryUnique);
    }
    await queryRunner.addColumn(
      'country_requirements',
      new TableColumn({ name: 'service_type', type: 'varchar', isNullable: false, default: "'OVERFLIGHT'" }),
    );
    // Duplicate every existing (now-OVERFLIGHT-defaulted) row into a LANDING row with
    // identical starting values — real per-type values are a coordinator follow-up,
    // same as the existing seed data's placeholder values already are today.
    await queryRunner.query(`
      INSERT INTO country_requirements (id, country, service_type, lead_time_hours, working_days_only, tolerance_hours, required_docs, submission_email, created_at, updated_at)
      SELECT gen_random_uuid(), country, 'LANDING', lead_time_hours, working_days_only, tolerance_hours, required_docs, submission_email, created_at, updated_at
      FROM country_requirements
      WHERE service_type = 'OVERFLIGHT'
    `);

    await queryRunner.addColumn(
      'form_templates',
      new TableColumn({ name: 'service_type', type: 'varchar', isNullable: false, default: "'OVERFLIGHT'" }),
    );
    await queryRunner.query(`
      INSERT INTO form_templates (id, country, service_type, name, body_template, merge_fields, created_at, updated_at)
      SELECT gen_random_uuid(), country, 'LANDING', name, body_template, merge_fields, created_at, updated_at
      FROM form_templates
      WHERE service_type = 'OVERFLIGHT'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM form_templates WHERE service_type = 'LANDING'`);
    await queryRunner.dropColumn('form_templates', 'service_type');

    await queryRunner.query(`DELETE FROM country_requirements WHERE service_type = 'LANDING'`);
    await queryRunner.dropColumn('country_requirements', 'service_type');
    await queryRunner.query(`ALTER TABLE country_requirements ADD CONSTRAINT UQ_country_requirements_country UNIQUE (country)`);

    // Lossy: a Requirement that was actually merged (>1 leg) loses every leg but the
    // earliest-added one on rollback. Acceptable for a down() path this project has
    // never needed to run in practice.
    await queryRunner.addColumn('requirements', new TableColumn({ name: 'leg_id', type: 'uuid', isNullable: true }));
    await queryRunner.query(`
      UPDATE requirements SET leg_id = sub.leg_id
      FROM (
        SELECT DISTINCT ON (requirement_id) requirement_id, leg_id
        FROM requirement_legs
        ORDER BY requirement_id, created_at ASC
      ) sub
      WHERE requirements.id = sub.requirement_id
    `);
    await queryRunner.query(`ALTER TABLE requirements ALTER COLUMN leg_id SET NOT NULL`);
    await queryRunner.dropColumn('requirements', 'service_type');

    await queryRunner.dropTable('requirement_legs');
  }
}
```

- [ ] **Step 6: Register RequirementLeg in the CLI data source**

Modify `backend/src/database/data-source.ts`:
```typescript
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { User } from '../users/user.entity';
import { Leg } from '../legs/leg.entity';
import { CountryRequirement } from '../country-requirements/country-requirement.entity';
import { FormTemplate } from '../form-templates/form-template.entity';
import { Comm } from '../permits/comm.entity';
import { Team } from '../notifications/team.entity';
import { Trip } from '../trips/trip.entity';
import { Requirement } from '../service-cases/requirement.entity';
import { RequirementLeg } from '../service-cases/requirement-leg.entity';
import { ServiceCase } from '../service-cases/service-case.entity';
import { ServiceOrder } from '../service-cases/service-order.entity';

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [User, Leg, CountryRequirement, FormTemplate, Comm, Team, Trip, Requirement, RequirementLeg, ServiceCase, ServiceOrder],
  migrations: ['migrations/*.ts'],
  synchronize: false,
});
```

- [ ] **Step 7: Update the seed script to seed both service types**

Replace `backend/scripts/seed-country-requirements.ts`:
```typescript
import 'reflect-metadata';
import { AppDataSource } from '../src/database/data-source';
import { CountryRequirement } from '../src/country-requirements/country-requirement.entity';
import { FormTemplate } from '../src/form-templates/form-template.entity';
import type { ServiceType } from '../src/service-cases/requirement.entity';

// Lead times/working-days-only for TZ/KE/EG/ZA/AE/SA sourced directly from
// actuator/frontend/js/lib/mock-data/countryRules.js (the design spec names this as the
// reused, already-validated source). The remaining countries — the rest of what's actually
// present in the real seeded MAYFLY legs — don't have an actuator entry; their values below
// are reasonable regional defaults (72h, working-days-only for countries with slower permit
// bureaucracies; 24-48h non-working-days-only for faster ones) and should be confirmed with
// a coordinator before this is relied on for a real deadline, not treated as authoritative.
//
// Sub-project B2: each country now needs one row per ServiceType. Real per-type values
// (Overflight vs. Landing may genuinely differ) are a coordinator follow-up — for now both
// types get the same starting values per country, same as every value below already was a
// placeholder before B2.
const BASE_COUNTRY_REQUIREMENTS: Array<Omit<CountryRequirement, 'id' | 'createdAt' | 'updatedAt' | 'serviceType'>> = [
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

const SERVICE_TYPES: ServiceType[] = ['OVERFLIGHT', 'LANDING'];

async function main() {
  await AppDataSource.initialize();

  const countryRequirementRepo = AppDataSource.getRepository(CountryRequirement);
  const formTemplateRepo = AppDataSource.getRepository(FormTemplate);

  let crCreated = 0;
  let ftCreated = 0;

  for (const base of BASE_COUNTRY_REQUIREMENTS) {
    for (const serviceType of SERVICE_TYPES) {
      const exists = await countryRequirementRepo.findOne({ where: { country: base.country, serviceType } });
      if (!exists) {
        await countryRequirementRepo.save(countryRequirementRepo.create({ ...base, serviceType }));
        crCreated++;
      }

      const templateExists = await formTemplateRepo.findOne({ where: { country: base.country, serviceType } });
      if (!templateExists) {
        await formTemplateRepo.save(
          formTemplateRepo.create({
            country: base.country,
            serviceType,
            name: `${base.country} ${serviceType === 'OVERFLIGHT' ? 'Overflight' : 'Landing'} Permit Request`,
            bodyTemplate:
              'Requesting a landing/overflight permit for trip #1, aircraft #2 (#3), ' +
              'arriving #4. Captain: #5 (#6). Please confirm clearance number and validity window.',
            mergeFields: ['tripNo', 'tail', 'acType', 'icao', 'captName', 'captEmail'],
          }),
        );
        ftCreated++;
      }
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

- [ ] **Step 8: Commit**

```bash
git add backend/src/service-cases/requirement.entity.ts backend/src/service-cases/requirement-leg.entity.ts backend/src/country-requirements/country-requirement.entity.ts backend/src/form-templates/form-template.entity.ts backend/src/database/data-source.ts backend/scripts/seed-country-requirements.ts backend/migrations/1756425600000-AddCompatibilityGrouping.ts
git commit -m "Add RequirementLeg join table and serviceType-aware CountryRequirement/FormTemplate"
```

---

### Task 2: Rewrite PermitsService with compatibility check, merge, and multi-leg responses

**Files:**
- Modify: `backend/src/permits/permits.service.ts`, `backend/src/permits/permits.module.ts`, `backend/src/permits/dto/create-permit-request.dto.ts`, `backend/src/permits/dto/update-permit-request.dto.ts`
- Create: `backend/src/permits/dto/merge-permit-request.dto.ts`
- Test: `backend/test/permits.service.spec.ts`

**Interfaces:**
- Consumes: `RequirementLeg`, `Requirement.serviceType` (Task 1).
- Produces: `PermitsService.findCompatible/create/merge/findByLeg/update/findAllWithUrgency/reconcileForLeg/addManualComm` — `create` and `update` gain `serviceType`; every response's `legId: string` becomes `legIds: string[]`; `findCompatible` and `merge` are new.

- [ ] **Step 1: Add serviceType to the create/update DTOs, add the merge DTO**

Replace `backend/src/permits/dto/create-permit-request.dto.ts`:
```typescript
import { IsIn, IsString } from 'class-validator';
import type { ServiceType } from '../../service-cases/requirement.entity';

const SERVICE_TYPES: ServiceType[] = ['OVERFLIGHT', 'LANDING'];

export class CreatePermitRequestDto {
  @IsString()
  country: string;

  @IsIn(SERVICE_TYPES)
  serviceType: ServiceType;
}
```

Modify `backend/src/permits/dto/update-permit-request.dto.ts` — add the import and field:
```typescript
import { IsDateString, IsIn, IsOptional, IsString } from 'class-validator';
import type { ServiceCaseStatus } from '../../service-cases/service-case.entity';
import type { Responsibility, ServiceType } from '../../service-cases/requirement.entity';

const STATUSES: ServiceCaseStatus[] = [
  'NOT_STARTED',
  'REQUESTED',
  'CHASING',
  'CONFIRMED',
  'RECONFIRM_REQUIRED',
  'CANCELLED',
];

const RESPONSIBILITIES: Responsibility[] = [
  'OUR_ARRANGEMENT',
  'CLIENT_ARRANGEMENT',
  'OPERATOR_ARRANGEMENT',
  'THIRD_PARTY_ARRANGEMENT',
  'NOT_REQUIRED',
  'WAIVED',
  'TBD',
];

const SERVICE_TYPES: ServiceType[] = ['OVERFLIGHT', 'LANDING'];

export class UpdatePermitRequestDto {
  @IsOptional() @IsIn(STATUSES) status?: ServiceCaseStatus;
  @IsOptional() @IsString() clearanceNumber?: string;
  @IsOptional() @IsDateString() validFrom?: string;
  @IsOptional() @IsDateString() validTo?: string;
  @IsOptional() @IsIn(RESPONSIBILITIES) responsibility?: Responsibility;
  @IsOptional() @IsIn(SERVICE_TYPES) serviceType?: ServiceType;
}
```

`backend/src/permits/dto/merge-permit-request.dto.ts`:
```typescript
import { IsUUID } from 'class-validator';

export class MergePermitRequestDto {
  @IsUUID()
  requirementId: string;
}
```

- [ ] **Step 2: Write the failing service tests (full rewrite)**

Replace `backend/test/permits.service.spec.ts`:
```typescript
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { PermitsService } from '../src/permits/permits.service';
import { Requirement } from '../src/service-cases/requirement.entity';
import { RequirementLeg } from '../src/service-cases/requirement-leg.entity';
import { ServiceCase } from '../src/service-cases/service-case.entity';
import { ServiceOrder } from '../src/service-cases/service-order.entity';
import { Comm } from '../src/permits/comm.entity';
import { Leg } from '../src/legs/leg.entity';
import { CountryRequirement } from '../src/country-requirements/country-requirement.entity';
import { FormTemplate } from '../src/form-templates/form-template.entity';
import { MailService } from '../src/mail/mail.service';

describe('PermitsService', () => {
  let service: PermitsService;
  let requirementRepo: { create: jest.Mock; save: jest.Mock; find: jest.Mock; findOne: jest.Mock };
  let requirementLegRepo: { create: jest.Mock; save: jest.Mock; find: jest.Mock };
  let serviceCaseRepo: { create: jest.Mock; save: jest.Mock; find: jest.Mock; findOne: jest.Mock };
  let serviceOrderRepo: { create: jest.Mock; save: jest.Mock; findOne: jest.Mock };
  let commRepo: { create: jest.Mock; save: jest.Mock };
  let legRepo: { findOne: jest.Mock; find: jest.Mock };
  let countryRequirementRepo: { findOne: jest.Mock };
  let formTemplateRepo: { findOne: jest.Mock };
  let mailService: { send: jest.Mock };

  const leg1 = {
    id: 'leg-1', legId: 149, tripId: 'trip-1', tripNo: '482421', icao: 'HECA', tail: 'N148B',
    country: 'Egypt', arrDate: new Date('2026-09-16T16:20:00.000Z'),
    captName: 'ADAM HEBERT', captEmail: 'adam@example.com',
  };
  const leg2 = {
    id: 'leg-2', legId: 150, tripId: 'trip-1', tripNo: '482421', icao: 'HECA', tail: 'N148B',
    country: 'Egypt', arrDate: new Date('2026-09-18T10:00:00.000Z'),
    captName: 'ADAM HEBERT', captEmail: 'adam@example.com',
  };

  const countryRequirement = {
    id: 'cr-1', country: 'Egypt', serviceType: 'OVERFLIGHT', leadTimeHours: 96, workingDaysOnly: true,
    toleranceHours: 6, requiredDocs: ['AOC', 'Insurance', 'Crew List'], submissionEmail: 'permits.eg@example.com',
  };
  const formTemplate = {
    id: 'ft-1', country: 'Egypt', serviceType: 'OVERFLIGHT', name: 'Egypt Overflight Permit Request',
    bodyTemplate: 'Requesting permit for trip #1, tail #2.', mergeFields: ['tripNo', 'tail'],
  };

  beforeEach(async () => {
    requirementRepo = {
      create: jest.fn((dto) => dto),
      save: jest.fn(async (entity) => ({ id: 'req-1', ...entity })),
      find: jest.fn(),
      findOne: jest.fn(),
    };
    requirementLegRepo = {
      create: jest.fn((dto) => dto),
      save: jest.fn(async (entity) => ({ id: 'rl-1', ...entity })),
      find: jest.fn().mockResolvedValue([]),
    };
    serviceCaseRepo = {
      create: jest.fn((dto) => dto),
      save: jest.fn(async (entity) => ({ id: 'sc-1', ...entity })),
      find: jest.fn(),
      findOne: jest.fn(),
    };
    serviceOrderRepo = {
      create: jest.fn((dto) => dto),
      save: jest.fn(async (entity) => ({ id: 'so-1', ...entity })),
      findOne: jest.fn(),
    };
    commRepo = { create: jest.fn((dto) => dto), save: jest.fn(async (entity) => ({ id: 'comm-1', ...entity })) };
    legRepo = {
      findOne: jest.fn(async ({ where: { id } }: any) => ({ leg1, leg2 } as any)[id === 'leg-1' ? 'leg1' : id === 'leg-2' ? 'leg2' : '']
        ?? (id === 'leg-1' ? leg1 : id === 'leg-2' ? leg2 : null)),
      find: jest.fn().mockResolvedValue([leg1, leg2]),
    };
    countryRequirementRepo = { findOne: jest.fn().mockResolvedValue(countryRequirement) };
    formTemplateRepo = { findOne: jest.fn().mockResolvedValue(formTemplate) };
    mailService = { send: jest.fn().mockResolvedValue({ sent: true }) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        PermitsService,
        { provide: getRepositoryToken(Requirement), useValue: requirementRepo },
        { provide: getRepositoryToken(RequirementLeg), useValue: requirementLegRepo },
        { provide: getRepositoryToken(ServiceCase), useValue: serviceCaseRepo },
        { provide: getRepositoryToken(ServiceOrder), useValue: serviceOrderRepo },
        { provide: getRepositoryToken(Comm), useValue: commRepo },
        { provide: getRepositoryToken(Leg), useValue: legRepo },
        { provide: getRepositoryToken(CountryRequirement), useValue: countryRequirementRepo },
        { provide: getRepositoryToken(FormTemplate), useValue: formTemplateRepo },
        { provide: MailService, useValue: mailService },
      ],
    }).compile();
    service = moduleRef.get(PermitsService);
  });

  describe('create', () => {
    it('creates a Requirement with the given serviceType and one RequirementLeg row', async () => {
      await service.create('leg-1', 'Egypt', 'OVERFLIGHT');

      expect(requirementRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ country: 'Egypt', serviceType: 'OVERFLIGHT', responsibility: 'OUR_ARRANGEMENT' }),
      );
      expect(requirementLegRepo.create).toHaveBeenCalledWith({ requirementId: 'req-1', legId: 'leg-1' });
      expect(requirementLegRepo.save).toHaveBeenCalled();
    });

    it('looks up CountryRequirement/FormTemplate by (country, serviceType)', async () => {
      await service.create('leg-1', 'Egypt', 'OVERFLIGHT');

      expect(countryRequirementRepo.findOne).toHaveBeenCalledWith({ where: { country: 'Egypt', serviceType: 'OVERFLIGHT' } });
      expect(formTemplateRepo.findOne).toHaveBeenCalledWith({ where: { country: 'Egypt', serviceType: 'OVERFLIGHT' } });
    });

    it('throws NotFoundException when the leg does not exist', async () => {
      legRepo.findOne.mockResolvedValueOnce(null);
      await expect(service.create('missing-leg', 'Egypt', 'OVERFLIGHT')).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when there is no matching CountryRequirement', async () => {
      countryRequirementRepo.findOne.mockResolvedValue(null);
      await expect(service.create('leg-1', 'Egypt', 'LANDING')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findCompatible', () => {
    it('finds a compatible pre-confirmation Requirement on another leg of the same trip', async () => {
      requirementLegRepo.find.mockImplementation(async ({ where }: any) => {
        if (where.legId?.value ?? where.legId) return [{ requirementId: 'req-1', legId: 'leg-2' }];
        return [];
      });
      requirementRepo.findOne.mockResolvedValue({ id: 'req-1', country: 'Egypt', serviceType: 'OVERFLIGHT' });
      serviceCaseRepo.findOne.mockResolvedValue({ id: 'sc-1', requirementId: 'req-1', status: 'REQUESTED' });
      serviceOrderRepo.findOne.mockResolvedValue({ id: 'so-1', serviceCaseId: 'sc-1', correlationToken: '150/sc-1' });

      const result = await service.findCompatible('leg-1', 'Egypt', 'OVERFLIGHT');

      expect(result).toEqual(
        expect.objectContaining({ requirementId: 'req-1', status: 'REQUESTED', correlationToken: '150/sc-1' }),
      );
    });

    it('returns null when no other leg of the trip has a matching country/serviceType Requirement', async () => {
      requirementLegRepo.find.mockResolvedValue([]);

      const result = await service.findCompatible('leg-1', 'Egypt', 'OVERFLIGHT');

      expect(result).toBeNull();
    });

    it('excludes a candidate whose ServiceCase is already CONFIRMED', async () => {
      requirementLegRepo.find.mockResolvedValueOnce([{ requirementId: 'req-1', legId: 'leg-2' }]).mockResolvedValue([]);
      requirementRepo.findOne.mockResolvedValue({ id: 'req-1', country: 'Egypt', serviceType: 'OVERFLIGHT' });
      serviceCaseRepo.findOne.mockResolvedValue({ id: 'sc-1', requirementId: 'req-1', status: 'CONFIRMED' });

      const result = await service.findCompatible('leg-1', 'Egypt', 'OVERFLIGHT');

      expect(result).toBeNull();
    });

    it('excludes a candidate with a different serviceType', async () => {
      requirementLegRepo.find.mockResolvedValueOnce([{ requirementId: 'req-1', legId: 'leg-2' }]).mockResolvedValue([]);
      requirementRepo.findOne.mockResolvedValue({ id: 'req-1', country: 'Egypt', serviceType: 'LANDING' });

      const result = await service.findCompatible('leg-1', 'Egypt', 'OVERFLIGHT');

      expect(result).toBeNull();
    });
  });

  describe('merge', () => {
    it('adds the leg to the existing Requirement and returns the updated flat shape', async () => {
      requirementRepo.findOne.mockResolvedValue({ id: 'req-1', country: 'Egypt', serviceType: 'OVERFLIGHT', responsibility: 'OUR_ARRANGEMENT', requiredByZ: null });
      serviceCaseRepo.findOne.mockResolvedValue({ id: 'sc-1', requirementId: 'req-1', status: 'REQUESTED' });
      serviceOrderRepo.findOne.mockResolvedValue({ id: 'so-1', serviceCaseId: 'sc-1', correlationToken: '149/sc-1' });
      requirementLegRepo.find.mockResolvedValueOnce([{ legId: 'leg-2' }]).mockResolvedValue([{ legId: 'leg-2' }, { legId: 'leg-1' }]);

      const result = await service.merge('leg-1', 'req-1');

      expect(requirementLegRepo.save).toHaveBeenCalledWith({ requirementId: 'req-1', legId: 'leg-1' });
      expect(result.legIds).toEqual(['leg-2', 'leg-1']);
    });

    it('does not duplicate a RequirementLeg row if the leg is already attached', async () => {
      requirementRepo.findOne.mockResolvedValue({ id: 'req-1', country: 'Egypt', serviceType: 'OVERFLIGHT', responsibility: 'OUR_ARRANGEMENT', requiredByZ: null });
      serviceCaseRepo.findOne.mockResolvedValue({ id: 'sc-1', requirementId: 'req-1', status: 'REQUESTED' });
      serviceOrderRepo.findOne.mockResolvedValue({ id: 'so-1', serviceCaseId: 'sc-1', correlationToken: '149/sc-1' });
      requirementLegRepo.find.mockResolvedValue([{ legId: 'leg-1' }]);

      await service.merge('leg-1', 'req-1');

      expect(requirementLegRepo.save).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the target Requirement is no longer pre-confirmation', async () => {
      requirementRepo.findOne.mockResolvedValue({ id: 'req-1', country: 'Egypt', serviceType: 'OVERFLIGHT' });
      serviceCaseRepo.findOne.mockResolvedValue({ id: 'sc-1', requirementId: 'req-1', status: 'CONFIRMED' });

      await expect(service.merge('leg-1', 'req-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findByLeg / findAllWithUrgency', () => {
    it('lists permit requests covering a leg via RequirementLeg', async () => {
      requirementLegRepo.find.mockResolvedValue([{ requirementId: 'req-1', legId: 'leg-1' }]);
      requirementRepo.findOne.mockResolvedValue({ id: 'req-1', country: 'Egypt', serviceType: 'OVERFLIGHT', responsibility: 'OUR_ARRANGEMENT', requiredByZ: null });
      serviceCaseRepo.findOne.mockResolvedValue({ id: 'sc-1', requirementId: 'req-1', status: 'REQUESTED', validFrom: null, validTo: null, clearanceNumber: null, createdAt: new Date(), updatedAt: new Date() });
      serviceOrderRepo.findOne.mockResolvedValue({ id: 'so-1', serviceCaseId: 'sc-1', submissionEmail: null, correlationToken: '149/sc-1' });

      const result = await service.findByLeg('leg-1');

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(expect.objectContaining({ id: 'sc-1', country: 'Egypt', serviceType: 'OVERFLIGHT' }));
    });

    it('findAllWithUrgency reports legIds and uses the first leg for legSummary', async () => {
      serviceCaseRepo.find.mockResolvedValue([
        { id: 'sc-1', requirementId: 'req-1', status: 'REQUESTED', validFrom: null, validTo: null, clearanceNumber: null, createdAt: new Date(), updatedAt: new Date() },
      ]);
      requirementRepo.findOne.mockResolvedValue({ id: 'req-1', country: 'Egypt', serviceType: 'OVERFLIGHT', responsibility: 'OUR_ARRANGEMENT', requiredByZ: null });
      serviceOrderRepo.findOne.mockResolvedValue({ id: 'so-1', serviceCaseId: 'sc-1', submissionEmail: null, correlationToken: '149/sc-1' });
      requirementLegRepo.find.mockResolvedValue([{ legId: 'leg-1' }, { legId: 'leg-2' }]);
      legRepo.findOne.mockResolvedValueOnce(leg1);

      const result = await service.findAllWithUrgency();

      expect(result[0].legIds).toEqual(['leg-1', 'leg-2']);
      expect(result[0].legSummary).toEqual({ tripNo: '482421', icao: 'HECA', tail: 'N148B' });
    });
  });

  describe('update', () => {
    it('updates serviceType on the linked requirement', async () => {
      serviceCaseRepo.findOne.mockResolvedValue({ id: 'sc-1', requirementId: 'req-1', status: 'REQUESTED' });
      requirementRepo.findOne.mockResolvedValue({ id: 'req-1', country: 'Egypt', serviceType: 'OVERFLIGHT', responsibility: 'OUR_ARRANGEMENT', requiredByZ: null });
      serviceOrderRepo.findOne.mockResolvedValue({ id: 'so-1', serviceCaseId: 'sc-1', correlationToken: '149/sc-1' });
      serviceCaseRepo.save.mockImplementation(async (e) => e);
      requirementRepo.save.mockImplementation(async (e) => e);

      const result = await service.update('sc-1', { serviceType: 'LANDING' });

      expect(requirementRepo.save).toHaveBeenCalledWith(expect.objectContaining({ serviceType: 'LANDING' }));
      expect(result.serviceType).toBe('LANDING');
    });
  });

  describe('reconcileForLeg', () => {
    it('flips a CONFIRMED merged request when any covered leg falls outside the validity window', async () => {
      requirementLegRepo.find.mockResolvedValue([{ requirementId: 'req-1', legId: 'leg-1' }]);
      requirementRepo.findOne.mockResolvedValue({ id: 'req-1', requiredByZ: null });
      serviceCaseRepo.findOne.mockResolvedValue({
        id: 'sc-1', requirementId: 'req-1', status: 'CONFIRMED',
        validFrom: new Date('2026-09-10T00:00:00.000Z'), validTo: new Date('2026-09-20T00:00:00.000Z'),
      });

      await service.reconcileForLeg('leg-1', new Date('2026-09-25T00:00:00.000Z'));

      expect(serviceCaseRepo.save).toHaveBeenCalledWith(expect.objectContaining({ id: 'sc-1', status: 'RECONFIRM_REQUIRED' }));
    });
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd backend && npx jest test/permits.service.spec.ts`
Expected: FAIL — `PermitsService` still has the B1 (single-leg) implementation.

- [ ] **Step 4: Rewrite PermitsService**

Replace `backend/src/permits/permits.service.ts`:
```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Requirement, ServiceType } from '../service-cases/requirement.entity';
import { RequirementLeg } from '../service-cases/requirement-leg.entity';
import { ServiceCase } from '../service-cases/service-case.entity';
import { ServiceOrder } from '../service-cases/service-order.entity';
import { Comm } from './comm.entity';
import { Leg } from '../legs/leg.entity';
import { CountryRequirement } from '../country-requirements/country-requirement.entity';
import { FormTemplate } from '../form-templates/form-template.entity';
import { renderTemplate } from '../form-templates/template-renderer';
import { computeRequiredByZ, computeUrgency } from './permit-deadline';
import { evaluateReconfirm } from './reconfirm';
import { MailService } from '../mail/mail.service';
import { UpdatePermitRequestDto } from './dto/update-permit-request.dto';

const PRE_CONFIRMATION_STATUSES = ['REQUESTED', 'CHASING', 'RECONFIRM_REQUIRED'];

@Injectable()
export class PermitsService {
  constructor(
    @InjectRepository(Requirement) private readonly requirementRepo: Repository<Requirement>,
    @InjectRepository(RequirementLeg) private readonly requirementLegRepo: Repository<RequirementLeg>,
    @InjectRepository(ServiceCase) private readonly serviceCaseRepo: Repository<ServiceCase>,
    @InjectRepository(ServiceOrder) private readonly serviceOrderRepo: Repository<ServiceOrder>,
    @InjectRepository(Comm) private readonly commRepo: Repository<Comm>,
    @InjectRepository(Leg) private readonly legRepo: Repository<Leg>,
    @InjectRepository(CountryRequirement) private readonly countryRequirementRepo: Repository<CountryRequirement>,
    @InjectRepository(FormTemplate) private readonly formTemplateRepo: Repository<FormTemplate>,
    private readonly mailService: MailService,
  ) {}

  private async legIdsFor(requirementId: string): Promise<string[]> {
    const rows = await this.requirementLegRepo.find({ where: { requirementId } });
    return rows.map((r) => r.legId);
  }

  private async toFlat(requirement: Requirement, serviceCase: ServiceCase, serviceOrder: ServiceOrder) {
    return {
      id: serviceCase.id,
      legIds: await this.legIdsFor(requirement.id),
      country: requirement.country,
      serviceType: requirement.serviceType,
      status: serviceCase.status,
      requiredByZ: requirement.requiredByZ,
      validFrom: serviceCase.validFrom,
      validTo: serviceCase.validTo,
      clearanceNumber: serviceCase.clearanceNumber,
      correlationToken: serviceOrder.correlationToken,
      submissionEmail: serviceOrder.submissionEmail,
      responsibility: requirement.responsibility,
      createdAt: serviceCase.createdAt,
      updatedAt: serviceCase.updatedAt,
    };
  }

  async findCompatible(legId: string, country: string, serviceType: ServiceType) {
    const leg = await this.legRepo.findOne({ where: { id: legId } });
    if (!leg) throw new NotFoundException(`Leg ${legId} not found`);

    const tripLegs = await this.legRepo.find({ where: { tripId: leg.tripId } });
    const tripLegIds = tripLegs.map((l) => l.id);
    if (tripLegIds.length === 0) return null;

    const candidateLegRows = await this.requirementLegRepo.find({ where: { legId: In(tripLegIds) } });
    const candidateRequirementIds = Array.from(new Set(candidateLegRows.map((r) => r.requirementId)));

    for (const requirementId of candidateRequirementIds) {
      const requirement = await this.requirementRepo.findOne({ where: { id: requirementId } });
      if (!requirement) continue;
      if (requirement.country !== country || requirement.serviceType !== serviceType) continue;

      const serviceCase = await this.serviceCaseRepo.findOne({ where: { requirementId } });
      if (!serviceCase || !PRE_CONFIRMATION_STATUSES.includes(serviceCase.status)) continue;

      const legIds = await this.legIdsFor(requirementId);
      if (legIds.includes(legId)) continue;

      const serviceOrder = await this.serviceOrderRepo.findOne({ where: { serviceCaseId: serviceCase.id } });
      return {
        requirementId,
        legIds,
        status: serviceCase.status,
        correlationToken: serviceOrder?.correlationToken ?? null,
      };
    }

    return null;
  }

  async create(legId: string, country: string, serviceType: ServiceType) {
    const leg = await this.legRepo.findOne({ where: { id: legId } });
    if (!leg) throw new NotFoundException(`Leg ${legId} not found`);

    const countryRequirement = await this.countryRequirementRepo.findOne({ where: { country, serviceType } });
    if (!countryRequirement) throw new NotFoundException(`No CountryRequirement for ${country}/${serviceType}`);

    const requiredByZ = leg.arrDate
      ? new Date(computeRequiredByZ(leg.arrDate.toISOString(), countryRequirement))
      : null;

    const requirement = await this.requirementRepo.save(
      this.requirementRepo.create({
        country,
        serviceCategory: 'PERMIT',
        serviceType,
        responsibility: 'OUR_ARRANGEMENT',
        requiredByZ,
      }),
    );

    await this.requirementLegRepo.save(this.requirementLegRepo.create({ requirementId: requirement.id, legId }));

    const serviceCase = await this.serviceCaseRepo.save(
      this.serviceCaseRepo.create({ requirementId: requirement.id, status: 'REQUESTED' }),
    );

    const correlationToken = `${leg.legId}/${serviceCase.id}`;

    const serviceOrder = await this.serviceOrderRepo.save(
      this.serviceOrderRepo.create({
        serviceCaseId: serviceCase.id,
        submissionEmail: countryRequirement.submissionEmail,
        correlationToken,
      }),
    );

    const template = await this.formTemplateRepo.findOne({ where: { country, serviceType } });
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
          serviceCaseId: serviceCase.id,
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

    return this.toFlat(requirement, serviceCase, serviceOrder);
  }

  async merge(legId: string, requirementId: string) {
    const leg = await this.legRepo.findOne({ where: { id: legId } });
    if (!leg) throw new NotFoundException(`Leg ${legId} not found`);

    const requirement = await this.requirementRepo.findOne({ where: { id: requirementId } });
    if (!requirement) throw new NotFoundException(`Requirement ${requirementId} not found`);

    const serviceCase = await this.serviceCaseRepo.findOne({ where: { requirementId } });
    if (!serviceCase) throw new NotFoundException(`ServiceCase for ${requirementId} not found`);
    if (!PRE_CONFIRMATION_STATUSES.includes(serviceCase.status)) {
      throw new NotFoundException(`Requirement ${requirementId} is no longer open for merging`);
    }

    const existingLegIds = await this.legIdsFor(requirementId);
    if (!existingLegIds.includes(legId)) {
      await this.requirementLegRepo.save(this.requirementLegRepo.create({ requirementId, legId }));
    }

    const serviceOrder = await this.serviceOrderRepo.findOne({ where: { serviceCaseId: serviceCase.id } });
    if (!serviceOrder) throw new NotFoundException(`ServiceOrder for ${requirementId} not found`);

    return this.toFlat(requirement, serviceCase, serviceOrder);
  }

  async findByLeg(legId: string) {
    const legRows = await this.requirementLegRepo.find({ where: { legId } });
    const results = [];
    for (const legRow of legRows) {
      const requirement = await this.requirementRepo.findOne({ where: { id: legRow.requirementId } });
      if (!requirement) continue;
      const serviceCase = await this.serviceCaseRepo.findOne({ where: { requirementId: requirement.id } });
      if (!serviceCase) continue;
      const serviceOrder = await this.serviceOrderRepo.findOne({ where: { serviceCaseId: serviceCase.id } });
      if (!serviceOrder) continue;
      results.push(await this.toFlat(requirement, serviceCase, serviceOrder));
    }
    return results;
  }

  async update(id: string, dto: UpdatePermitRequestDto) {
    const serviceCase = await this.serviceCaseRepo.findOne({ where: { id } });
    if (!serviceCase) throw new NotFoundException(`PermitRequest ${id} not found`);

    if (dto.status) serviceCase.status = dto.status;
    if (dto.clearanceNumber) serviceCase.clearanceNumber = dto.clearanceNumber;
    if (dto.validFrom) serviceCase.validFrom = new Date(dto.validFrom);
    if (dto.validTo) serviceCase.validTo = new Date(dto.validTo);
    await this.serviceCaseRepo.save(serviceCase);

    const requirement = await this.requirementRepo.findOne({ where: { id: serviceCase.requirementId } });
    if (!requirement) throw new NotFoundException(`Requirement for ${id} not found`);

    if (dto.responsibility) requirement.responsibility = dto.responsibility;
    if (dto.serviceType) requirement.serviceType = dto.serviceType;
    if (dto.responsibility || dto.serviceType) await this.requirementRepo.save(requirement);

    const serviceOrder = await this.serviceOrderRepo.findOne({ where: { serviceCaseId: id } });
    if (!serviceOrder) throw new NotFoundException(`ServiceOrder for ${id} not found`);

    return this.toFlat(requirement, serviceCase, serviceOrder);
  }

  async findAllWithUrgency() {
    const serviceCases = await this.serviceCaseRepo.find();
    const now = new Date().toISOString();

    const withUrgency = [];
    for (const serviceCase of serviceCases) {
      const requirement = await this.requirementRepo.findOne({ where: { id: serviceCase.requirementId } });
      if (!requirement) continue;
      const serviceOrder = await this.serviceOrderRepo.findOne({ where: { serviceCaseId: serviceCase.id } });
      if (!serviceOrder) continue;
      const legIds = await this.legIdsFor(requirement.id);
      const anchorLeg = legIds.length ? await this.legRepo.findOne({ where: { id: legIds[0] } }) : null;
      const urgency = requirement.requiredByZ ? computeUrgency(requirement.requiredByZ.toISOString(), now) : 'OK';
      withUrgency.push({
        ...(await this.toFlat(requirement, serviceCase, serviceOrder)),
        urgency,
        legSummary: anchorLeg ? { tripNo: anchorLeg.tripNo, icao: anchorLeg.icao, tail: anchorLeg.tail } : null,
      });
    }
    return withUrgency;
  }

  private async pickArrDateForReconfirm(
    requirementId: string,
    changedLegId: string,
    changedLegArrDateZ: Date | null,
    validFrom: Date | null,
    validTo: Date | null,
  ): Promise<Date | null> {
    const legIds = await this.legIdsFor(requirementId);
    const arrDates: Date[] = [];

    for (const legId of legIds) {
      const arrDate = legId === changedLegId
        ? changedLegArrDateZ
        : (await this.legRepo.findOne({ where: { id: legId } }))?.arrDate ?? null;
      if (arrDate) arrDates.push(arrDate);
    }
    if (arrDates.length === 0) return null;

    const outside = arrDates.find((d) => validFrom && validTo && (d < validFrom || d > validTo));
    if (outside) return outside;

    return arrDates.sort((a, b) => a.getTime() - b.getTime())[0];
  }

  async reconcileForLeg(legId: string, currentArrDateZ: Date | null): Promise<void> {
    const legRows = await this.requirementLegRepo.find({ where: { legId } });

    for (const legRow of legRows) {
      const requirement = await this.requirementRepo.findOne({ where: { id: legRow.requirementId } });
      if (!requirement) continue;
      const serviceCase = await this.serviceCaseRepo.findOne({ where: { requirementId: requirement.id } });
      if (!serviceCase) continue;

      const arrDateToCheck = await this.pickArrDateForReconfirm(
        requirement.id, legId, currentArrDateZ, serviceCase.validFrom, serviceCase.validTo,
      );
      const nextStatus = evaluateReconfirm(
        { status: serviceCase.status, requiredByZ: requirement.requiredByZ, validFrom: serviceCase.validFrom, validTo: serviceCase.validTo },
        arrDateToCheck,
        new Date(),
      );
      if (nextStatus !== serviceCase.status) {
        serviceCase.status = nextStatus;
        await this.serviceCaseRepo.save(serviceCase);
      }
    }
  }

  async addManualComm(
    serviceCaseId: string,
    input: { fromAddress: string; subject: string; body: string },
  ): Promise<Comm> {
    const serviceCase = await this.serviceCaseRepo.findOne({ where: { id: serviceCaseId } });
    if (!serviceCase) throw new NotFoundException(`ServiceCase ${serviceCaseId} not found`);

    const requirement = await this.requirementRepo.findOne({ where: { id: serviceCase.requirementId } });
    if (!requirement) throw new NotFoundException(`Requirement for ${serviceCaseId} not found`);

    const legIds = await this.legIdsFor(requirement.id);
    const serviceOrder = await this.serviceOrderRepo.findOne({ where: { serviceCaseId } });

    return this.commRepo.save(
      this.commRepo.create({
        direction: 'INBOUND',
        legId: legIds[0] ?? null,
        serviceCaseId,
        correlationToken: serviceOrder?.correlationToken ?? null,
        fromAddress: input.fromAddress,
        toAddress: process.env.SMTP_FROM ?? '',
        subject: input.subject,
        body: input.body,
        kind: 'REQUEST',
        sentAt: new Date(),
      }),
    );
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd backend && npx jest test/permits.service.spec.ts`
Expected: PASS

- [ ] **Step 6: Register RequirementLeg in PermitsModule**

Modify `backend/src/permits/permits.module.ts`:
```typescript
import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Requirement } from '../service-cases/requirement.entity';
import { RequirementLeg } from '../service-cases/requirement-leg.entity';
import { ServiceCase } from '../service-cases/service-case.entity';
import { ServiceOrder } from '../service-cases/service-order.entity';
import { Comm } from './comm.entity';
import { Leg } from '../legs/leg.entity';
import { CountryRequirement } from '../country-requirements/country-requirement.entity';
import { FormTemplate } from '../form-templates/form-template.entity';
import { PermitsService } from './permits.service';
import { PermitsController } from './permits.controller';
import { ReconfirmSweepService } from './reconfirm-sweep.service';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Requirement, RequirementLeg, ServiceCase, ServiceOrder, Comm, Leg, CountryRequirement, FormTemplate]),
    forwardRef(() => MailModule),
  ],
  providers: [PermitsService, ReconfirmSweepService],
  controllers: [PermitsController],
  exports: [PermitsService],
})
export class PermitsModule {}
```

- [ ] **Step 7: Commit**

```bash
git add backend/src/permits/permits.service.ts backend/src/permits/permits.module.ts backend/src/permits/dto/create-permit-request.dto.ts backend/src/permits/dto/update-permit-request.dto.ts backend/src/permits/dto/merge-permit-request.dto.ts backend/test/permits.service.spec.ts
git commit -m "Add compatibility check and merge to PermitsService; legId -> legIds"
```

---

### Task 3: ReconfirmSweepService — multi-leg validity checking

**Files:**
- Modify: `backend/src/permits/reconfirm-sweep.service.ts`
- Test: `backend/test/reconfirm-sweep.service.spec.ts`

**Interfaces:**
- Consumes: `RequirementLeg` (Task 1).

- [ ] **Step 1: Add multi-leg test cases**

Add to `backend/test/reconfirm-sweep.service.spec.ts` (keep the existing 3 tests; add these, and update `beforeEach` to also provide a `requirementLegRepo` mock — see full replacement below):

Replace `backend/test/reconfirm-sweep.service.spec.ts`:
```typescript
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ReconfirmSweepService } from '../src/permits/reconfirm-sweep.service';
import { ServiceCase } from '../src/service-cases/service-case.entity';
import { Requirement } from '../src/service-cases/requirement.entity';
import { RequirementLeg } from '../src/service-cases/requirement-leg.entity';
import { Leg } from '../src/legs/leg.entity';

describe('ReconfirmSweepService', () => {
  let service: ReconfirmSweepService;
  let serviceCaseRepo: { find: jest.Mock; save: jest.Mock };
  let requirementRepo: { findOne: jest.Mock };
  let requirementLegRepo: { find: jest.Mock };
  let legRepo: { findOne: jest.Mock };

  beforeEach(async () => {
    serviceCaseRepo = { find: jest.fn(), save: jest.fn(async (entity) => entity) };
    requirementRepo = { findOne: jest.fn() };
    requirementLegRepo = { find: jest.fn().mockResolvedValue([]) };
    legRepo = { findOne: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ReconfirmSweepService,
        { provide: getRepositoryToken(ServiceCase), useValue: serviceCaseRepo },
        { provide: getRepositoryToken(Requirement), useValue: requirementRepo },
        { provide: getRepositoryToken(RequirementLeg), useValue: requirementLegRepo },
        { provide: getRepositoryToken(Leg), useValue: legRepo },
      ],
    }).compile();
    service = moduleRef.get(ReconfirmSweepService);
  });

  it('flips an unconfirmed request whose RequiredByZ has passed and returns the flip count', async () => {
    serviceCaseRepo.find.mockResolvedValue([
      { id: 'sc-1', requirementId: 'req-1', status: 'REQUESTED', validFrom: null, validTo: null },
    ]);
    requirementRepo.findOne.mockResolvedValue({ id: 'req-1', requiredByZ: new Date('2020-01-01T00:00:00.000Z') });
    requirementLegRepo.find.mockResolvedValue([{ legId: 'leg-1' }]);
    legRepo.findOne.mockResolvedValue({ id: 'leg-1', arrDate: new Date('2020-01-05T00:00:00.000Z') });

    const flipped = await service.sweep();

    expect(serviceCaseRepo.save).toHaveBeenCalledWith(expect.objectContaining({ id: 'sc-1', status: 'RECONFIRM_REQUIRED' }));
    expect(flipped).toBe(1);
  });

  it('skips CANCELLED requests entirely and does not query their requirement or leg', async () => {
    serviceCaseRepo.find.mockResolvedValue([
      { id: 'sc-1', requirementId: 'req-1', status: 'CANCELLED', validFrom: null, validTo: null },
    ]);

    const flipped = await service.sweep();

    expect(requirementRepo.findOne).not.toHaveBeenCalled();
    expect(legRepo.findOne).not.toHaveBeenCalled();
    expect(serviceCaseRepo.save).not.toHaveBeenCalled();
    expect(flipped).toBe(0);
  });

  it('only queries service cases not already RECONFIRM_REQUIRED or CANCELLED', async () => {
    serviceCaseRepo.find.mockResolvedValue([]);

    await service.sweep();

    expect(serviceCaseRepo.find).toHaveBeenCalledWith({
      where: expect.arrayContaining([expect.objectContaining({ status: expect.anything() })]),
    });
  });

  it('flips a CONFIRMED merged request when only one of its two legs falls outside the validity window', async () => {
    serviceCaseRepo.find.mockResolvedValue([
      {
        id: 'sc-1', requirementId: 'req-1', status: 'CONFIRMED',
        validFrom: new Date('2026-09-10T00:00:00.000Z'), validTo: new Date('2026-09-20T00:00:00.000Z'),
      },
    ]);
    requirementRepo.findOne.mockResolvedValue({ id: 'req-1', requiredByZ: null });
    requirementLegRepo.find.mockResolvedValue([{ legId: 'leg-1' }, { legId: 'leg-2' }]);
    legRepo.findOne
      .mockResolvedValueOnce({ id: 'leg-1', arrDate: new Date('2026-09-12T00:00:00.000Z') }) // in window
      .mockResolvedValueOnce({ id: 'leg-2', arrDate: new Date('2026-09-25T00:00:00.000Z') }); // outside window

    const flipped = await service.sweep();

    expect(serviceCaseRepo.save).toHaveBeenCalledWith(expect.objectContaining({ id: 'sc-1', status: 'RECONFIRM_REQUIRED' }));
    expect(flipped).toBe(1);
  });

  it('leaves a CONFIRMED merged request alone when every covered leg is still within the validity window', async () => {
    serviceCaseRepo.find.mockResolvedValue([
      {
        id: 'sc-1', requirementId: 'req-1', status: 'CONFIRMED',
        validFrom: new Date('2026-09-10T00:00:00.000Z'), validTo: new Date('2026-09-20T00:00:00.000Z'),
      },
    ]);
    requirementRepo.findOne.mockResolvedValue({ id: 'req-1', requiredByZ: null });
    requirementLegRepo.find.mockResolvedValue([{ legId: 'leg-1' }, { legId: 'leg-2' }]);
    legRepo.findOne
      .mockResolvedValueOnce({ id: 'leg-1', arrDate: new Date('2026-09-12T00:00:00.000Z') })
      .mockResolvedValueOnce({ id: 'leg-2', arrDate: new Date('2026-09-15T00:00:00.000Z') });
    serviceCaseRepo.save.mockClear();

    await service.sweep();

    expect(serviceCaseRepo.save).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `cd backend && npx jest test/reconfirm-sweep.service.spec.ts`
Expected: FAIL — `ReconfirmSweepService`'s constructor doesn't yet accept a `RequirementLeg` repo, and `sweep()` doesn't check multiple legs.

- [ ] **Step 3: Rewrite ReconfirmSweepService**

Replace `backend/src/permits/reconfirm-sweep.service.ts`:
```typescript
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, In, Repository } from 'typeorm';
import { Interval } from '@nestjs/schedule';
import { ServiceCase } from '../service-cases/service-case.entity';
import { Requirement } from '../service-cases/requirement.entity';
import { RequirementLeg } from '../service-cases/requirement-leg.entity';
import { Leg } from '../legs/leg.entity';
import { evaluateReconfirm } from './reconfirm';

const SWEEP_INTERVAL_MS = 15 * 60 * 1000;

@Injectable()
export class ReconfirmSweepService {
  private readonly logger = new Logger(ReconfirmSweepService.name);

  constructor(
    @InjectRepository(ServiceCase) private readonly serviceCaseRepo: Repository<ServiceCase>,
    @InjectRepository(Requirement) private readonly requirementRepo: Repository<Requirement>,
    @InjectRepository(RequirementLeg) private readonly requirementLegRepo: Repository<RequirementLeg>,
    @InjectRepository(Leg) private readonly legRepo: Repository<Leg>,
  ) {}

  @Interval(SWEEP_INTERVAL_MS)
  async scheduledSweep() {
    const flipped = await this.sweep();
    if (flipped > 0) this.logger.log(`Reconfirm sweep flipped ${flipped} service case(s).`);
  }

  private pickArrDate(arrDates: Date[], validFrom: Date | null, validTo: Date | null): Date | null {
    if (arrDates.length === 0) return null;
    const outside = arrDates.find((d) => validFrom && validTo && (d < validFrom || d > validTo));
    if (outside) return outside;
    return arrDates.sort((a, b) => a.getTime() - b.getTime())[0];
  }

  async sweep(): Promise<number> {
    const serviceCases = await this.serviceCaseRepo.find({
      where: [{ status: Not(In(['CANCELLED', 'RECONFIRM_REQUIRED'])) }],
    });

    const now = new Date();
    let flipped = 0;

    for (const serviceCase of serviceCases) {
      if (serviceCase.status === 'CANCELLED') continue;

      const requirement = await this.requirementRepo.findOne({ where: { id: serviceCase.requirementId } });
      const legRows = requirement
        ? await this.requirementLegRepo.find({ where: { requirementId: requirement.id } })
        : [];

      const arrDates: Date[] = [];
      for (const row of legRows) {
        const leg = await this.legRepo.findOne({ where: { id: row.legId } });
        if (leg?.arrDate) arrDates.push(leg.arrDate);
      }
      const arrDateToCheck = this.pickArrDate(arrDates, serviceCase.validFrom, serviceCase.validTo);

      const nextStatus = evaluateReconfirm(
        {
          status: serviceCase.status,
          requiredByZ: requirement?.requiredByZ ?? null,
          validFrom: serviceCase.validFrom,
          validTo: serviceCase.validTo,
        },
        arrDateToCheck,
        now,
      );
      if (nextStatus !== serviceCase.status) {
        serviceCase.status = nextStatus;
        await this.serviceCaseRepo.save(serviceCase);
        flipped++;
      }
    }

    return flipped;
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && npx jest test/reconfirm-sweep.service.spec.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/permits/reconfirm-sweep.service.ts backend/test/reconfirm-sweep.service.spec.ts
git commit -m "Make ReconfirmSweepService check every leg of a merged Requirement"
```

---

### Task 4: Controller routes, e2e tests, and DI graph fixes

**Files:**
- Modify: `backend/src/permits/permits.controller.ts`, `backend/test/permits.e2e-spec.ts`, `backend/test/legs.e2e-spec.ts`, `backend/test/notifications.e2e-spec.ts`

**Interfaces:**
- Consumes: `PermitsService.findCompatible/create/merge` (Task 2), `MergePermitRequestDto` (Task 2).

- [ ] **Step 1: Add the two new routes and thread serviceType through create**

Modify `backend/src/permits/permits.controller.ts`:
```typescript
import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermitsService } from './permits.service';
import { CreatePermitRequestDto } from './dto/create-permit-request.dto';
import { UpdatePermitRequestDto } from './dto/update-permit-request.dto';
import { MergePermitRequestDto } from './dto/merge-permit-request.dto';
import { CreateCommDto } from './dto/create-comm.dto';
import type { ServiceType } from '../service-cases/requirement.entity';

@Controller()
@UseGuards(JwtAuthGuard)
export class PermitsController {
  constructor(private readonly permitsService: PermitsService) {}

  @Post('legs/:legId/permit-requests')
  create(@Param('legId') legId: string, @Body() dto: CreatePermitRequestDto) {
    return this.permitsService.create(legId, dto.country, dto.serviceType);
  }

  @Get('legs/:legId/permit-requests')
  findByLeg(@Param('legId') legId: string) {
    return this.permitsService.findByLeg(legId);
  }

  @Get('legs/:legId/permit-requests/compatible')
  findCompatible(
    @Param('legId') legId: string,
    @Query('country') country: string,
    @Query('serviceType') serviceType: ServiceType,
  ) {
    return this.permitsService.findCompatible(legId, country, serviceType);
  }

  @Post('legs/:legId/permit-requests/merge')
  merge(@Param('legId') legId: string, @Body() dto: MergePermitRequestDto) {
    return this.permitsService.merge(legId, dto.requirementId);
  }

  @Get('permit-requests')
  findAllWithUrgency() {
    return this.permitsService.findAllWithUrgency();
  }

  @Patch('permit-requests/:id')
  update(@Param('id') id: string, @Body() dto: UpdatePermitRequestDto) {
    return this.permitsService.update(id, dto);
  }

  @Post('permit-requests/:id/comms')
  addManualComm(@Param('id') id: string, @Body() dto: CreateCommDto) {
    return this.permitsService.addManualComm(id, dto);
  }
}
```

- [ ] **Step 2: Write the failing e2e tests (full rewrite)**

Replace `backend/test/permits.e2e-spec.ts`:
```typescript
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PermitsModule } from '../src/permits/permits.module';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { Requirement } from '../src/service-cases/requirement.entity';
import { RequirementLeg } from '../src/service-cases/requirement-leg.entity';
import { ServiceCase } from '../src/service-cases/service-case.entity';
import { ServiceOrder } from '../src/service-cases/service-order.entity';
import { Comm } from '../src/permits/comm.entity';
import { Leg } from '../src/legs/leg.entity';
import { CountryRequirement } from '../src/country-requirements/country-requirement.entity';
import { FormTemplate } from '../src/form-templates/form-template.entity';
import { MailService } from '../src/mail/mail.service';

describe('Permits (e2e)', () => {
  let app: INestApplication;
  let requirementRepo: { create: jest.Mock; save: jest.Mock; find: jest.Mock; findOne: jest.Mock };
  let requirementLegRepo: { create: jest.Mock; save: jest.Mock; find: jest.Mock };
  let serviceCaseRepo: { create: jest.Mock; save: jest.Mock; find: jest.Mock; findOne: jest.Mock };
  let serviceOrderRepo: { create: jest.Mock; save: jest.Mock; findOne: jest.Mock };

  beforeAll(async () => {
    requirementRepo = {
      create: jest.fn((dto) => dto),
      save: jest.fn(async (entity) => ({ id: 'req-1', ...entity })),
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue({ id: 'req-1', country: 'Egypt', serviceType: 'OVERFLIGHT', responsibility: 'OUR_ARRANGEMENT', requiredByZ: null }),
    };
    requirementLegRepo = {
      create: jest.fn((dto) => dto),
      save: jest.fn(async (entity) => ({ id: 'rl-1', ...entity })),
      find: jest.fn().mockResolvedValue([{ requirementId: 'req-1', legId: 'leg-1' }]),
    };
    serviceCaseRepo = {
      create: jest.fn((dto) => dto),
      save: jest.fn(async (entity) => ({ id: 'sc-1', ...entity })),
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
    };
    serviceOrderRepo = {
      create: jest.fn((dto) => dto),
      save: jest.fn(async (entity) => ({ id: 'so-1', ...entity })),
      findOne: jest.fn().mockResolvedValue({ id: 'so-1', serviceCaseId: 'sc-1', submissionEmail: 'permits.eg@example.com', correlationToken: '149/sc-1' }),
    };
    const legRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'leg-1', legId: 149, tripId: 'trip-1', tripNo: '482421', icao: 'HECA', tail: 'N148B',
        arrDate: new Date('2026-09-16T16:20:00.000Z'),
      }),
      find: jest.fn().mockResolvedValue([{ id: 'leg-1', tripId: 'trip-1' }]),
    };
    const countryRequirementRepo = {
      findOne: jest.fn().mockResolvedValue({ country: 'Egypt', serviceType: 'OVERFLIGHT', leadTimeHours: 96, workingDaysOnly: true, submissionEmail: 'permits.eg@example.com' }),
    };
    const formTemplateRepo = { findOne: jest.fn().mockResolvedValue(null) };
    const commRepo = { create: jest.fn((dto) => dto), save: jest.fn(async (entity) => ({ id: 'comm-1', ...entity })) };

    const moduleRef = await Test.createTestingModule({
      imports: [PermitsModule],
    })
      .overrideProvider(getRepositoryToken(Requirement))
      .useValue(requirementRepo)
      .overrideProvider(getRepositoryToken(RequirementLeg))
      .useValue(requirementLegRepo)
      .overrideProvider(getRepositoryToken(ServiceCase))
      .useValue(serviceCaseRepo)
      .overrideProvider(getRepositoryToken(ServiceOrder))
      .useValue(serviceOrderRepo)
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

  it('POST /legs/:legId/permit-requests requires serviceType and returns 201', async () => {
    const response = await request(app.getHttpServer())
      .post('/legs/leg-1/permit-requests')
      .send({ country: 'Egypt', serviceType: 'OVERFLIGHT' });

    expect(response.status).toBe(201);
    expect(response.body).toEqual(expect.objectContaining({ country: 'Egypt', serviceType: 'OVERFLIGHT', legIds: ['leg-1'] }));
  });

  it('POST /legs/:legId/permit-requests rejects an invalid serviceType', async () => {
    const response = await request(app.getHttpServer())
      .post('/legs/leg-1/permit-requests')
      .send({ country: 'Egypt', serviceType: 'BOGUS' });

    expect(response.status).toBe(400);
  });

  it('GET /legs/:legId/permit-requests/compatible returns null when nothing matches', async () => {
    requirementLegRepo.find.mockResolvedValueOnce([]);

    const response = await request(app.getHttpServer())
      .get('/legs/leg-1/permit-requests/compatible?country=Egypt&serviceType=OVERFLIGHT');

    expect(response.status).toBe(200);
    expect(response.body).toBeNull();
  });

  it('POST /legs/:legId/permit-requests/merge adds the leg and returns the updated request', async () => {
    serviceCaseRepo.findOne.mockResolvedValue({ id: 'sc-1', requirementId: 'req-1', status: 'REQUESTED' });
    requirementLegRepo.find.mockResolvedValue([{ legId: 'leg-2' }]);

    const response = await request(app.getHttpServer())
      .post('/legs/leg-1/permit-requests/merge')
      .send({ requirementId: 'req-1' });

    expect(response.status).toBe(201);
    expect(requirementLegRepo.save).toHaveBeenCalledWith({ requirementId: 'req-1', legId: 'leg-1' });
  });

  it('PATCH /permit-requests/:id updates status', async () => {
    serviceCaseRepo.findOne.mockResolvedValue({ id: 'sc-1', requirementId: 'req-1', status: 'REQUESTED' });

    const response = await request(app.getHttpServer())
      .patch('/permit-requests/sc-1')
      .send({ status: 'CONFIRMED', clearanceNumber: 'EG-4471' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(expect.objectContaining({ status: 'CONFIRMED' }));
  });

  it('GET /permit-requests returns all requests with urgency and leg summary', async () => {
    serviceCaseRepo.find.mockResolvedValue([
      { id: 'sc-1', requirementId: 'req-1', status: 'REQUESTED', validFrom: null, validTo: null, clearanceNumber: null, createdAt: new Date(), updatedAt: new Date() },
    ]);

    const response = await request(app.getHttpServer()).get('/permit-requests');

    expect(response.status).toBe(200);
    expect(response.body[0]).toEqual(expect.objectContaining({ id: 'sc-1', urgency: 'OK' }));
  });

  it('POST /permit-requests/:id/comms files a manual inbound reply', async () => {
    serviceCaseRepo.findOne.mockResolvedValue({ id: 'sc-1', requirementId: 'req-1' });

    const response = await request(app.getHttpServer())
      .post('/permit-requests/sc-1/comms')
      .send({ fromAddress: 'permits.eg@example.com', subject: 'RE: Permit', body: 'Confirmed.' });

    expect(response.status).toBe(201);
    expect(response.body).toEqual(expect.objectContaining({ direction: 'INBOUND' }));
  });
});
```

- [ ] **Step 3: Run the e2e tests to verify they pass**

Run: `cd backend && npx jest test/permits.e2e-spec.ts --config test/jest-e2e.json`
Expected: PASS (7 tests)

- [ ] **Step 4: Add the RequirementLeg override to the other two e2e DI graphs**

Modify `backend/test/legs.e2e-spec.ts` — add the import and a 4th override:
```typescript
import { Requirement } from '../src/service-cases/requirement.entity';
import { RequirementLeg } from '../src/service-cases/requirement-leg.entity';
import { ServiceCase } from '../src/service-cases/service-case.entity';
import { ServiceOrder } from '../src/service-cases/service-order.entity';
```
and:
```typescript
      .overrideProvider(getRepositoryToken(Requirement))
      .useValue({})
      .overrideProvider(getRepositoryToken(RequirementLeg))
      .useValue({})
      .overrideProvider(getRepositoryToken(ServiceCase))
      .useValue({})
      .overrideProvider(getRepositoryToken(ServiceOrder))
      .useValue({})
```

Modify `backend/test/notifications.e2e-spec.ts` with the identical import and override addition.

- [ ] **Step 5: Run the full e2e suite**

Run: `cd backend && npx jest --config test/jest-e2e.json`
Expected: PASS (all suites)

- [ ] **Step 6: Run the full backend unit suite and build**

Run:
```bash
cd backend
npx jest
npm run build
```
Expected: all PASS, build succeeds.

- [ ] **Step 7: Commit**

```bash
git add backend/src/permits/permits.controller.ts backend/test/permits.e2e-spec.ts backend/test/legs.e2e-spec.ts backend/test/notifications.e2e-spec.ts
git commit -m "Add compatible-check/merge routes; fix e2e DI graphs for RequirementLeg"
```

---

### Task 5: Frontend — serviceType selection, merge confirmation, legIds

**Files:**
- Modify: `frontend/src/lib/api-client.ts`, `frontend/src/app/legs/[id]/permit-requests.tsx`, `frontend/src/app/action-board/page.tsx`
- Test: `frontend/test/permit-composer.test.tsx`, `frontend/test/action-board.test.tsx`

**Interfaces:**
- Consumes: the new `/compatible` and `/merge` routes (Task 4).
- Produces: `PermitRequest.legIds`/`serviceType`, `CompatibleCandidate`, `checkCompatiblePermitRequest()`, `mergePermitRequest()`.

- [ ] **Step 1: Update api-client.ts's PermitRequest type and permit-request functions**

Modify `frontend/src/lib/api-client.ts`:
```typescript
export interface PermitRequest {
  id: string;
  legIds: string[];
  country: string;
  serviceType: 'OVERFLIGHT' | 'LANDING';
  status: 'NOT_STARTED' | 'REQUESTED' | 'CHASING' | 'CONFIRMED' | 'RECONFIRM_REQUIRED' | 'CANCELLED';
  requiredByZ: string | null;
  validFrom: string | null;
  validTo: string | null;
  clearanceNumber: string | null;
  responsibility: 'OUR_ARRANGEMENT' | 'CLIENT_ARRANGEMENT' | 'OPERATOR_ARRANGEMENT' | 'THIRD_PARTY_ARRANGEMENT' | 'NOT_REQUIRED' | 'WAIVED' | 'TBD';
}

export interface UpdatePermitRequestInput {
  status?: PermitRequest['status'];
  clearanceNumber?: string;
  validFrom?: string;
  validTo?: string;
  responsibility?: PermitRequest['responsibility'];
  serviceType?: PermitRequest['serviceType'];
}

export interface CompatibleCandidate {
  requirementId: string;
  legIds: string[];
  status: PermitRequest['status'];
  correlationToken: string | null;
}

export async function listPermitRequests(token: string, legId: string): Promise<PermitRequest[]> {
  const response = await fetch(`${API_URL}/legs/${legId}/permit-requests`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('Failed to load permit requests');
  return response.json();
}

export async function checkCompatiblePermitRequest(
  token: string,
  legId: string,
  country: string,
  serviceType: PermitRequest['serviceType'],
): Promise<CompatibleCandidate | null> {
  const response = await fetch(
    `${API_URL}/legs/${legId}/permit-requests/compatible?country=${encodeURIComponent(country)}&serviceType=${encodeURIComponent(serviceType)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok) throw new Error('Failed to check compatible permit requests');
  return response.json();
}

export async function createPermitRequest(
  token: string,
  legId: string,
  country: string,
  serviceType: PermitRequest['serviceType'],
): Promise<PermitRequest> {
  const response = await fetch(`${API_URL}/legs/${legId}/permit-requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ country, serviceType }),
  });
  if (!response.ok) throw new Error('Failed to create permit request');
  return response.json();
}

export async function mergePermitRequest(token: string, legId: string, requirementId: string): Promise<PermitRequest> {
  const response = await fetch(`${API_URL}/legs/${legId}/permit-requests/merge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ requirementId }),
  });
  if (!response.ok) throw new Error('Failed to merge permit request');
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

export interface PermitRequestWithUrgency extends PermitRequest {
  urgency: 'BREACH' | 'URGENT' | 'DUE' | 'OK';
  legSummary: { tripNo: string; icao: string; tail: string | null } | null;
}

export async function listAllPermitRequests(token: string): Promise<PermitRequestWithUrgency[]> {
  const response = await fetch(`${API_URL}/permit-requests`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('Failed to load permit requests');
  return response.json();
}
```

- [ ] **Step 2: Write the failing merge-flow test**

Read `frontend/test/permit-composer.test.tsx` first to confirm its current mock/fixture conventions (it was last rewritten in B1's Task 5), then replace every existing `legId: '1'` fixture field with `legIds: ['1']` and every fixture with `serviceType: 'OVERFLIGHT'` added, and add:
```typescript
  it('shows a merge-confirmation choice when a compatible request already exists, and merges on confirm', async () => {
    vi.mocked(apiClient.listPermitRequests).mockResolvedValue([]);
    vi.mocked(apiClient.checkCompatiblePermitRequest).mockResolvedValue({
      requirementId: 'req-1', legIds: ['2'], status: 'REQUESTED', correlationToken: '150/sc-1',
    });
    vi.mocked(apiClient.mergePermitRequest).mockResolvedValue({
      id: 'sc-1', legIds: ['2', '1'], country: 'Egypt', serviceType: 'OVERFLIGHT', status: 'REQUESTED',
      requiredByZ: null, validFrom: null, validTo: null, clearanceNumber: null, responsibility: 'OUR_ARRANGEMENT',
    });

    const user = userEvent.setup();
    render(<PermitRequests legId="1" country="Egypt" />);

    await user.click(await screen.findByRole('button', { name: /request permit/i }));
    await waitFor(() => expect(apiClient.checkCompatiblePermitRequest).toHaveBeenCalledWith('test-token', '1', 'Egypt', 'OVERFLIGHT'));

    await user.click(await screen.findByRole('button', { name: /merge into it/i }));

    await waitFor(() => expect(apiClient.mergePermitRequest).toHaveBeenCalledWith('test-token', '1', 'req-1'));
  });

  it('creates a separate request when no compatible request exists', async () => {
    vi.mocked(apiClient.listPermitRequests).mockResolvedValue([]);
    vi.mocked(apiClient.checkCompatiblePermitRequest).mockResolvedValue(null);
    vi.mocked(apiClient.createPermitRequest).mockResolvedValue({
      id: 'sc-1', legIds: ['1'], country: 'Egypt', serviceType: 'OVERFLIGHT', status: 'REQUESTED',
      requiredByZ: null, validFrom: null, validTo: null, clearanceNumber: null, responsibility: 'OUR_ARRANGEMENT',
    });

    const user = userEvent.setup();
    render(<PermitRequests legId="1" country="Egypt" />);

    await user.click(await screen.findByRole('button', { name: /request permit/i }));

    await waitFor(() => expect(apiClient.createPermitRequest).toHaveBeenCalledWith('test-token', '1', 'Egypt', 'OVERFLIGHT'));
  });
```
Also extend the `vi.mock('../src/lib/api-client', ...)` factory at the top of the file to include `checkCompatiblePermitRequest: vi.fn(), mergePermitRequest: vi.fn()`, and reset them in `beforeEach` alongside the existing mocks.

- [ ] **Step 3: Run the tests to verify the new ones fail**

Run: `cd frontend && npx vitest run test/permit-composer.test.tsx`
Expected: FAIL — no "Merge into it" button exists yet; `createPermitRequest`/`checkCompatiblePermitRequest` not called with the right args yet.

- [ ] **Step 4: Rewrite PermitRequests with the type select and merge-confirm UI**

Replace `frontend/src/app/legs/[id]/permit-requests.tsx`:
```tsx
'use client';

import { useEffect, useState } from 'react';
import {
  createPermitRequest,
  listPermitRequests,
  updatePermitRequest,
  checkCompatiblePermitRequest,
  mergePermitRequest,
  type PermitRequest,
  type CompatibleCandidate,
} from '@/lib/api-client';

const RESPONSIBILITIES: PermitRequest['responsibility'][] = [
  'OUR_ARRANGEMENT',
  'CLIENT_ARRANGEMENT',
  'OPERATOR_ARRANGEMENT',
  'THIRD_PARTY_ARRANGEMENT',
  'NOT_REQUIRED',
  'WAIVED',
  'TBD',
];

const SERVICE_TYPES: PermitRequest['serviceType'][] = ['OVERFLIGHT', 'LANDING'];

export default function PermitRequests({ legId, country }: { legId: string; country: string | null }) {
  const [requests, setRequests] = useState<PermitRequest[]>([]);
  const [clearanceDrafts, setClearanceDrafts] = useState<Record<string, string>>({});
  const [requesting, setRequesting] = useState(false);
  const [serviceType, setServiceType] = useState<PermitRequest['serviceType']>('OVERFLIGHT');
  const [candidate, setCandidate] = useState<CompatibleCandidate | null>(null);

  function refresh() {
    const token = localStorage.getItem('uaa_token');
    if (!token) return Promise.resolve();
    return listPermitRequests(token, legId)
      .then(setRequests)
      .catch(() => setRequests([]));
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
      const found = await checkCompatiblePermitRequest(token, legId, country, serviceType);
      if (found) {
        setCandidate(found);
      } else {
        await createPermitRequest(token, legId, country, serviceType);
        await refresh();
      }
    } finally {
      setRequesting(false);
    }
  }

  async function handleMergeConfirm() {
    const token = localStorage.getItem('uaa_token');
    if (!token || !candidate) return;
    await mergePermitRequest(token, legId, candidate.requirementId);
    setCandidate(null);
    await refresh();
  }

  async function handleCreateSeparate() {
    const token = localStorage.getItem('uaa_token');
    if (!token || !country) return;
    await createPermitRequest(token, legId, country, serviceType);
    setCandidate(null);
    await refresh();
  }

  async function handleConfirm(id: string) {
    const token = localStorage.getItem('uaa_token');
    if (!token) return;
    await updatePermitRequest(token, id, { status: 'CONFIRMED', clearanceNumber: clearanceDrafts[id] ?? '' });
    await refresh();
  }

  async function handleResponsibilityChange(id: string, responsibility: PermitRequest['responsibility']) {
    const token = localStorage.getItem('uaa_token');
    if (!token) return;
    await updatePermitRequest(token, id, { responsibility });
    await refresh();
  }

  return (
    <fieldset className="permits-section">
      <legend>Permits</legend>

      {country && !candidate && (
        <div className="permit-request-form">
          <label htmlFor="service-type-select" className="sr-only">
            Permit Type
          </label>
          <select
            id="service-type-select"
            value={serviceType}
            onChange={(e) => setServiceType(e.target.value as PermitRequest['serviceType'])}
          >
            {SERVICE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <button type="button" className="btn-primary" onClick={handleRequest} disabled={requesting}>
            {requesting ? 'Checking…' : `Request Permit — ${country}`}
          </button>
        </div>
      )}

      {candidate && (
        <div className="permit-merge-confirm">
          <p>
            A {serviceType} request for {country} already exists for this trip (covers leg
            {candidate.legIds.length > 1 ? 's' : ''} {candidate.legIds.join(', ')}).
          </p>
          <button type="button" className="btn-primary" onClick={handleMergeConfirm}>
            Merge into it
          </button>
          <button type="button" className="btn-link" onClick={handleCreateSeparate}>
            Create separate request
          </button>
        </div>
      )}

      <table className="legs-table permits-table">
        <thead>
          <tr>
            <th>Country</th>
            <th>Type</th>
            <th>Status</th>
            <th>Responsibility</th>
            <th>Legs</th>
            <th>Clearance No</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {requests.map((r) => (
            <tr key={r.id}>
              <td>{r.country}</td>
              <td>{r.serviceType}</td>
              <td>{r.status}</td>
              <td>
                <label htmlFor={`responsibility-${r.id}`} className="sr-only">
                  Responsibility
                </label>
                <select
                  id={`responsibility-${r.id}`}
                  value={r.responsibility}
                  onChange={(e) => handleResponsibilityChange(r.id, e.target.value as PermitRequest['responsibility'])}
                >
                  {RESPONSIBILITIES.map((value) => (
                    <option key={value} value={value}>
                      {value.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              </td>
              <td className="col-muted">{r.legIds.length > 1 ? `${r.legIds.length} legs` : '—'}</td>
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

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run test/permit-composer.test.tsx`
Expected: PASS

- [ ] **Step 6: Update action-board's leg link to use legIds[0]**

Modify `frontend/src/app/action-board/page.tsx`:
```typescript
                <td className="col-mono">
                  <a href={`/legs/${r.legIds[0]}`}>{r.legSummary?.tripNo ?? r.legIds[0]}</a>
                </td>
```
(replacing the line that reads `<a href={\`/legs/${r.legId}\`}>{r.legSummary?.tripNo ?? r.legId}</a>`)

Update `frontend/test/action-board.test.tsx`'s fixture(s) to use `legIds: [...]`/`serviceType` in place of `legId`, matching the new `PermitRequestWithUrgency` shape.

- [ ] **Step 7: Run the full frontend suite and the build**

Run:
```bash
cd frontend
npx vitest run
npm run build
```
Expected: all tests PASS, `next build` succeeds with full typecheck (this is what will catch any remaining fixture still using the old `legId: string` shape anywhere in the suite).

- [ ] **Step 8: Commit**

```bash
git add frontend/src/lib/api-client.ts frontend/src/app/legs/\[id\]/permit-requests.tsx frontend/src/app/action-board/page.tsx frontend/test/permit-composer.test.tsx frontend/test/action-board.test.tsx
git commit -m "Add permit-type selection and merge-confirmation UI; legId -> legIds"
```

---

### Task 6: End-to-end smoke check against the real seeded stack

**Files:** none (verification-only task)

- [ ] **Step 1: Bring up the full stack fresh and run every migration + seed script**

```bash
docker compose down -v
docker compose up --build -d
docker build --target build -t uaa-backend-seed ./backend
docker run --rm --network web-proxy -e DATABASE_URL="postgres://uaa:uaa@postgres:5432/uaa" \
  uaa-backend-seed sh -c "npx typeorm-ts-node-commonjs migration:run -d src/database/data-source.ts"
docker run --rm --network web-proxy -v "<repo>/Aviation/uaa:/data:ro" \
  -e DATABASE_URL="postgres://uaa:uaa@postgres:5432/uaa" uaa-backend-seed \
  npm run seed -- "/data/UAA_Coordinator_v5.xlsm"
docker run --rm --network web-proxy -e DATABASE_URL="postgres://uaa:uaa@postgres:5432/uaa" \
  uaa-backend-seed npm run seed:country-requirements
```
(use `MSYS_NO_PATHCONV=1` prefixing the seed command on Windows/Git-Bash, and reset the coordinator's password the same way as every prior slice)

Expected: 11 migrations now (the prior 10 plus `AddCompatibilityGrouping`); `country_requirements`/`form_templates` now hold 30 rows each (15 countries × 2 service types).

- [ ] **Step 2: Confirm the backend booted cleanly**

```bash
docker compose logs backend --tail 40
```
Expected: `Nest application successfully started`, the new `/legs/:legId/permit-requests/compatible` and `/legs/:legId/permit-requests/merge` routes mapped, no crash.

- [ ] **Step 3: Create two permit requests on different legs of the same trip and merge them**

Find two legs on the same seeded trip whose country matches (query `GET /legs` and group by `tripNo`/`country` — if the seeded MAYFLY data has no such pair, use `PATCH /legs/:id` to temporarily set a second leg's `country` to match a first leg's for this test, then revert it afterward). Then:
```bash
curl -s -X POST http://localhost:3011/legs/<leg-1-id>/permit-requests -H "Authorization: Bearer <token>" -H 'Content-Type: application/json' -d '{"country":"<country>","serviceType":"OVERFLIGHT"}'
curl -s "http://localhost:3011/legs/<leg-2-id>/permit-requests/compatible?country=<country>&serviceType=OVERFLIGHT" -H "Authorization: Bearer <token>"
```
Expected: the second call returns the first request's `requirementId` and `legIds: ["<leg-1-id>"]`.

```bash
curl -s -X POST http://localhost:3011/legs/<leg-2-id>/permit-requests/merge -H "Authorization: Bearer <token>" -H 'Content-Type: application/json' -d '{"requirementId":"<requirementId>"}'
```
Expected: `201` with `legIds` now containing both leg ids.

- [ ] **Step 4: Confirm merge is refused once CONFIRMED**

```bash
curl -s -X PATCH http://localhost:3011/permit-requests/<serviceCaseId> -H "Authorization: Bearer <token>" -H 'Content-Type: application/json' -d '{"status":"CONFIRMED","clearanceNumber":"EG-9001"}'
curl -s "http://localhost:3011/legs/<leg-3-id>/permit-requests/compatible?country=<country>&serviceType=OVERFLIGHT" -H "Authorization: Bearer <token>"
```
Expected: the compatibility check now returns `null` — the confirmed request is no longer offered for merging.

- [ ] **Step 5: Confirm the reconfirm sweep considers every merged leg**

Using the merged request from Step 3 (before confirming it in Step 4, or a fresh merged pair): confirm it with a `validFrom`/`validTo` window that covers leg 1's `arrDate` but not leg 2's, then `PATCH /legs/<leg-2-id>` with its existing `arrDate` (to trigger `reconcileForLeg`) and confirm the merged request's status flips to `RECONFIRM_REQUIRED` via `GET /legs/<leg-1-id>/permit-requests`.

- [ ] **Step 6: Confirm the frontend flow end-to-end in a real browser**

Visit the leg detail page for the two legs used above. On the second leg, select the matching Overflight/Landing type and click "Request Permit" — confirm the merge-confirmation message appears, click "Merge into it," and confirm the Permits table now shows "2 legs" for that row. Reload and confirm it persists. Visit the Action Board and confirm the merged request's row links to the first (anchor) leg.

- [ ] **Step 7: No commit for this task** — verification only. If anything fails, fix it in the task that owns the broken piece and re-run this check.

---

## Self-Review

**1. Spec coverage** — every scope decision from `docs/superpowers/specs/2026-08-24-compatibility-grouping-engine-design.md` has a corresponding task: `RequirementLeg` + type-aware `CountryRequirement`/`FormTemplate` (Task 1), compatibility check + merge + `legIds` (Task 2), multi-leg reconfirm (Task 3), the two new routes (Task 4), the coordinator-confirmed merge UI (Task 5). Every "Explicitly out of scope" item (un-merging, follow-up email on merge, real per-type values, merging into CONFIRMED, cross-trip) has no corresponding task.

**2. Placeholder scan** — no TBD/TODO/"add error handling"/"similar to Task N" found. The migration's `up()`/`down()` are both complete, including the explicitly-acknowledged lossy rollback for merged Requirements.

**3. Type consistency** — `PermitsService.toFlat()`'s `legIds`/`serviceType` fields (Task 2) match exactly what `permit-requests.spec.ts`'s tests (same task) and the frontend `PermitRequest` interface (Task 5) expect. `findCompatible()`'s return shape matches `CompatibleCandidate` in `api-client.ts` field-for-field. `ReconfirmSweepService.pickArrDate()`'s logic (Task 3) matches `PermitsService.pickArrDateForReconfirm()`'s logic (Task 2) — both pick the first out-of-window leg date, or the earliest date if none. Every file the B1 grep sweep + this design's "Blast radius" section named has a corresponding task: `requirement.entity.ts`, `requirement-leg.entity.ts` (new), `country-requirement.entity.ts`, `form-template.entity.ts`, the migration, `permits.service.ts`, `permits.controller.ts`, `permits.module.ts`, `reconfirm-sweep.service.ts`, the three DTOs, `data-source.ts`, `seed-country-requirements.ts`, `api-client.ts`, `permit-requests.tsx`, `action-board/page.tsx`, plus `legs.e2e-spec.ts`/`notifications.e2e-spec.ts`'s DI graphs.

---

Plan complete and saved to `docs/superpowers/plans/2026-08-24-compatibility-grouping-engine.md`. Proceeding to inline execution, continuing the established "go on" rhythm from B1.
