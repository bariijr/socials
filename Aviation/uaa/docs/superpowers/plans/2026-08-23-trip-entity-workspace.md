# Trip Entity & Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `Leg` rows a real `Trip` parent (they currently only share a plain `tripNo` string) and add a Trip workspace page so a coordinator can see a trip's full itinerary — all its legs, tails, operator, countries, and overall status — in one place. This is Sub-project A of a larger flight-support-engine request; see the design spec for the full decomposition and scope rationale.

**Architecture:** A new `Trip` entity (`id`, `tripNo` unique, timestamps only — no derived data stored) backs a `TripsModule`/`TripsService`/`TripsController`. `Leg` gets a `trip_id` FK, backfilled from existing data in one migration. `LegsService.create()`/`update()` find-or-create the `Trip` by `tripNo` so the relationship is maintained automatically as coordinators work — no separate "create a trip" UI or endpoint. `TripsService.getWorkspace(tripNo)` computes the trip aggregate (tails, operators, countries, status, date range) from its legs at read time. Frontend gets one new page and one small link from the existing leg detail page.

**Tech Stack:** NestJS 10 + TypeORM 0.3 (existing), Next.js 14 App Router (existing), Jest (backend), Vitest + React Testing Library (frontend) — same stack as every prior slice, no new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-23-trip-entity-workspace-design.md`

## Global Constraints

- Every table gets `createdAt`/`updatedAt` audit timestamps (existing convention).
- `Trip` stores only `id`, `tripNo`, timestamps — no derived fields (tails, operator, countries, status) are persisted on `Trip` itself; they're computed from legs on every read, so they can never drift out of sync (Spec: Scope decisions).
- No RBAC, no multi-tenancy, no real-time sync — confirmed out of scope for this app (Spec: Relationship to the larger request).
- No `/trips` list/index page and no manual trip create/update/delete endpoints — trips only ever come into existence implicitly, via leg creation (Spec: Scope decisions, API).
- The new endpoint sits behind the existing `JwtAuthGuard`, matching every other route in this app.

## Explicitly Deferred (not this plan)

- The full ~30-field Trip model (client, purpose, commercial status, billing entity, currency, sales owner, VIP info, etc.) — this plan's `Trip` is deliberately minimal.
- Aircraft substitution/override mechanics — `Leg` already carries its own `tail`/`acType` independently; nothing new needed.
- A manually-set Trip status/lifecycle — status here is two states (`ACTIVE`/`COMPLETED`), derived from `Leg.completedAt`.
- `Requirement`/`ServiceCase`/`ServiceOrder` and the ground-services module — Sub-projects B and C, separate specs.

---

## File Structure

```
backend/
├── src/
│   ├── trips/
│   │   ├── trip.entity.ts          # new
│   │   ├── trips.service.ts        # new
│   │   ├── trips.controller.ts     # new
│   │   └── trips.module.ts         # new
│   ├── legs/
│   │   ├── leg.entity.ts           # modify: add tripId
│   │   ├── legs.service.ts         # modify: wire TripsService into create()/update()
│   │   └── legs.module.ts          # modify: import TripsModule
│   ├── database/data-source.ts     # modify: register Trip entity
│   └── app.module.ts               # modify: import TripsModule
└── migrations/
    └── <ts>-CreateTripsAndBackfillLegs.ts  # new

test/
├── trips.service.spec.ts           # new
├── trips.e2e-spec.ts                # new
├── legs.service.spec.ts             # modify
└── legs.e2e-spec.ts                  # modify

frontend/
├── src/
│   ├── app/trips/[tripNo]/page.tsx  # new
│   ├── app/legs/[id]/page.tsx       # modify: link to trip workspace
│   ├── app/globals.css              # modify: trip status badge styles
│   └── lib/api-client.ts            # modify: getTrip, TripWorkspace
└── test/
    ├── trip-workspace.test.tsx      # new
    └── leg-detail.test.tsx          # modify
```

---

### Task 1: `Trip` entity + migration

**Files:**
- Create: `backend/src/trips/trip.entity.ts`, `backend/migrations/1756252800000-CreateTripsAndBackfillLegs.ts`
- Modify: `backend/src/legs/leg.entity.ts`, `backend/src/database/data-source.ts`

**Interfaces:**
- Produces: `Trip` entity (`id`, `tripNo` unique, `createdAt`, `updatedAt`); `Leg.tripId: string` (non-nullable FK to `trips.id`). Task 2 (`TripsService`) and Task 3 (`LegsService`) consume both.

Real data grounding: 62 seeded legs group into exactly 31 distinct `trip_no` values (verified against the live database before writing this plan), all clean numeric strings — no whitespace/casing collisions to worry about in the backfill.

- [x] **Step 1: Create the Trip entity**

`backend/src/trips/trip.entity.ts`:
```typescript
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('trips')
export class Trip {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'trip_no', unique: true })
  tripNo: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
```

- [x] **Step 2: Add tripId to the Leg entity**

Modify `backend/src/legs/leg.entity.ts` — add after `completedAt` (before `createdAt`):
```typescript
  @Column({ name: 'trip_id', type: 'uuid' })
  tripId: string;
```

- [x] **Step 3: Write the migration**

`backend/migrations/1756252800000-CreateTripsAndBackfillLegs.ts`:
```typescript
import { MigrationInterface, QueryRunner, Table, TableColumn, TableForeignKey } from 'typeorm';

export class CreateTripsAndBackfillLegs1756252800000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'trips',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' },
          { name: 'trip_no', type: 'varchar', isUnique: true },
          { name: 'created_at', type: 'timestamptz', default: 'now()' },
          { name: 'updated_at', type: 'timestamptz', default: 'now()' },
        ],
      }),
    );

    await queryRunner.query(`
      INSERT INTO trips (trip_no)
      SELECT DISTINCT trip_no FROM legs
    `);

    await queryRunner.addColumn(
      'legs',
      new TableColumn({ name: 'trip_id', type: 'uuid', isNullable: true }),
    );

    await queryRunner.query(`
      UPDATE legs SET trip_id = trips.id
      FROM trips
      WHERE legs.trip_no = trips.trip_no
    `);

    await queryRunner.changeColumn(
      'legs',
      'trip_id',
      new TableColumn({ name: 'trip_id', type: 'uuid', isNullable: false }),
    );

    await queryRunner.createForeignKey(
      'legs',
      new TableForeignKey({
        columnNames: ['trip_id'],
        referencedTableName: 'trips',
        referencedColumnNames: ['id'],
        onDelete: 'RESTRICT',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('legs');
    const foreignKey = table?.foreignKeys.find((fk) => fk.columnNames.includes('trip_id'));
    if (foreignKey) await queryRunner.dropForeignKey('legs', foreignKey);
    await queryRunner.dropColumn('legs', 'trip_id');
    await queryRunner.dropTable('trips');
  }
}
```

- [x] **Step 4: Register Trip in the CLI data source**

Modify `backend/src/database/data-source.ts`:
```typescript
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { User } from '../users/user.entity';
import { Leg } from '../legs/leg.entity';
import { CountryRequirement } from '../country-requirements/country-requirement.entity';
import { FormTemplate } from '../form-templates/form-template.entity';
import { PermitRequest } from '../permits/permit-request.entity';
import { Comm } from '../permits/comm.entity';
import { Team } from '../notifications/team.entity';
import { Trip } from '../trips/trip.entity';

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [User, Leg, CountryRequirement, FormTemplate, PermitRequest, Comm, Team, Trip],
  migrations: ['migrations/*.ts'],
  synchronize: false,
});
```

- [x] **Step 5: Verify the backend still builds**

Run: `cd backend && npm run build`
Expected: compiles with no errors. (Note: `Leg.tripId` has no default and no repositories reference it yet in this task — TypeScript won't complain since nothing constructs a `Leg` literal missing it at compile time in existing code; the real migration/backfill runs for real in Task 5.)

- [x] **Step 6: Commit**

```bash
git add backend/src/trips/trip.entity.ts backend/src/legs/leg.entity.ts backend/migrations/1756252800000-CreateTripsAndBackfillLegs.ts backend/src/database/data-source.ts
git commit -m "Add Trip entity and migrate Legs onto a real trip_id FK"
```

---

### Task 2: `TripsService` — workspace aggregation + route

**Files:**
- Create: `backend/src/trips/trips.service.ts`, `backend/src/trips/trips.controller.ts`, `backend/src/trips/trips.module.ts`
- Test: `backend/test/trips.service.spec.ts`, `backend/test/trips.e2e-spec.ts`

**Interfaces:**
- Produces: `TripsService.findOrCreateByTripNo(tripNo: string): Promise<Trip>` (Task 3 consumes this), `TripsService.getWorkspace(tripNo: string): Promise<TripWorkspace>`, `GET /trips/:tripNo` (200 or 404).
- `TripWorkspace` shape: `{ tripNo, tails: string[], operatorNames: string[], countries: string[], legCount: number, firstDeparture: Date | null, lastArrival: Date | null, status: 'ACTIVE' | 'COMPLETED', legs: Leg[] }`.

- [x] **Step 1: Write the failing service tests**

`backend/test/trips.service.spec.ts`:
```typescript
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { TripsService } from '../src/trips/trips.service';
import { Trip } from '../src/trips/trip.entity';
import { Leg } from '../src/legs/leg.entity';

describe('TripsService', () => {
  let service: TripsService;
  let tripRepo: { findOne: jest.Mock; create: jest.Mock; save: jest.Mock };
  let legRepo: { find: jest.Mock };

  beforeEach(async () => {
    tripRepo = {
      findOne: jest.fn(),
      create: jest.fn((dto) => dto),
      save: jest.fn(async (entity) => ({ id: 'trip-1', ...entity })),
    };
    legRepo = { find: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        TripsService,
        { provide: getRepositoryToken(Trip), useValue: tripRepo },
        { provide: getRepositoryToken(Leg), useValue: legRepo },
      ],
    }).compile();
    service = moduleRef.get(TripsService);
  });

  describe('findOrCreateByTripNo', () => {
    it('returns the existing trip when one already exists for the tripNo', async () => {
      tripRepo.findOne.mockResolvedValue({ id: 'trip-1', tripNo: '482421' });

      const result = await service.findOrCreateByTripNo('482421');

      expect(result).toEqual({ id: 'trip-1', tripNo: '482421' });
      expect(tripRepo.create).not.toHaveBeenCalled();
    });

    it('creates a new trip when none exists for the tripNo', async () => {
      tripRepo.findOne.mockResolvedValue(null);

      const result = await service.findOrCreateByTripNo('999999');

      expect(tripRepo.create).toHaveBeenCalledWith({ tripNo: '999999' });
      expect(result).toEqual(expect.objectContaining({ id: 'trip-1', tripNo: '999999' }));
    });
  });

  describe('getWorkspace', () => {
    it('throws NotFoundException when no trip has that tripNo', async () => {
      tripRepo.findOne.mockResolvedValue(null);

      await expect(service.getWorkspace('missing')).rejects.toThrow(NotFoundException);
    });

    it("aggregates tails, operators, countries, and status across the trip's legs", async () => {
      tripRepo.findOne.mockResolvedValue({ id: 'trip-1', tripNo: '484701' });
      legRepo.find.mockResolvedValue([
        {
          id: 'leg-1', legId: 1, tail: 'N221RW', operatorName: 'ACME', country: 'Nigeria',
          depDate: new Date('2026-09-14T00:18:00.000Z'), arrDate: new Date('2026-09-14T12:18:00.000Z'),
          completedAt: null,
        },
        {
          id: 'leg-2', legId: 2, tail: 'N221RW', operatorName: 'ACME', country: 'South Africa',
          depDate: new Date('2026-09-18T18:00:00.000Z'), arrDate: new Date('2026-09-16T21:30:00.000Z'),
          completedAt: null,
        },
      ]);

      const result = await service.getWorkspace('484701');

      expect(result.tails).toEqual(['N221RW']);
      expect(result.operatorNames).toEqual(['ACME']);
      expect(result.countries).toEqual(['Nigeria', 'South Africa']);
      expect(result.legCount).toBe(2);
      expect(result.status).toBe('ACTIVE');
      expect(result.legs).toHaveLength(2);
    });

    it('reports COMPLETED status only when every leg is complete', async () => {
      tripRepo.findOne.mockResolvedValue({ id: 'trip-1', tripNo: '482421' });
      legRepo.find.mockResolvedValue([
        { id: 'leg-1', legId: 1, tail: 'N148B', operatorName: null, country: 'Egypt', depDate: null, arrDate: null, completedAt: new Date() },
        { id: 'leg-2', legId: 2, tail: 'N148B', operatorName: null, country: 'Morocco', depDate: null, arrDate: null, completedAt: new Date() },
      ]);

      const result = await service.getWorkspace('482421');

      expect(result.status).toBe('COMPLETED');
    });
  });
});
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `cd backend && npx jest test/trips.service.spec.ts`
Expected: FAIL — `Cannot find module '../src/trips/trips.service'`

- [x] **Step 3: Implement TripsService**

`backend/src/trips/trips.service.ts`:
```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Trip } from './trip.entity';
import { Leg } from '../legs/leg.entity';

export interface TripWorkspace {
  tripNo: string;
  tails: string[];
  operatorNames: string[];
  countries: string[];
  legCount: number;
  firstDeparture: Date | null;
  lastArrival: Date | null;
  status: 'ACTIVE' | 'COMPLETED';
  legs: Leg[];
}

@Injectable()
export class TripsService {
  constructor(
    @InjectRepository(Trip) private readonly tripRepo: Repository<Trip>,
    @InjectRepository(Leg) private readonly legRepo: Repository<Leg>,
  ) {}

  async findOrCreateByTripNo(tripNo: string): Promise<Trip> {
    const existing = await this.tripRepo.findOne({ where: { tripNo } });
    if (existing) return existing;
    return this.tripRepo.save(this.tripRepo.create({ tripNo }));
  }

  async getWorkspace(tripNo: string): Promise<TripWorkspace> {
    const trip = await this.tripRepo.findOne({ where: { tripNo } });
    if (!trip) throw new NotFoundException(`Trip ${tripNo} not found`);

    const legs = await this.legRepo.find({ where: { tripId: trip.id }, order: { legId: 'ASC' } });

    const tails = Array.from(new Set(legs.map((l) => l.tail).filter((t): t is string => !!t)));
    const operatorNames = Array.from(new Set(legs.map((l) => l.operatorName).filter((o): o is string => !!o)));
    const countries = Array.from(new Set(legs.map((l) => l.country).filter((c): c is string => !!c)));
    const departures = legs.map((l) => l.depDate).filter((d): d is Date => d != null);
    const arrivals = legs.map((l) => l.arrDate).filter((d): d is Date => d != null);
    const status: 'ACTIVE' | 'COMPLETED' = legs.every((l) => l.completedAt) ? 'COMPLETED' : 'ACTIVE';

    return {
      tripNo,
      tails,
      operatorNames,
      countries,
      legCount: legs.length,
      firstDeparture: departures.length ? new Date(Math.min(...departures.map((d) => d.getTime()))) : null,
      lastArrival: arrivals.length ? new Date(Math.max(...arrivals.map((d) => d.getTime()))) : null,
      status,
      legs,
    };
  }
}
```

- [x] **Step 4: Run the tests to verify they pass**

Run: `cd backend && npx jest test/trips.service.spec.ts`
Expected: PASS (5 tests)

- [x] **Step 5: Add the controller and module**

`backend/src/trips/trips.controller.ts`:
```typescript
import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TripsService } from './trips.service';

@Controller('trips')
@UseGuards(JwtAuthGuard)
export class TripsController {
  constructor(private readonly tripsService: TripsService) {}

  @Get(':tripNo')
  getWorkspace(@Param('tripNo') tripNo: string) {
    return this.tripsService.getWorkspace(tripNo);
  }
}
```

`backend/src/trips/trips.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Trip } from './trip.entity';
import { Leg } from '../legs/leg.entity';
import { TripsService } from './trips.service';
import { TripsController } from './trips.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Trip, Leg])],
  providers: [TripsService],
  controllers: [TripsController],
  exports: [TripsService],
})
export class TripsModule {}
```

Modify `backend/src/app.module.ts` — add the import and add `TripsModule` to the `imports` array (alongside `LegsModule`/`PermitsModule`/`NotificationsModule`).

- [x] **Step 6: Write the failing e2e test**

`backend/test/trips.e2e-spec.ts`:
```typescript
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TripsModule } from '../src/trips/trips.module';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { Trip } from '../src/trips/trip.entity';
import { Leg } from '../src/legs/leg.entity';

describe('Trips (e2e)', () => {
  let app: INestApplication;
  let tripRepo: { findOne: jest.Mock };
  let legRepo: { find: jest.Mock };

  beforeAll(async () => {
    tripRepo = { findOne: jest.fn() };
    legRepo = { find: jest.fn().mockResolvedValue([]) };

    const moduleRef = await Test.createTestingModule({
      imports: [TripsModule],
    })
      .overrideProvider(getRepositoryToken(Trip))
      .useValue(tripRepo)
      .overrideProvider(getRepositoryToken(Leg))
      .useValue(legRepo)
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

  it('GET /trips/:tripNo returns 404 when the trip does not exist', async () => {
    tripRepo.findOne.mockResolvedValue(null);

    const response = await request(app.getHttpServer()).get('/trips/missing');

    expect(response.status).toBe(404);
  });

  it('GET /trips/:tripNo returns the trip workspace', async () => {
    tripRepo.findOne.mockResolvedValue({ id: 'trip-1', tripNo: '484701' });
    legRepo.find.mockResolvedValue([
      { id: 'leg-1', legId: 1, tail: 'N221RW', operatorName: 'ACME', country: 'Nigeria', depDate: null, arrDate: null, completedAt: null },
    ]);

    const response = await request(app.getHttpServer()).get('/trips/484701');

    expect(response.status).toBe(200);
    expect(response.body).toEqual(expect.objectContaining({ tripNo: '484701', legCount: 1, status: 'ACTIVE' }));
  });
});
```

- [x] **Step 7: Run the e2e test to verify it passes**

Run: `cd backend && npx jest test/trips.e2e-spec.ts --config test/jest-e2e.json`
Expected: PASS (2 tests)

- [x] **Step 8: Commit**

```bash
git add backend/src/trips/trips.service.ts backend/src/trips/trips.controller.ts backend/src/trips/trips.module.ts backend/src/app.module.ts backend/test/trips.service.spec.ts backend/test/trips.e2e-spec.ts
git commit -m "Add TripsService/Controller — trip workspace aggregation from a trip's legs"
```

---

### Task 3: Wire `TripsService` into leg creation and updates

**Files:**
- Modify: `backend/src/legs/legs.service.ts`, `backend/src/legs/legs.module.ts`
- Test: `backend/test/legs.service.spec.ts`, `backend/test/legs.e2e-spec.ts`

**Interfaces:**
- Consumes: `TripsService.findOrCreateByTripNo` (Task 2).
- Produces: `LegsService.create()` and `LegsService.update()` now maintain `Leg.tripId` automatically.

Real correctness requirement found while grounding this plan: `UpdateLegDto` already allows editing `tripNo` (it has since Slice 1). Without handling this, editing a leg's `tripNo` via `PATCH /legs/:id` would leave `Leg.tripNo` and `Leg.tripId` pointing at different trips — the leg would show a new trip number while `TripsService.getWorkspace` (which queries by `tripId`) still lists it under the old trip. `update()` must re-run the same find-or-create when `tripNo` actually changes.

- [x] **Step 1: Write the failing unit tests**

Modify `backend/test/legs.service.spec.ts` — replace the whole file:
```typescript
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { LegsService } from '../src/legs/legs.service';
import { Leg } from '../src/legs/leg.entity';
import { TripsService } from '../src/trips/trips.service';

describe('LegsService', () => {
  let service: LegsService;
  let legRepo: { create: jest.Mock; save: jest.Mock; find: jest.Mock; findOne: jest.Mock; maximum: jest.Mock };
  let tripsService: { findOrCreateByTripNo: jest.Mock };

  beforeEach(async () => {
    legRepo = {
      create: jest.fn((dto) => dto),
      save: jest.fn(async (entity) => ({ id: 'generated-id', ...entity })),
      find: jest.fn(),
      findOne: jest.fn(),
      maximum: jest.fn(),
    };
    tripsService = { findOrCreateByTripNo: jest.fn().mockResolvedValue({ id: 'trip-1', tripNo: 'trip-1' }) };
    const moduleRef = await Test.createTestingModule({
      providers: [
        LegsService,
        { provide: getRepositoryToken(Leg), useValue: legRepo },
        { provide: TripsService, useValue: tripsService },
      ],
    }).compile();
    service = moduleRef.get(LegsService);
  });

  it('assigns the next leg ID as max(existing legId) + 1 and attaches the leg to its trip', async () => {
    legRepo.maximum.mockResolvedValue(41);
    tripsService.findOrCreateByTripNo.mockResolvedValue({ id: 'trip-42', tripNo: '2608001' });

    const result = await service.create({ tripNo: '2608001', icao: 'GMMN' });

    expect(legRepo.maximum).toHaveBeenCalledWith('legId');
    expect(tripsService.findOrCreateByTripNo).toHaveBeenCalledWith('2608001');
    expect(legRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ legId: 42, tripNo: '2608001', icao: 'GMMN', tripId: 'trip-42' }),
    );
    expect(result).toEqual(expect.objectContaining({ id: 'generated-id', legId: 42 }));
  });

  it('assigns leg ID 1 when no legs exist yet', async () => {
    legRepo.maximum.mockResolvedValue(null);

    await service.create({ tripNo: '2608001', icao: 'GMMN' });

    expect(legRepo.create).toHaveBeenCalledWith(expect.objectContaining({ legId: 1 }));
  });

  it('lists all legs', async () => {
    legRepo.find.mockResolvedValue([{ id: '1' }, { id: '2' }]);

    const result = await service.findAll();

    expect(result).toHaveLength(2);
  });

  it('finds one leg by id', async () => {
    legRepo.findOne.mockResolvedValue({ id: '1', tripNo: '2608001' });

    const result = await service.findOne('1');

    expect(result).toEqual(expect.objectContaining({ tripNo: '2608001' }));
  });

  it('updates a leg and returns the saved entity', async () => {
    legRepo.findOne.mockResolvedValue({ id: '1', tripNo: '482421', arrDate: new Date('2026-09-16T16:20:00.000Z') });
    legRepo.save.mockImplementation(async (entity) => entity);

    const result = await service.update('1', { arrDate: '2026-09-18T10:00:00.000Z' });

    expect(legRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ arrDate: new Date('2026-09-18T10:00:00.000Z') }),
    );
    expect(result).toEqual(expect.objectContaining({ id: '1' }));
    expect(tripsService.findOrCreateByTripNo).not.toHaveBeenCalled();
  });

  it('reassigns the leg to a different (or new) trip when tripNo changes', async () => {
    legRepo.findOne.mockResolvedValue({ id: '1', tripNo: '482421', tripId: 'trip-old' });
    legRepo.save.mockImplementation(async (entity) => entity);
    tripsService.findOrCreateByTripNo.mockResolvedValue({ id: 'trip-new', tripNo: '482499' });

    const result = await service.update('1', { tripNo: '482499' });

    expect(tripsService.findOrCreateByTripNo).toHaveBeenCalledWith('482499');
    expect(legRepo.save).toHaveBeenCalledWith(expect.objectContaining({ tripId: 'trip-new' }));
    expect(result).toEqual(expect.objectContaining({ tripId: 'trip-new' }));
  });

  it('throws NotFoundException when updating a leg that does not exist', async () => {
    legRepo.findOne.mockResolvedValue(null);

    await expect(service.update('missing', { arrDate: '2026-09-18T10:00:00.000Z' })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('markComplete stamps completedAt and returns the saved leg', async () => {
    legRepo.findOne.mockResolvedValue({ id: '1', tripNo: '482421', completedAt: null });
    legRepo.save.mockImplementation(async (entity) => entity);

    const result = await service.markComplete('1');

    expect(result.completedAt).toBeInstanceOf(Date);
    expect(legRepo.save).toHaveBeenCalledWith(expect.objectContaining({ id: '1', completedAt: expect.any(Date) }));
  });

  it('throws NotFoundException when marking a leg that does not exist as complete', async () => {
    legRepo.findOne.mockResolvedValue(null);

    await expect(service.markComplete('missing')).rejects.toThrow(NotFoundException);
  });

  it('findCompletedInRange queries legs with completedAt between the given dates', async () => {
    legRepo.find.mockResolvedValue([{ id: '1', completedAt: new Date('2026-08-15T00:00:00.000Z') }]);

    const result = await service.findCompletedInRange(
      new Date('2026-08-01T00:00:00.000Z'),
      new Date('2026-08-31T23:59:59.000Z'),
    );

    expect(legRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ completedAt: expect.anything() }) }),
    );
    expect(result).toHaveLength(1);
  });

  it('exportMayflyBuffer returns a real xlsx buffer for the completed legs in range', async () => {
    legRepo.find.mockResolvedValue([{ id: '1', country: 'Morocco', tripNo: '475087', icao: 'GMMN', legId: 63 }]);

    const buffer = await service.exportMayflyBuffer(
      new Date('2026-08-01T00:00:00.000Z'),
      new Date('2026-08-31T23:59:59.000Z'),
    );

    expect(Buffer.isBuffer(buffer)).toBe(true);
  });
});
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `cd backend && npx jest test/legs.service.spec.ts`
Expected: FAIL — `Cannot find module '../src/trips/trips.service'` (doesn't exist yet in `LegsService`'s constructor dependencies)

- [x] **Step 3: Wire TripsService into LegsService**

Modify `backend/src/legs/legs.service.ts`:
```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { Leg } from './leg.entity';
import { CreateLegDto } from './dto/create-leg.dto';
import { UpdateLegDto } from './dto/update-leg.dto';
import { buildMayflyWorkbook } from './mayfly-export';
import { TripsService } from '../trips/trips.service';

@Injectable()
export class LegsService {
  constructor(
    @InjectRepository(Leg) private readonly legRepo: Repository<Leg>,
    private readonly tripsService: TripsService,
  ) {}

  async create(dto: CreateLegDto): Promise<Leg> {
    const currentMax = await this.legRepo.maximum('legId');
    const legId = (currentMax ?? 0) + 1;
    const trip = await this.tripsService.findOrCreateByTripNo(dto.tripNo);
    const leg = this.legRepo.create({ ...dto, legId, tripId: trip.id });
    return this.legRepo.save(leg);
  }

  findAll(): Promise<Leg[]> {
    return this.legRepo.find({ order: { legId: 'ASC' } });
  }

  findOne(id: string): Promise<Leg | null> {
    return this.legRepo.findOne({ where: { id } });
  }

  async update(id: string, dto: UpdateLegDto): Promise<Leg> {
    const leg = await this.legRepo.findOne({ where: { id } });
    if (!leg) throw new NotFoundException(`Leg ${id} not found`);

    const tripNoChanged = dto.tripNo !== undefined && dto.tripNo !== leg.tripNo;

    Object.assign(leg, {
      ...dto,
      arrDate: dto.arrDate !== undefined ? new Date(dto.arrDate) : leg.arrDate,
      depDate: dto.depDate !== undefined ? new Date(dto.depDate) : leg.depDate,
    });

    if (tripNoChanged) {
      const trip = await this.tripsService.findOrCreateByTripNo(dto.tripNo!);
      leg.tripId = trip.id;
    }

    return this.legRepo.save(leg);
  }

  async markComplete(id: string): Promise<Leg> {
    const leg = await this.legRepo.findOne({ where: { id } });
    if (!leg) throw new NotFoundException(`Leg ${id} not found`);
    leg.completedAt = new Date();
    return this.legRepo.save(leg);
  }

  findCompletedInRange(from: Date, to: Date): Promise<Leg[]> {
    return this.legRepo.find({ where: { completedAt: Between(from, to) }, order: { completedAt: 'ASC' } });
  }

  async exportMayflyBuffer(from: Date, to: Date): Promise<Buffer> {
    const legs = await this.findCompletedInRange(from, to);
    return buildMayflyWorkbook(legs);
  }
}
```

- [x] **Step 4: Run the tests to verify they pass**

Run: `cd backend && npx jest test/legs.service.spec.ts`
Expected: PASS (11 tests)

- [x] **Step 5: Import TripsModule into LegsModule**

Modify `backend/src/legs/legs.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Leg } from './leg.entity';
import { LegsService } from './legs.service';
import { LegsController } from './legs.controller';
import { PermitsModule } from '../permits/permits.module';
import { TripsModule } from '../trips/trips.module';

@Module({
  imports: [TypeOrmModule.forFeature([Leg]), PermitsModule, TripsModule],
  providers: [LegsService],
  controllers: [LegsController],
  exports: [LegsService],
})
export class LegsModule {}
```

- [x] **Step 6: Update the Legs e2e test to provide TripsService**

Modify `backend/test/legs.e2e-spec.ts` — add the import `import { TripsService } from '../src/trips/trips.service';`, `import { Trip } from '../src/trips/trip.entity';`, and add these overrides alongside the existing chain (before `.compile()`):
```typescript
      .overrideProvider(TripsService)
      .useValue({ findOrCreateByTripNo: jest.fn().mockResolvedValue({ id: 'trip-1', tripNo: 'trip-1' }) })
      .overrideProvider(getRepositoryToken(Trip))
      .useValue({})
```
Note: same DI-graph lesson learned repeatedly in prior slices — `LegsModule` now imports `TripsModule`, whose own `TypeOrmModule.forFeature([Trip, Leg])` registration gets eagerly instantiated regardless of `TripsService` being mocked, so `getRepositoryToken(Trip)` needs its own dummy override. `getRepositoryToken(Leg)` is already overridden for `LegsModule`'s own use — that covers `TripsModule`'s separate `Leg` registration too (tokens are keyed by entity class).

Then extend the existing "POST /legs creates a leg and returns 201" test's assertion:
```typescript
    expect(response.body).toEqual(expect.objectContaining({ tripNo: '2608001', icao: 'GMMN', tripId: 'trip-1' }));
```
(replacing its current `expect(response.body).toEqual(expect.objectContaining({ tripNo: '2608001', icao: 'GMMN' }));`)

- [x] **Step 7: Run the full e2e suite to verify nothing broke**

Run: `cd backend && npx jest --config test/jest-e2e.json`
Expected: PASS (all suites)

- [x] **Step 8: Commit**

```bash
git add backend/src/legs/legs.service.ts backend/src/legs/legs.module.ts backend/test/legs.service.spec.ts backend/test/legs.e2e-spec.ts
git commit -m "Wire TripsService into leg creation/update — every leg stays attached to its trip"
```

---

### Task 4: Frontend — Trip workspace page

**Files:**
- Create: `frontend/src/app/trips/[tripNo]/page.tsx`
- Modify: `frontend/src/lib/api-client.ts`, `frontend/src/app/legs/[id]/page.tsx`, `frontend/src/app/globals.css`
- Test: `frontend/test/trip-workspace.test.tsx`, `frontend/test/leg-detail.test.tsx`

**Interfaces:**
- Consumes: `GET /trips/:tripNo` (Task 2).
- Produces: `getTrip(token, tripNo): Promise<TripWorkspace>` in `api-client.ts`. Route `/trips/[tripNo]`.

- [x] **Step 1: Write the failing api-client type/function (no dedicated test — mirrors the existing untested-in-isolation `getLeg` pattern; covered by the page test in Step 5)**

Modify `frontend/src/lib/api-client.ts` — add after `getLeg`:
```typescript
export interface TripWorkspace {
  tripNo: string;
  tails: string[];
  operatorNames: string[];
  countries: string[];
  legCount: number;
  firstDeparture: string | null;
  lastArrival: string | null;
  status: 'ACTIVE' | 'COMPLETED';
  legs: Leg[];
}

export async function getTrip(token: string, tripNo: string): Promise<TripWorkspace> {
  const response = await fetch(`${API_URL}/trips/${tripNo}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('Failed to load trip');
  return response.json();
}
```

- [x] **Step 2: Write the failing Trip workspace page test**

`frontend/test/trip-workspace.test.tsx`:
```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import * as apiClient from '../src/lib/api-client';
import TripWorkspacePage from '../src/app/trips/[tripNo]/page';

vi.mock('../src/lib/api-client', async () => {
  const actual = await vi.importActual<typeof apiClient>('../src/lib/api-client');
  return { ...actual, getTrip: vi.fn() };
});

vi.mock('next/navigation', async () => {
  const actual = await vi.importActual<typeof import('next/navigation')>('next/navigation');
  return { ...actual, useParams: () => ({ tripNo: '484701' }) };
});

describe('TripWorkspacePage', () => {
  beforeEach(() => {
    localStorage.setItem('uaa_token', 'test-token');
  });

  it("renders the trip's aggregate info and its legs", async () => {
    vi.mocked(apiClient.getTrip).mockResolvedValue({
      tripNo: '484701',
      tails: ['N221RW'],
      operatorNames: ['ACME'],
      countries: ['Nigeria', 'South Africa'],
      legCount: 2,
      firstDeparture: '2026-09-14T00:18:00.000Z',
      lastArrival: '2026-09-18T06:10:00.000Z',
      status: 'ACTIVE',
      legs: [
        { id: 'leg-1', tripNo: '484701', icao: 'DNAA', tail: 'N221RW', country: 'Nigeria', arrDate: null, depDate: null, legId: 51 },
        { id: 'leg-2', tripNo: '484701', icao: 'FACT', tail: 'N221RW', country: 'South Africa', arrDate: null, depDate: null, legId: 54 },
      ],
    });

    render(<TripWorkspacePage />);

    await waitFor(() => expect(screen.getByRole('heading', { name: /484701/ })).toBeInTheDocument());
    expect(screen.getByText('N221RW')).toBeInTheDocument();
    expect(screen.getByText('ACME')).toBeInTheDocument();
    expect(screen.getByText('DNAA')).toBeInTheDocument();
    expect(screen.getByText('FACT')).toBeInTheDocument();
  });
});
```

- [x] **Step 3: Run the test to verify it fails**

Run: `cd frontend && npx vitest run test/trip-workspace.test.tsx`
Expected: FAIL — `Cannot find module '../src/app/trips/[tripNo]/page'`

- [x] **Step 4: Implement the Trip workspace page**

`frontend/src/app/trips/[tripNo]/page.tsx`:
```tsx
'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getTrip, type TripWorkspace } from '@/lib/api-client';

function formatDateTime(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function TripWorkspacePage() {
  const { tripNo } = useParams<{ tripNo: string }>();
  const [trip, setTrip] = useState<TripWorkspace | null>(null);
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('uaa_token');
    if (!token) {
      router.replace('/login');
      return;
    }
    getTrip(token, tripNo)
      .then(setTrip)
      .catch(() => router.replace('/legs'));
  }, [tripNo, router]);

  if (!trip) return null;

  return (
    <div className="board-shell">
      <div className="board-header">
        <h1 className="board-title">UAA Coordinator — Trip {trip.tripNo}</h1>
        <div className="board-header-right">
          <span className={`trip-status-badge trip-status-${trip.status.toLowerCase()}`}>{trip.status}</span>
          <a className="btn-link" href="/legs">
            Back to legs
          </a>
        </div>
      </div>
      <div className="runway-rule" />

      <div className="leg-detail-summary">
        <div>
          <span className="col-muted">Tail{trip.tails.length === 1 ? '' : 's'}</span>
          <span className="col-mono">{trip.tails.join(', ') || '—'}</span>
        </div>
        <div>
          <span className="col-muted">Operator</span>
          <span>{trip.operatorNames.join(', ') || '—'}</span>
        </div>
        <div>
          <span className="col-muted">Countries</span>
          <span>{trip.countries.join(', ') || '—'}</span>
        </div>
        <div>
          <span className="col-muted">Legs</span>
          <span className="col-mono">{trip.legCount}</span>
        </div>
        <div>
          <span className="col-muted">First Departure</span>
          <span className="col-mono">{formatDateTime(trip.firstDeparture)}</span>
        </div>
        <div>
          <span className="col-muted">Last Arrival</span>
          <span className="col-mono">{formatDateTime(trip.lastArrival)}</span>
        </div>
      </div>

      <div className="board-table-wrap">
        <table className="legs-table">
          <thead>
            <tr>
              <th>Leg</th>
              <th>ICAO</th>
              <th>Tail</th>
              <th>Arrival</th>
              <th>Departure</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {trip.legs.map((leg) => (
              <tr key={leg.id}>
                <td className="col-mono">
                  <a href={`/legs/${leg.id}`}>{leg.legId}</a>
                </td>
                <td className="col-mono">{leg.icao}</td>
                <td className="col-mono">{leg.tail}</td>
                <td className="col-mono">{formatDateTime(leg.arrDate)}</td>
                <td className="col-mono">{formatDateTime(leg.depDate)}</td>
                <td>{leg.completedAt ? <span className="completed-badge">Completed</span> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [x] **Step 5: Run the test to verify it passes**

Run: `cd frontend && npx vitest run test/trip-workspace.test.tsx`
Expected: PASS (1 test)

- [x] **Step 6: Add trip status badge CSS**

Modify `frontend/src/app/globals.css` — append:
```css
.trip-status-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 2px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
}

.trip-status-active {
  background: rgba(255, 176, 32, 0.15);
  color: var(--accent);
}

.trip-status-completed {
  background: rgba(124, 135, 148, 0.15);
  color: var(--muted);
}
```

- [x] **Step 7: Write the failing leg-detail link test**

Add to `frontend/test/leg-detail.test.tsx` (inside the existing `describe('LegDetailPage', ...)` block, after the first test):
```typescript
  it('links to the trip workspace for this leg', async () => {
    vi.mocked(apiClient.getLeg).mockResolvedValue({
      id: '1',
      tripNo: '484701',
      icao: 'HECA',
      tail: 'N148B',
      country: 'Egypt',
      arrDate: null,
      depDate: null,
      legId: 149,
    });
    vi.mocked(apiClient.getLegs).mockResolvedValue([]);

    render(<LegDetailPage />);

    await waitFor(() => expect(screen.getByRole('link', { name: 'Trip 484701' })).toBeInTheDocument());
    expect(screen.getByRole('link', { name: 'Trip 484701' })).toHaveAttribute('href', '/trips/484701');
  });
```

- [x] **Step 8: Run the test to verify it fails**

Run: `cd frontend && npx vitest run test/leg-detail.test.tsx`
Expected: FAIL — no link with that accessible name rendered yet

- [x] **Step 9: Add the trip link to the leg detail page**

Modify `frontend/src/app/legs/[id]/page.tsx` — add the link inside `.board-header-right`, before the existing "Back to legs" link:
```tsx
          <a className="btn-link" href={`/trips/${leg.tripNo}`}>
            Trip {leg.tripNo}
          </a>
```

- [x] **Step 10: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run test/leg-detail.test.tsx`
Expected: PASS (3 tests)

- [x] **Step 11: Run the full frontend suite and the build**

Run:
```bash
cd frontend
npx vitest run
npm run build
```
Expected: all tests PASS, build succeeds, `/trips/[tripNo]` listed in the route output.

- [x] **Step 12: Commit**

```bash
git add frontend/src/app/trips frontend/src/app/legs/[id]/page.tsx frontend/src/app/globals.css frontend/src/lib/api-client.ts frontend/test/trip-workspace.test.tsx frontend/test/leg-detail.test.tsx
git commit -m "Add Trip workspace page and link from the leg detail page"
```

---

### Task 5: End-to-end smoke check against the real seeded stack

**Files:** none (verification-only task)

- [x] **Step 1: Bring up the full stack fresh and run every migration + seed script**

Following the established approach from Slices 3-5:
```bash
docker compose down -v
docker compose up --build -d
docker build --target build -t uaa-backend-seed ./backend
docker run --rm --network web-proxy -v "<repo>/Aviation/uaa/backend:/app" -w /app \
  -e DATABASE_URL="postgres://uaa:uaa@postgres:5432/uaa" node:20-alpine \
  sh -c "npm install --silent && npx typeorm-ts-node-commonjs migration:run -d src/database/data-source.ts"
docker run --rm --network web-proxy -v "<repo>/Aviation/uaa/UAA_Coordinator_v5.xlsm:/app/UAA_Coordinator_v5.xlsm:ro" \
  -e DATABASE_URL="postgres://uaa:uaa@postgres:5432/uaa" uaa-backend-seed npm run seed -- "UAA_Coordinator_v5.xlsm"
docker run --rm --network web-proxy -e DATABASE_URL="postgres://uaa:uaa@postgres:5432/uaa" \
  uaa-backend-seed npm run seed:country-requirements
```
Expected: 9 migrations now (the prior 8 plus `CreateTripsAndBackfillLegs`), same real leg/team/country/template counts as Slice 5's Task 7. Reset coordinator `bminja`'s password to `Admin123!` the same way as prior slices.

Real defect found here: the migration itself ran cleanly (against the empty freshly-migrated database, correctly backfilling 0 trips since 0 legs existed yet), but the leg seed script then failed immediately — `scripts/seed-from-excel.ts`'s `seedLegs()` inserts `Leg` rows directly via its own `legRepo.create()`/`legRepo.save()` calls, bypassing `LegsService.create()` entirely, so it never set the now-`NOT NULL` `trip_id` column. This wasn't caught by any unit or e2e test in Tasks 1-4 because none of them exercise the seed script — only `LegsService`, which the seed script never calls. Fixed by adding the same find-or-create logic directly to `seedLegs()`: a `Repository<Trip>` plus an in-memory `Map<tripNo, tripId>` cache (avoids redundant lookups for the many rows sharing a `tripNo`, without risking duplicate-`trip_no` inserts since the loop is sequential, not concurrent). Zero legs had been inserted before the failure (confirmed via `SELECT COUNT(*) FROM legs`), so no partial-state cleanup was needed — just rebuild the seed image and rerun. Re-run after the fix: `Seeded 0 user(s), 62 leg(s), 20 team(s).` (`0` users because the first, failed attempt had already created them before hitting the `seedLegs` failure, and the script is idempotent).

- [x] **Step 2: Verify the backfill produced exactly the expected trip count**

```bash
docker compose exec postgres psql -U uaa -d uaa -c "SELECT COUNT(*) FROM trips;"
docker compose exec postgres psql -U uaa -d uaa -c "SELECT COUNT(*) FROM legs WHERE trip_id IS NULL;"
```
Expected: `31` trips (matches the real distinct-`trip_no` count confirmed against the live database while writing this plan); `0` legs with a null `trip_id` (the `NOT NULL` constraint the migration adds would itself have failed the migration if any leg was left unassigned, but this double-checks the real data directly).

Confirmed: `31` trips, `0` legs with a null `trip_id` — exactly as expected, using the seed script's own find-or-create logic (Step 1's fix) rather than the migration's backfill query (which only ever saw 0 legs, since seeding runs after migrations in this stack's startup order).

- [x] **Step 3: Confirm the backend booted cleanly with the new module**

```bash
docker compose logs backend --tail 30
```
Expected: `Nest application successfully started`, with `Mapped {/trips/:tripNo, GET}` listed, no crash.

Confirmed: `TripsModule dependencies initialized`, `Mapped {/trips/:tripNo, GET}` route logged, `Nest application successfully started` with no crash.

- [x] **Step 4: Fetch a real multi-leg trip's workspace**

Using trip `484701` (4 real seeded legs across Nigeria and South Africa, confirmed while writing this plan):
```bash
curl -s http://localhost:3011/trips/484701 -H "Authorization: Bearer <token>"
```
Expected: `200` with `"legCount":4`, `"tails":["N221RW"]`, `"countries"` listing Nigeria and South Africa, and a `legs` array of 4 real leg objects.

Confirmed: `"legCount":4`, `"tails":["N221RW"]`, `"operatorNames":["THE COCA-COLA COMPANY"]`, `"countries":["Nigeria","South Africa"]`, `"status":"ACTIVE"`, and all 4 real legs (DNAA, DNMM, FAOR, FACT) in the `legs` array.

- [x] **Step 5: Create a new leg and confirm it attaches to the correct trip**

```bash
curl -s -X POST http://localhost:3011/legs -H "Authorization: Bearer <token>" -H 'Content-Type: application/json' -d '{"tripNo":"484701","icao":"FALE"}'
curl -s http://localhost:3011/trips/484701 -H "Authorization: Bearer <token>"
```
Expected: first call's response includes a `tripId`; second call's `legCount` is now `5` and the new leg appears in the `legs` array — confirms `LegsService.create()`'s find-or-create ran against the real database, not just the unit test's mocked repo.

Confirmed: the created leg's response included `"tripId":"135512a2-ca14-4b7c-a911-5ddc2e8e00ad"` (the same id as trip 484701's real seeded record — no new trip was spuriously created); the follow-up fetch showed `legCount: 5` with `FALE` appended to the ICAO list.

- [x] **Step 6: Confirm the frontend renders the Trip workspace and the leg-detail link in a real browser**

Log in at `http://localhost:3012/login`. Open `http://localhost:3012/legs/<id-of-a-484701-leg>`, confirm a "Trip 484701" link appears in the header and navigates to `http://localhost:3012/trips/484701`, which should show all 5 legs (including the one created in Step 5), the aggregate tail/operator/countries, and an `ACTIVE` status badge.

Confirmed in a real Chrome tab: the leg detail page showed a "Trip 484701" link in the header; navigating to `/trips/484701` rendered all 5 legs (96, 121, 122, 131, and the newly created 150/FALE), the correct tail/operator/countries, and an `ACTIVE` status badge.

- [x] **Step 7: No commit for this task** — it's verification only. If anything fails, fix it in the task that owns the broken piece and re-run this check.

---

## Self-Review

**1. Spec coverage** — this plan implements exactly what `docs/superpowers/specs/2026-08-23-trip-entity-workspace-design.md` scoped: a minimal `Trip` entity (Task 1), the workspace aggregation endpoint (Task 2), the implicit find-or-create relationship maintained through leg creation *and* update (Task 3 — including the `tripNo`-edit correctness case the spec's "Leg creation" section implied but didn't spell out for the update path, caught by reading the actual `UpdateLegDto` during planning), and the frontend workspace page plus the one link from the leg detail page (Task 4). Every "Explicitly out of scope" item from the spec (full 30-field Trip model, aircraft substitution, manual status, `/trips` list page, RBAC/multi-tenancy/real-time) has no corresponding task here.

**2. Placeholder scan** — no TBD/TODO/"add error handling"/"similar to Task N" found. The migration is a real, complete up/down pair, not a stub.

**3. Type consistency** — `TripsService.getWorkspace`'s returned `TripWorkspace` shape (Task 2) matches exactly what `trip-workspace.test.tsx`'s mock (Task 4) and the frontend `TripWorkspace` interface (Task 4) both expect, field-for-field (`tails`, `operatorNames`, `countries`, `legCount`, `firstDeparture`, `lastArrival`, `status`, `legs`). `LegsService.create()`'s call to `tripsService.findOrCreateByTripNo(dto.tripNo)` (Task 3) matches the exact signature `TripsService` produces (Task 2). The migration's column additions (`trip_id uuid NOT NULL` with FK) match the `Leg` entity's new `tripId: string` field (Task 1) — checked against the real current `leg.entity.ts` read during planning, not assumed.

---

Plan complete and saved to `docs/superpowers/plans/2026-08-23-trip-entity-workspace.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
