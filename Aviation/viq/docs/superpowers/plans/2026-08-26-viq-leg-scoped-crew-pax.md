# VIQ Leg-Scoped Crew & Pax Manifest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the trip-wide `TripPersonAssignment` relation with a leg-scoped `LegPersonAssignment` relation, turn `TripDetail.tsx`'s read-only "LEG CREW & PAX MANIFEST" into real per-leg add/remove CRUD, and make every consumer (email templates, the trip-wide CREW & PAX register, `PersonDetail.tsx`'s assigned-trips view, `ComposerPage.tsx`) correctly reflect that the same person can hold a different role on different legs of the same trip, or be on some legs and not others.

**Architecture:** One new Prisma model, `LegPersonAssignment(legId, personId, role, hotel, commercialFlightEta)`, replaces `TripPersonAssignment` entirely — no trip-level assignment table survives alongside it. `PersonsService.findAll` branches on a `legId` query param (one leg's roster, `TripPersonView[]`) vs a `tripId` query param (the trip-wide register, one row per person per leg, `TripLegPersonView[]`). A new `assignAllLegs` convenience method loops leg-level upserts in one transaction so "assign to the whole trip" stays a single user action. `emailTemplates.ts` and `ComposeDrawer.tsx` need zero code changes — they already receive whatever `persons` array their caller passes in; only the caller's data source changes from trip-wide to leg-scoped.

**Tech Stack:** No new dependencies. Reuses this project's established async-migration pattern (every prior resource already went through it) and its established hand-edited-migration pattern (`prisma migrate dev --create-only`, hand-edited for correct sequencing, applied via `prisma migrate deploy` if the non-interactive environment blocks `migrate dev` directly — see Task 1's fallback note).

**Spec:** `docs/superpowers/specs/2026-08-26-viq-leg-scoped-crew-pax-design.md`

## Global Constraints

- Do NOT `git commit` any of this work — explicit user instruction, carried over from every prior sub-project in this session.
- The migration must **preserve** existing assignment data: every existing `TripPersonAssignment` row must fan out to one `LegPersonAssignment` row per leg of that trip, copying role/hotel/commercialFlightEta onto each, before `trip_person_assignments` is dropped.
- Do not reintroduce a trip-level assignment table alongside the new leg-level one — the user explicitly rejected a default-plus-override shape in favor of a single fully leg-scoped model.
- `TripPersonView` (`Person & { Role, CommercialFlightETA?, Hotel? }`) keeps its exact existing shape — only its meaning changes, from "this trip's assignment" to "this leg's assignment." Do not rename or restructure it.
- `emailTemplates.ts`'s `generateEmail()` PIC/crew/pax filter logic must not change — it is already correct once its `persons` input is leg-scoped.
- `ComposerPage.tsx`'s "Leg (optional)" selector must stay optional — do not make a leg selection required to compose.
- `dataStore.ts` has `// @ts-nocheck`. `TripDetail.tsx`, `PersonDetail.tsx`, and `ComposerPage.tsx` do NOT — real type-checking applies to all three.
- `NewTripWizard.tsx` and `AdminAssets.tsx` are out of scope — confirmed via investigation to have no dependency on the assignment relation being changed.

---

### Task 1: Backend — schema replacement, data-preserving migration

**Files:**
- Modify: `prisma/schema.prisma` (remove `TripPersonAssignment`; add `LegPersonAssignment`; update `Trip`, `Leg`, `Person` relation fields)
- Create: a new Prisma migration (via `npm run prisma:migrate -- --create-only`, hand-edited)

**Interfaces:**
- Produces: `LegPersonAssignment` Prisma model with `@@unique([legId, personId])`.

- [ ] **Step 1: Remove `TripPersonAssignment`, add `LegPersonAssignment`**

In `prisma/schema.prisma`, delete the existing model:

```prisma
model TripPersonAssignment {
  id                  Int       @id @default(autoincrement())
  tripId              String    @map("trip_id")
  personId            String    @map("person_id")
  role                String
  commercialFlightEta DateTime? @map("commercial_flight_eta")
  hotel               String?

  trip   Trip   @relation(fields: [tripId], references: [tripId], onDelete: Cascade)
  person Person @relation(fields: [personId], references: [personId], onDelete: Cascade)

  @@unique([tripId, personId])
  @@index([tripId])
  @@index([personId])
  @@map("trip_person_assignments")
}
```

Add in its place:

```prisma
model LegPersonAssignment {
  id                  Int       @id @default(autoincrement())
  legId               String    @map("leg_id")
  personId            String    @map("person_id")
  role                String
  commercialFlightEta DateTime? @map("commercial_flight_eta")
  hotel               String?

  leg    Leg    @relation(fields: [legId], references: [legId], onDelete: Cascade)
  person Person @relation(fields: [personId], references: [personId], onDelete: Cascade)

  @@unique([legId, personId])
  @@index([legId])
  @@index([personId])
  @@map("leg_person_assignments")
}
```

- [ ] **Step 2: Update the three relation fields this touches**

In `model Trip`, remove the line `assignments TripPersonAssignment[]` (no
replacement — `Trip` no longer has a direct assignment relation).

In `model Leg`, add a reverse relation field alongside its existing `trip`
field:

```prisma
  assignments LegPersonAssignment[]
```

In `model Person`, replace `assignments TripPersonAssignment[]` with:

```prisma
  legAssignments LegPersonAssignment[]
```

- [ ] **Step 3: Generate the migration without applying it**

Run: `npm run prisma:migrate -- --name leg_scoped_assignments --create-only`

Expected: Prisma either writes the migration file without applying it
(same as prior slices), or — if this session's environment is
non-interactive — refuses with `"Prisma Migrate has detected that the
environment is non-interactive, which is not supported"`. If it refuses,
use the fallback already proven in the 4d-1 slice: generate the raw SQL
diff instead —

```powershell
npx prisma migrate diff --from-url "$env:DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script > migration_diff.sql
```

then manually create a timestamped directory under `prisma/migrations/`
(format `YYYYMMDDHHMMSS_leg_scoped_assignments/migration.sql`) and use
that diff's exact constraint/index names as the basis for Step 4 below,
applying via `prisma migrate deploy` in Step 5 instead of `migrate dev`.
Either path is acceptable — the requirement is the resulting schema and
data, not the tool invocation.

- [ ] **Step 4: Hand-edit the migration for data-preserving sequencing**

Open the generated migration file. Ensure table creation and the fan-out
data copy happen **before** `trip_person_assignments` is dropped. The
required shape:

```sql
CREATE TABLE "leg_person_assignments" (
  "id" SERIAL PRIMARY KEY,
  "leg_id" TEXT NOT NULL,
  "person_id" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "commercial_flight_eta" TIMESTAMP(3),
  "hotel" TEXT
);

-- Fan out each existing trip-wide assignment to every leg of that trip.
INSERT INTO "leg_person_assignments" ("leg_id", "person_id", "role", "commercial_flight_eta", "hotel")
SELECT l."leg_id", tpa."person_id", tpa."role", tpa."commercial_flight_eta", tpa."hotel"
FROM "trip_person_assignments" tpa
JOIN "legs" l ON l."trip_id" = tpa."trip_id";

CREATE UNIQUE INDEX "leg_person_assignments_leg_id_person_id_key" ON "leg_person_assignments"("leg_id", "person_id");
CREATE INDEX "leg_person_assignments_leg_id_idx" ON "leg_person_assignments"("leg_id");
CREATE INDEX "leg_person_assignments_person_id_idx" ON "leg_person_assignments"("person_id");

ALTER TABLE "leg_person_assignments" ADD CONSTRAINT "leg_person_assignments_leg_id_fkey" FOREIGN KEY ("leg_id") REFERENCES "legs"("leg_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "leg_person_assignments" ADD CONSTRAINT "leg_person_assignments_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("person_id") ON DELETE CASCADE ON UPDATE CASCADE;

DROP TABLE "trip_person_assignments";
```

(Exact auto-generated constraint/index names may differ slightly — merge
this required shape into the generated file rather than replacing it
wholesale if most statements are already correct. The one non-negotiable
rule: the `INSERT ... SELECT` must run while `trip_person_assignments`
still exists, before its `DROP TABLE`.)

- [ ] **Step 5: Apply the migration**

Run: `npm run prisma:migrate -- --name leg_scoped_assignments` (same name
— Prisma picks up the already-created, now-edited migration directory).
If Step 3 used the fallback path instead, run `npx prisma migrate deploy`.
Expected: exits 0.

- [ ] **Step 6: Verify data was preserved**

First, record the pre-migration baseline (run this *before* Step 3 if
possible; otherwise use `git`-independent judgment — this project has no
version control, so if this step runs after Step 5, cross-check counts
against Task 1's own migration output/logs instead):

```powershell
docker exec jetflow_api_postgres psql -U jetflow -d jetflow -c "SELECT count(*) FROM leg_person_assignments;"
docker exec jetflow_api_postgres psql -U jetflow -d jetflow -c "SELECT count(*) FROM trips;"
docker exec jetflow_api_postgres psql -U jetflow -d jetflow -c "SELECT t.trip_id, count(l.leg_id) AS leg_count FROM trips t JOIN legs l ON l.trip_id = t.trip_id GROUP BY t.trip_id;"
```

Expected: `leg_person_assignments` row count equals `sum(old
trip_person_assignments row count for trip X * leg count of trip X)` —
i.e., every trip that had N assigned people now has N assignment rows on
*each* of its legs. Spot-check one trip with more than one leg: same
person, same role, appears once per leg.

- [ ] **Step 7: Snapshot (no git commit)**

---

### Task 2: Backend — `PersonsService`/`Controller` rework, `TripsService.sheet()`

**Files:**
- Modify: `src/server/modules/persons/dto/assign-person.dto.ts`
- Create: `src/server/modules/persons/dto/assign-all-legs.dto.ts`
- Modify: `src/server/modules/persons/persons.service.ts`
- Modify: `src/server/modules/persons/persons.controller.ts`
- Modify: `src/server/modules/trips/trips.service.ts`

**Interfaces:**
- Consumes: `LegPersonAssignment` Prisma model from Task 1.
- Produces: `GET /persons?legId=X` (`TripPersonView`-shaped rows), `GET /persons?tripId=X` (rows with `legId/legSeq/legDepIcao/legArrIcao` added), `POST /persons/:personId/assign` (body now `legId`), `DELETE /persons/:personId/assign/:legId`, `POST /persons/:personId/assign-all-legs`, `GET /persons/:personId/assignments` (now leg-level rows with denormalized trip context).

- [ ] **Step 1: Rewrite `assign-person.dto.ts`**

Replace the full file:

```typescript
import { IsDateString, IsIn, IsOptional, IsString } from 'class-validator';
import { PERSON_ROLES } from './create-person.dto';

export class AssignPersonDto {
  @IsString()
  legId!: string;

  @IsIn(PERSON_ROLES)
  role!: (typeof PERSON_ROLES)[number];

  @IsOptional()
  @IsString()
  hotel?: string;

  @IsOptional()
  @IsDateString()
  commercialFlightEta?: string;

  @IsOptional()
  @IsString()
  user?: string;
}
```

- [ ] **Step 2: Create `assign-all-legs.dto.ts`**

`src/server/modules/persons/dto/assign-all-legs.dto.ts`:

```typescript
import { IsDateString, IsIn, IsOptional, IsString } from 'class-validator';
import { PERSON_ROLES } from './create-person.dto';

export class AssignAllLegsDto {
  @IsString()
  tripId!: string;

  @IsIn(PERSON_ROLES)
  role!: (typeof PERSON_ROLES)[number];

  @IsOptional()
  @IsString()
  hotel?: string;

  @IsOptional()
  @IsDateString()
  commercialFlightEta?: string;

  @IsOptional()
  @IsString()
  user?: string;
}
```

- [ ] **Step 3: Rewrite `persons.service.ts`**

Replace the full file:

```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreatePersonDto } from './dto/create-person.dto';
import { UpdatePersonDto } from './dto/update-person.dto';
import { AssignPersonDto } from './dto/assign-person.dto';
import { AssignAllLegsDto } from './dto/assign-all-legs.dto';

@Injectable()
export class PersonsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll(params: { legId?: string; tripId?: string }) {
    const { legId, tripId } = params;
    if (legId) {
      const assignments = await this.prisma.legPersonAssignment.findMany({
        where: { legId },
        include: { person: true },
      });
      return assignments.map((a) => ({
        ...a.person, role: a.role, commercialFlightEta: a.commercialFlightEta, hotel: a.hotel,
      }));
    }
    if (tripId) {
      const assignments = await this.prisma.legPersonAssignment.findMany({
        where: { leg: { tripId } },
        include: { person: true, leg: { select: { legId: true, seq: true, depIcao: true, arrIcao: true } } },
        orderBy: { leg: { seq: 'asc' } },
      });
      return assignments.map((a) => ({
        ...a.person, role: a.role, commercialFlightEta: a.commercialFlightEta, hotel: a.hotel,
        legId: a.leg.legId, legSeq: a.leg.seq, legDepIcao: a.leg.depIcao, legArrIcao: a.leg.arrIcao,
      }));
    }
    return this.prisma.person.findMany();
  }

  async findOne(personId: string) {
    const person = await this.prisma.person.findUnique({ where: { personId } });
    if (!person) throw new NotFoundException(`Person ${personId} not found`);
    return person;
  }

  async create(dto: CreatePersonDto) {
    const user = dto.user || 'SYSTEM';
    const { user: _user, medicalValidUntil, passportExpiryDate, passportDateOfBirth, ...rest } = dto;
    const person = await this.prisma.person.create({
      data: {
        ...rest,
        medicalValidUntil: medicalValidUntil ? new Date(medicalValidUntil) : undefined,
        passportExpiryDate: passportExpiryDate ? new Date(passportExpiryDate) : undefined,
        passportDateOfBirth: passportDateOfBirth ? new Date(passportDateOfBirth) : undefined,
      },
    });
    await this.audit.log(user, 'Person', person.personId, 'Created', '', person.personId);
    return person;
  }

  async update(personId: string, dto: UpdatePersonDto) {
    const before = await this.findOne(personId);
    const user = dto.user || 'SYSTEM';
    const { user: _user, medicalValidUntil, passportExpiryDate, passportDateOfBirth, ...rest } = dto;
    const person = await this.prisma.person.update({
      where: { personId },
      data: {
        ...rest,
        medicalValidUntil: medicalValidUntil ? new Date(medicalValidUntil) : undefined,
        passportExpiryDate: passportExpiryDate ? new Date(passportExpiryDate) : undefined,
        passportDateOfBirth: passportDateOfBirth ? new Date(passportDateOfBirth) : undefined,
      },
    });
    await this.audit.logDiff(user, 'Person', personId, before as unknown as Record<string, unknown>, person as unknown as Record<string, unknown>);
    return person;
  }

  async remove(personId: string, user = 'SYSTEM') {
    await this.findOne(personId);
    await this.prisma.person.delete({ where: { personId } });
    await this.audit.log(user, 'Person', personId, 'Deleted', personId, '');
    return { personId, deleted: true };
  }

  async assign(personId: string, dto: AssignPersonDto) {
    await this.findOne(personId);
    const user = dto.user || 'SYSTEM';
    const assignment = await this.prisma.legPersonAssignment.upsert({
      where: { legId_personId: { legId: dto.legId, personId } },
      create: {
        legId: dto.legId,
        personId,
        role: dto.role,
        hotel: dto.hotel,
        commercialFlightEta: dto.commercialFlightEta ? new Date(dto.commercialFlightEta) : null,
      },
      update: {
        role: dto.role,
        hotel: dto.hotel,
        commercialFlightEta: dto.commercialFlightEta ? new Date(dto.commercialFlightEta) : null,
      },
    });
    await this.audit.log(user, 'LegPersonAssignment', `${dto.legId}:${personId}`, 'Assigned', '', dto.role);
    return assignment;
  }

  async unassign(personId: string, legId: string, user = 'SYSTEM') {
    await this.prisma.legPersonAssignment.delete({ where: { legId_personId: { legId, personId } } });
    await this.audit.log(user, 'LegPersonAssignment', `${legId}:${personId}`, 'Unassigned', '', '');
    return { personId, legId, unassigned: true };
  }

  async assignAllLegs(personId: string, dto: AssignAllLegsDto) {
    await this.findOne(personId);
    const user = dto.user || 'SYSTEM';
    const legs = await this.prisma.leg.findMany({ where: { tripId: dto.tripId }, select: { legId: true } });
    const eta = dto.commercialFlightEta ? new Date(dto.commercialFlightEta) : null;
    await this.prisma.$transaction(
      legs.map((leg) => this.prisma.legPersonAssignment.upsert({
        where: { legId_personId: { legId: leg.legId, personId } },
        create: { legId: leg.legId, personId, role: dto.role, hotel: dto.hotel, commercialFlightEta: eta },
        update: { role: dto.role, hotel: dto.hotel, commercialFlightEta: eta },
      }))
    );
    await this.audit.log(user, 'LegPersonAssignment', `${dto.tripId}:${personId}`, 'AssignedAllLegs', '', dto.role);
    return { personId, tripId: dto.tripId, legCount: legs.length, assigned: true };
  }

  async findAssignments(personId: string) {
    await this.findOne(personId);
    const assignments = await this.prisma.legPersonAssignment.findMany({
      where: { personId },
      include: {
        leg: {
          select: {
            legId: true, seq: true, depIcao: true, arrIcao: true,
            trip: { select: { tripId: true, client: true, registration: true, status: true, createdZ: true } },
          },
        },
      },
      orderBy: [{ leg: { trip: { createdZ: 'desc' } } }, { leg: { seq: 'asc' } }],
    });
    return assignments.map((a) => ({
      legId: a.leg.legId, legSeq: a.leg.seq, depIcao: a.leg.depIcao, arrIcao: a.leg.arrIcao,
      role: a.role, commercialFlightEta: a.commercialFlightEta, hotel: a.hotel,
      trip: a.leg.trip,
    }));
  }
}
```

- [ ] **Step 4: Rewrite `persons.controller.ts`**

Replace the full file:

```typescript
import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { PersonsService } from './persons.service';
import { CreatePersonDto } from './dto/create-person.dto';
import { UpdatePersonDto } from './dto/update-person.dto';
import { AssignPersonDto } from './dto/assign-person.dto';
import { AssignAllLegsDto } from './dto/assign-all-legs.dto';

@Controller('persons')
export class PersonsController {
  constructor(private readonly persons: PersonsService) {}

  @Get()
  findAll(@Query('legId') legId?: string, @Query('tripId') tripId?: string) {
    return this.persons.findAll({ legId, tripId });
  }

  @Post(':personId/assign')
  assign(@Param('personId') personId: string, @Body() dto: AssignPersonDto) {
    return this.persons.assign(personId, dto);
  }

  @Delete(':personId/assign/:legId')
  unassign(@Param('personId') personId: string, @Param('legId') legId: string, @Query('user') user?: string) {
    return this.persons.unassign(personId, legId, user);
  }

  @Post(':personId/assign-all-legs')
  assignAllLegs(@Param('personId') personId: string, @Body() dto: AssignAllLegsDto) {
    return this.persons.assignAllLegs(personId, dto);
  }

  @Get(':personId/assignments')
  findAssignments(@Param('personId') personId: string) {
    return this.persons.findAssignments(personId);
  }

  @Get(':personId')
  findOne(@Param('personId') personId: string) {
    return this.persons.findOne(personId);
  }

  @Post()
  create(@Body() dto: CreatePersonDto) {
    return this.persons.create(dto);
  }

  @Patch(':personId')
  update(@Param('personId') personId: string, @Body() dto: UpdatePersonDto) {
    return this.persons.update(personId, dto);
  }

  @Delete(':personId')
  remove(@Param('personId') personId: string, @Query('user') user?: string) {
    return this.persons.remove(personId, user);
  }
}
```

(Route order matters: `:personId/assign`, `:personId/assign/:legId`,
`:personId/assign-all-legs`, and `:personId/assignments` must all be
declared before the bare `:personId` route so Nest doesn't try to match
`assign`/`assign-all-legs`/`assignments` as a `:personId` value — the
file above already orders them correctly.)

- [ ] **Step 5: Rewrite `TripsService.sheet()`**

In `src/server/modules/trips/trips.service.ts`, replace the `sheet`
method:

```typescript
  // Full trip sheet: trip + legs + stops + services + persons + docs + comms.
  async sheet(tripId: string) {
    const trip = await this.prisma.trip.findUnique({
      where: { tripId },
      include: {
        legs: { orderBy: { seq: 'asc' } },
        stops: true,
        services: true,
        assignments: { include: { person: true } },
        docs: true,
        comms: { orderBy: { timestampZ: 'desc' } },
      },
    });
    if (!trip) throw new NotFoundException(`Trip ${tripId} not found`);
    // Flatten assignment + person into the shape callers of this route
    // expect under `persons` — each entry carries the roster identity
    // fields plus this trip's role/hotel/commercialFlightEta, same merge
    // PersonsService.findAll(tripId) performs.
    const { assignments, ...rest } = trip;
    return {
      ...rest,
      persons: assignments.map((a) => ({ ...a.person, role: a.role, commercialFlightEta: a.commercialFlightEta, hotel: a.hotel })),
    };
  }
```

with:

```typescript
  // Full trip sheet: trip + legs (each carrying its own leg-scoped
  // persons) + stops + services + docs + comms.
  async sheet(tripId: string) {
    const trip = await this.prisma.trip.findUnique({
      where: { tripId },
      include: {
        legs: { orderBy: { seq: 'asc' }, include: { assignments: { include: { person: true } } } },
        stops: true,
        services: true,
        docs: true,
        comms: { orderBy: { timestampZ: 'desc' } },
      },
    });
    if (!trip) throw new NotFoundException(`Trip ${tripId} not found`);
    const legs = trip.legs.map(({ assignments, ...leg }) => ({
      ...leg,
      persons: assignments.map((a) => ({ ...a.person, role: a.role, commercialFlightEta: a.commercialFlightEta, hotel: a.hotel })),
    }));
    const { legs: _legs, ...rest } = trip;
    return { ...rest, legs };
  }
```

(This route has no current frontend caller — `dataStore.ts`'s
`getTripSheet`, reworked in Task 3, aggregates independently via separate
REST calls — but it is real, reachable server code and must compile and
return a correct shape.)

- [ ] **Step 6: Verify — build**

Run: `npm run build:server`. Expect 0 exit.

- [ ] **Step 7: Snapshot (no git commit)**

---

### Task 3: Frontend — `types.ts`, `dataStore.ts`

**Files:**
- Modify: `src/client/data/types.ts`
- Modify: `src/client/lib/dataStore.ts`

**Interfaces:**
- Consumes: `GET /persons?legId=`/`?tripId=`, `POST /persons/:id/assign`, `DELETE /persons/:id/assign/:legId`, `POST /persons/:id/assign-all-legs`, `GET /persons/:id/assignments` from Task 2.
- Produces: `getPersonsForLeg(legId): Promise<TripPersonView[]>`, `getPersonsForTrip(tripId): Promise<TripLegPersonView[]>`, `dedupeToTripPersonView(rows): TripPersonView[]`, `assignPersonToLeg(personId, data)`, `unassignPersonFromLeg(personId, legId)`, `assignPersonToAllLegs(personId, data)`, `getPersonAssignments(personId): Promise<PersonAssignment[]>` (new leg-aware shape), `getTripSheet(tripId): Promise<TripSheet | null>` (new `TripSheet` shape).

- [ ] **Step 1: Add `TripLegPersonView` and `LegWithPersons` to `types.ts`**

In `src/client/data/types.ts`, `TripPersonView` stays exactly as it is
today (do not modify it). Add these two new interfaces after it:

```typescript
// One row per (person, leg) — the trip-wide register: CREW & PAX REGISTER
// tab, the Composer's no-leg-selected fallback, and the raw shape behind
// PersonDetail's per-trip grouping.
export interface TripLegPersonView extends TripPersonView {
  LegID: string;
  LegSeq: number;
  LegDepICAO: string;
  LegArrICAO: string;
}

// Used only by TripSheet.legs — a leg plus its own roster.
export interface LegWithPersons extends Leg {
  persons: TripPersonView[];
}
```

- [ ] **Step 2: Read the current `dataStore.ts` Person/TripSheet block first**

Search for `export interface TripSheet`, `function mapTripPersonFromApi`,
`getPersonsForTrip`, `assignPersonToTrip`, `unassignPersonFromTrip`,
`getPersonAssignments`, `getTripSheet` in `dataStore.ts` — confirm exact
current text before replacing (line numbers may have shifted since this
plan was written).

- [ ] **Step 3: Replace `TripSheet`**

```typescript
export interface TripSheet {
  trip: Trip;
  legs: LegWithPersons[];
  stops: Stop[];
  services: Service[];
  comms: Comm[];
  persons: TripLegPersonView[];
  docs: DocAttachment[];
}
```

Add `TripLegPersonView`, `LegWithPersons` to the existing `import type {
... } from '@/data/types';` line at the top of `dataStore.ts`.

- [ ] **Step 4: Replace the assignment functions**

Replace `mapTripPersonFromApi`, `getPersonsForTrip`, `assignPersonToTrip`,
`unassignPersonFromTrip`, and the `PersonAssignment` interface +
`getPersonAssignments` function, with:

```typescript
function mapTripPersonFromApi(p: any): TripPersonView {
  return { ...mapPersonFromApi(p), Role: p.role, CommercialFlightETA: p.commercialFlightEta ?? undefined, Hotel: p.hotel ?? undefined };
}

function mapTripLegPersonFromApi(p: any): TripLegPersonView {
  return {
    ...mapTripPersonFromApi(p),
    LegID: p.legId,
    LegSeq: p.legSeq,
    LegDepICAO: p.legDepIcao,
    LegArrICAO: p.legArrIcao,
  };
}

export async function getPersonsForLeg(legId: string): Promise<TripPersonView[]> {
  const rows = await apiJson<any[]>(`/persons?legId=${encodeURIComponent(legId)}`);
  return rows.map(mapTripPersonFromApi);
}

export async function getPersonsForTrip(tripId: string): Promise<TripLegPersonView[]> {
  const rows = await apiJson<any[]>(`/persons?tripId=${encodeURIComponent(tripId)}`);
  return rows.map(mapTripLegPersonFromApi);
}

// Dedupe a trip-wide (person, leg) register down to one row per person —
// used only where a single leg isn't selected (ComposerPage's "Leg
// (optional)" = None). First-leg-wins for role/hotel/ETA display.
export function dedupeToTripPersonView(rows: TripLegPersonView[]): TripPersonView[] {
  const seen = new Set<string>();
  const result: TripPersonView[] = [];
  for (const row of rows) {
    if (seen.has(row.PersonID)) continue;
    seen.add(row.PersonID);
    result.push(row);
  }
  return result;
}

export async function assignPersonToLeg(
  personId: string,
  data: { legId: string; role: string; hotel?: string; commercialFlightEta?: string },
  user = currentUser()
): Promise<void> {
  await apiJson(`/persons/${personId}/assign`, { method: 'POST', body: JSON.stringify({ ...data, user }) });
}

export async function unassignPersonFromLeg(personId: string, legId: string, user = currentUser()): Promise<void> {
  await apiJson(`/persons/${personId}/assign/${legId}?user=${encodeURIComponent(user)}`, { method: 'DELETE' });
}

export async function assignPersonToAllLegs(
  personId: string,
  data: { tripId: string; role: string; hotel?: string; commercialFlightEta?: string },
  user = currentUser()
): Promise<void> {
  await apiJson(`/persons/${personId}/assign-all-legs`, { method: 'POST', body: JSON.stringify({ ...data, user }) });
}

export interface PersonAssignment {
  LegID: string;
  LegSeq: number;
  DepICAO: string;
  ArrICAO: string;
  TripID: string;
  Role: PersonRole;
  CommercialFlightETA?: string;
  Hotel?: string;
  TripClient: string;
  TripRegistration?: string;
  TripStatus: TripStatus;
  TripCreatedZ: string;
}

export async function getPersonAssignments(personId: string): Promise<PersonAssignment[]> {
  const rows = await apiJson<any[]>(`/persons/${personId}/assignments`);
  return rows.map((a: any) => ({
    LegID: a.legId,
    LegSeq: a.legSeq,
    DepICAO: a.depIcao,
    ArrICAO: a.arrIcao,
    TripID: a.trip.tripId,
    Role: a.role,
    CommercialFlightETA: a.commercialFlightEta ?? undefined,
    Hotel: a.hotel ?? undefined,
    TripClient: a.trip.client,
    TripRegistration: a.trip.registration ?? undefined,
    TripStatus: a.trip.status,
    TripCreatedZ: a.trip.createdZ,
  }));
}
```

(`PersonAssignment`/`getPersonAssignments` already exist in `dataStore.ts`
today with a trip-level shape — this replaces both in place, same export
names, new leg-aware shape. `PersonRole`, `TripStatus` are already
imported from `@/data/types` in this file for other functions — confirm,
add if missing.)

- [ ] **Step 5: Rewrite `getTripSheet`**

```typescript
export async function getTripSheet(tripId: string): Promise<TripSheet | null> {
  const trip = await getTrip(tripId);
  if (!trip) return null;
  const [legs, stops, services, comms, docs, persons] = await Promise.all([
    getLegsForTrip(tripId),
    getStopsForTrip(tripId),
    getServicesForTrip(tripId),
    getCommsForTrip(tripId),
    getDocsForTrip(tripId),
    getPersonsForTrip(tripId),
  ]);
  const legsWithPersons: LegWithPersons[] = await Promise.all(
    legs.map(async (leg) => ({ ...leg, persons: await getPersonsForLeg(leg.LegID) }))
  );
  return { trip, legs: legsWithPersons, stops, services, comms, persons, docs };
}
```

- [ ] **Step 6: Verify**

Run: `npx tsc -p tsconfig.client.json`. `dataStore.ts` itself never errors
(`// @ts-nocheck`); expect new errors in `TripDetail.tsx`, `PersonDetail.tsx`,
and `ComposerPage.tsx` (Tasks 4–6 fix them).

- [ ] **Step 7: Snapshot (no git commit)**

---

### Task 4: Frontend — `TripDetail.tsx`

**Files:**
- Modify: `src/client/pages/TripDetail.tsx`

**Interfaces:**
- Consumes: `LegWithPersons`, `TripLegPersonView` (types), `getPersonRoster`, `assignPersonToLeg`, `assignPersonToAllLegs`, `unassignPersonFromLeg` from Task 3.

- [ ] **Step 1: Add new imports**

At the top of the file:
- Add `Person`, `PersonRole` to the existing `import type { Service, Leg, Trip, Comm, AuditEntry, ServiceStatus, ServiceType, ServiceTypeDef, LegPurposeDef, TripPersonView, TripStatus } from '@/data/types';` line.
- Add `getPersonRoster`, `assignPersonToLeg`, `assignPersonToAllLegs`, `unassignPersonFromLeg` to the existing `@/lib/dataStore` import list (the multi-line `import { getTripSheet, getAirport, ... } from '@/lib/dataStore';` block).
- Add: `import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';`
- Add: `import { Label } from '@/components/ui/label';`
- Add: `import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';`

(`Combobox`, `Button`, `Input`, `Trash2`, `Plus`, `useMemo`, `useEffect`
are already imported in this file — no changes needed for those.)

- [ ] **Step 2: Change the `LegEditor` call site to pass leg-scoped persons**

Find the `<LegEditor ... />` invocation inside the main `TripDetail`
component's legs-rendering block (it currently passes `persons={persons}`
where `persons` is the top-level trip-wide destructure). Change that one
prop to:

```tsx
persons={leg.persons}
```

Do not change `LegEditor`'s own prop type (`persons: TripPersonView[]`)
— it already means "whatever list the caller passes for this leg"; only
the caller's source changes, from trip-wide `persons` to `leg.persons`
(now available because `sheet.legs` is `LegWithPersons[]`).

- [ ] **Step 3: Add local state to `LegEditor` for the add-person dialog**

Inside the `LegEditor` function component, alongside its other
`useState` declarations:

```typescript
const [addPersonOpen, setAddPersonOpen] = useState(false);
```

- [ ] **Step 4: Replace the "LEG CREW & PAX MANIFEST" block**

Find this block (inside `LegEditor`'s JSX, after the LEG BILLING/AUDIT
TRAIL/LEG MESSAGES grid):

```tsx
<div className="mt-4 rounded-md border p-3">
  <div className="mb-2 flex items-center justify-between">
    <div>
      <div className="text-xs font-semibold">LEG CREW & PAX MANIFEST</div>
      <div className="text-[11px] text-muted-foreground">{draft.PaxCount} PAX · {draft.CrewCount} CREW · PURPOSE: {(draft.Purpose || 'Not specified').toUpperCase()}</div>
    </div>
    <Badge variant="outline">{persons.length} TRIP PEOPLE</Badge>
  </div>
  {persons.length === 0 ? <div className="text-xs text-muted-foreground">No crew or passenger records have been added to this trip.</div> : (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {persons.map((person) => (
        <div key={person.PersonID} className="rounded border p-2 text-xs">
          <div className="font-semibold">{person.Name}</div>
          <div className="text-muted-foreground">{person.Role.toUpperCase()}</div>
          {(person.PassportNationality || person.LicenceNumber) && <div className="mt-1 text-muted-foreground">{person.PassportNationality || person.LicenceNumber}</div>}
        </div>
      ))}
    </div>
  )}
</div>
```

Replace it with:

```tsx
<div className="mt-4 rounded-md border p-3">
  <div className="mb-2 flex items-center justify-between">
    <div>
      <div className="text-xs font-semibold">LEG CREW & PAX MANIFEST</div>
      <div className="text-[11px] text-muted-foreground">{draft.PaxCount} PAX · {draft.CrewCount} CREW · PURPOSE: {(draft.Purpose || 'Not specified').toUpperCase()}</div>
    </div>
    <div className="flex items-center gap-2">
      <Badge variant="outline">{persons.length} ON THIS LEG</Badge>
      <Button size="sm" variant="outline" disabled={!canEdit} onClick={() => canEdit && setAddPersonOpen(true)}>
        <Plus className="h-4 w-4" /> ADD PERSON
      </Button>
    </div>
  </div>
  {persons.length === 0 ? <div className="text-xs text-muted-foreground">No crew or passenger records have been added to this leg.</div> : (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {persons.map((person) => (
        <div key={person.PersonID} className="rounded border p-2 text-xs">
          <div className="flex items-center justify-between">
            <div className="font-semibold">{person.Name}</div>
            {canEdit && (
              <button
                type="button"
                className="text-muted-foreground hover:text-red-600"
                onClick={async () => { await unassignPersonFromLeg(person.PersonID, leg.LegID); await onSaved(); }}
                title="Remove from this leg"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="text-muted-foreground">{person.Role.toUpperCase()}</div>
          {(person.PassportNationality || person.LicenceNumber) && <div className="mt-1 text-muted-foreground">{person.PassportNationality || person.LicenceNumber}</div>}
        </div>
      ))}
    </div>
  )}
  {addPersonOpen && (
    <AddManifestPersonDialog
      legId={leg.LegID}
      tripId={leg.TripID}
      existingPersonIds={persons.map((p) => p.PersonID)}
      open={addPersonOpen}
      onClose={() => setAddPersonOpen(false)}
      onSaved={onSaved}
    />
  )}
</div>
```

- [ ] **Step 5: Add the `AddManifestPersonDialog` component**

Add this new function component in the same file, immediately before the
`LegEditor` function definition:

```tsx
function AddManifestPersonDialog({ legId, tripId, existingPersonIds, open, onClose, onSaved }: {
  legId: string;
  tripId: string;
  existingPersonIds: string[];
  open: boolean;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const [roster, setRoster] = useState<Person[]>([]);
  const [personId, setPersonId] = useState('');
  const [role, setRole] = useState<PersonRole>('Pax');
  const [hotel, setHotel] = useState('');
  const [applyToAllLegs, setApplyToAllLegs] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getPersonRoster().then((all) => setRoster(all.filter((p) => !existingPersonIds.includes(p.PersonID))));
  }, [existingPersonIds]);

  const rosterOptions = useMemo(
    () => roster.map((p) => ({ value: p.PersonID, label: p.LicenceNumber ? `${p.Name} (${p.LicenceNumber})` : p.Name })),
    [roster]
  );

  const handleSave = async () => {
    if (!personId) return;
    setSaving(true);
    try {
      if (applyToAllLegs) {
        await assignPersonToAllLegs(personId, { tripId, role, hotel: hotel || undefined });
      } else {
        await assignPersonToLeg(personId, { legId, role, hotel: hotel || undefined });
      }
      await onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Add Person to Leg</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Person</Label>
            <Combobox options={rosterOptions} value={personId} onChange={setPersonId} placeholder="Search roster..." />
          </div>
          <div className="space-y-1">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as PersonRole)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(['PIC', 'SIC', 'FA', 'Mechanic', 'Engineer', 'Medical Staff', 'Other', 'Pax', 'VIP', 'Principal'] as PersonRole[]).map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Hotel (optional)</Label>
            <Input value={hotel} onChange={(e) => setHotel(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={applyToAllLegs} onChange={(e) => setApplyToAllLegs(e.target.checked)} />
            Apply to all legs of this trip
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={!personId || saving}>{saving ? 'Saving…' : 'Add'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 6: Add a LEG column to the CREW & PAX REGISTER tab**

Find the `TabsContent value="crew"` block's table. Replace the
`TableHeader`/`TableBody`:

```tsx
<TableHeader>
  <TableRow>
    <TableHead>NAME</TableHead>
    <TableHead>ROLE</TableHead>
    <TableHead>CONTACT</TableHead>
    <TableHead>DETAILS</TableHead>
  </TableRow>
</TableHeader>
<TableBody>
  {persons.map(p => (
    <TableRow key={p.PersonID}>
      <TableCell className="font-medium">{p.Name?.toUpperCase()}</TableCell>
      <TableCell>
        <Badge variant="outline">{p.Role}</Badge>
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {p.Phone && <div>{p.Phone}</div>}
        {p.Email && <div>{p.Email}</div>}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {p.Hotel && <div>HOTEL: {p.Hotel?.toUpperCase()}</div>}
        {p.CommercialFlightETA && <div>FLT ETA: {formatZ(p.CommercialFlightETA)}</div>}
      </TableCell>
    </TableRow>
  ))}
</TableBody>
```

with:

```tsx
<TableHeader>
  <TableRow>
    <TableHead>NAME</TableHead>
    <TableHead>LEG</TableHead>
    <TableHead>ROLE</TableHead>
    <TableHead>CONTACT</TableHead>
    <TableHead>DETAILS</TableHead>
  </TableRow>
</TableHeader>
<TableBody>
  {persons.map(p => (
    <TableRow key={`${p.PersonID}-${p.LegID}`}>
      <TableCell className="font-medium">{p.Name?.toUpperCase()}</TableCell>
      <TableCell className="text-xs text-muted-foreground">LEG {p.LegSeq}: {p.LegDepICAO} → {p.LegArrICAO}</TableCell>
      <TableCell>
        <Badge variant="outline">{p.Role}</Badge>
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {p.Phone && <div>{p.Phone}</div>}
        {p.Email && <div>{p.Email}</div>}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {p.Hotel && <div>HOTEL: {p.Hotel?.toUpperCase()}</div>}
        {p.CommercialFlightETA && <div>FLT ETA: {formatZ(p.CommercialFlightETA)}</div>}
      </TableCell>
    </TableRow>
  ))}
</TableBody>
```

(The top-level `persons` in this tab is now `TripLegPersonView[]` — the
ROLE SUMMARY card immediately below, which does
`persons.filter(p => p.Role === role).length`, needs no code change; its
counts now reflect leg-assignments per role rather than distinct people,
which is intentional per the spec.)

- [ ] **Step 7: Verify — build**

Run: `npm run build:client`. Expect 0 exit, 0 errors.

- [ ] **Step 8: Verify — manual browser check**

Log in, open a trip with more than one leg and existing crew (post-
migration, every leg should show that trip's former crew identically).
On one leg: ADD PERSON with an existing roster person, role "FO",
"Apply to all legs" unchecked — confirm they appear only on that leg's
manifest. Remove a person from one leg — confirm they disappear from
that leg but remain on others (if previously assigned to multiple).
ADD PERSON with "Apply to all legs" checked — confirm they appear on
every leg. Open the CREW & PAX REGISTER tab — confirm the LEG column
shows correctly and a person on 2 legs appears as 2 rows.

- [ ] **Step 9: Snapshot (no git commit)**

---

### Task 5: Frontend — `PersonDetail.tsx`

**Files:**
- Modify: `src/client/pages/admin/PersonDetail.tsx`

**Interfaces:**
- Consumes: `PersonAssignment` (new leg-aware shape), `getLegsForTrip`, `assignPersonToLeg`, `assignPersonToAllLegs`, `unassignPersonFromLeg` from Task 3 / this repo's existing `dataStore.ts`.

- [ ] **Step 1: Update imports**

Replace `unassignPersonFromTrip, assignPersonToTrip, getTrips,` in the
existing `@/lib/dataStore` import block with
`unassignPersonFromLeg, assignPersonToLeg, assignPersonToAllLegs, getTrips, getLegsForTrip,`.
Add `useMemo` to the existing `import { useState, useEffect } from 'react';`
line. Add `Leg` to the existing `import type { Person, PersonRating, PersonRole, DocAttachment, Trip } from '@/data/types';` line.

- [ ] **Step 2: Rewrite `AssignedTripsCard`**

Replace the full function:

```tsx
function AssignedTripsCard({ personId, assignments, onChanged }: {
  personId: string; assignments: PersonAssignment[]; onChanged: () => Promise<void> | void;
}) {
  const { canEdit } = useAuth();
  const [assignOpen, setAssignOpen] = useState(false);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base font-semibold flex items-center gap-2"><Plane className="h-4 w-4" /> ASSIGNED TRIPS</CardTitle>
        <Button size="sm" disabled={!canEdit} onClick={() => canEdit && setAssignOpen(true)}><Plus className="h-4 w-4" /> ASSIGN TO TRIP</Button>
      </CardHeader>
      <CardContent className="p-0">
        {assignments.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">NOT ASSIGNED TO ANY TRIP</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>TRIP</TableHead>
                <TableHead>CLIENT</TableHead>
                <TableHead>REG</TableHead>
                <TableHead>ROLE</TableHead>
                <TableHead>STATUS</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assignments.map((a) => (
                <TableRow key={a.TripID}>
                  <TableCell><Link to={`/trips/${a.TripID}`} className="font-mono text-xs text-primary hover:underline">{a.TripID}</Link></TableCell>
                  <TableCell className="text-sm">{a.TripClient}</TableCell>
                  <TableCell className="text-sm">{a.TripRegistration || '—'}</TableCell>
                  <TableCell><Badge variant="secondary">{a.Role}</Badge></TableCell>
                  <TableCell className="text-sm">{a.TripStatus}</TableCell>
                  <TableCell>
                    <Button size="sm" variant="outline" disabled={!canEdit} onClick={async () => { if (!canEdit) return; await unassignPersonFromTrip(personId, a.TripID); await onChanged(); }}>UNASSIGN</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
      {assignOpen && (
        <AssignTripDialog
          personId={personId}
          open={assignOpen}
          onClose={() => setAssignOpen(false)}
          onSaved={onChanged}
          existingTripIds={assignments.map((a) => a.TripID)}
        />
      )}
    </Card>
  );
}
```

with:

```tsx
function AssignedTripsCard({ personId, assignments, onChanged }: {
  personId: string; assignments: PersonAssignment[]; onChanged: () => Promise<void> | void;
}) {
  const { canEdit } = useAuth();
  const [assignOpen, setAssignOpen] = useState(false);
  const byTrip = useMemo(() => {
    const groups = new Map<string, PersonAssignment[]>();
    for (const a of assignments) {
      const list = groups.get(a.TripID) ?? [];
      list.push(a);
      groups.set(a.TripID, list);
    }
    return Array.from(groups.entries());
  }, [assignments]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base font-semibold flex items-center gap-2"><Plane className="h-4 w-4" /> ASSIGNED TRIPS</CardTitle>
        <Button size="sm" disabled={!canEdit} onClick={() => canEdit && setAssignOpen(true)}><Plus className="h-4 w-4" /> ASSIGN TO TRIP</Button>
      </CardHeader>
      <CardContent className="p-0">
        {byTrip.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">NOT ASSIGNED TO ANY TRIP</div>
        ) : byTrip.map(([tripId, rows]) => (
          <div key={tripId} className="border-b last:border-b-0">
            <div className="flex items-center justify-between bg-muted/30 px-3 py-2">
              <Link to={`/trips/${tripId}`} className="font-mono text-xs text-primary hover:underline">{tripId}</Link>
              <span className="text-xs text-muted-foreground">{rows[0].TripClient} · {rows[0].TripRegistration || '—'} · {rows[0].TripStatus}</span>
            </div>
            <Table>
              <TableBody>
                {rows.map((a) => (
                  <TableRow key={a.LegID}>
                    <TableCell className="text-xs text-muted-foreground">LEG {a.LegSeq}: {a.DepICAO} → {a.ArrICAO}</TableCell>
                    <TableCell><Badge variant="secondary">{a.Role}</Badge></TableCell>
                    <TableCell>
                      <Button size="sm" variant="outline" disabled={!canEdit} onClick={async () => { if (!canEdit) return; await unassignPersonFromLeg(personId, a.LegID); await onChanged(); }}>UNASSIGN</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ))}
      </CardContent>
      {assignOpen && (
        <AssignTripDialog
          personId={personId}
          open={assignOpen}
          onClose={() => setAssignOpen(false)}
          onSaved={onChanged}
          existingAssignments={assignments}
        />
      )}
    </Card>
  );
}
```

- [ ] **Step 3: Rewrite `AssignTripDialog`**

Replace the full function:

```tsx
function AssignTripDialog({ personId, open, onClose, onSaved, existingTripIds }: {
  personId: string; open: boolean; onClose: () => void; onSaved: () => Promise<void> | void; existingTripIds: string[];
}) {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [tripId, setTripId] = useState('');
  const [role, setRole] = useState<PersonRole>('Pax');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getTrips().then((list) => {
      const available = list.filter((t) => !existingTripIds.includes(t.TripID));
      setTrips(available);
      if (available[0]) setTripId(available[0].TripID);
    });
  }, [existingTripIds]);

  const handleSave = async () => {
    if (!tripId) return;
    setSaving(true);
    try {
      await assignPersonToTrip(personId, { tripId, role });
      await onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Assign to Trip</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Trip</Label>
            <Select value={tripId} onValueChange={setTripId}>
              <SelectTrigger><SelectValue placeholder="Select trip" /></SelectTrigger>
              <SelectContent>
                {trips.map((t) => <SelectItem key={t.TripID} value={t.TripID}>{t.TripID} — {t.Registration}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as PersonRole)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PERSON_ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={!tripId || saving}>{saving ? 'Saving…' : 'Save'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

with:

```tsx
function AssignTripDialog({ personId, open, onClose, onSaved, existingAssignments }: {
  personId: string; open: boolean; onClose: () => void; onSaved: () => Promise<void> | void;
  existingAssignments: PersonAssignment[];
}) {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [tripId, setTripId] = useState('');
  const [legs, setLegs] = useState<Leg[]>([]);
  const [selectedLegIds, setSelectedLegIds] = useState<string[]>([]);
  const [role, setRole] = useState<PersonRole>('Pax');
  const [saving, setSaving] = useState(false);

  useEffect(() => { getTrips().then(setTrips); }, []);

  const alreadyAssignedLegIds = useMemo(
    () => new Set(existingAssignments.filter((a) => a.TripID === tripId).map((a) => a.LegID)),
    [existingAssignments, tripId]
  );

  useEffect(() => {
    if (!tripId) { setLegs([]); setSelectedLegIds([]); return; }
    getLegsForTrip(tripId).then((l) => {
      setLegs(l);
      setSelectedLegIds(l.filter((leg) => !alreadyAssignedLegIds.has(leg.LegID)).map((leg) => leg.LegID));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId]);

  const toggleLeg = (legId: string) => {
    setSelectedLegIds((current) => current.includes(legId) ? current.filter((id) => id !== legId) : [...current, legId]);
  };

  const handleSave = async () => {
    if (!tripId || selectedLegIds.length === 0) return;
    setSaving(true);
    try {
      if (selectedLegIds.length === legs.length) {
        await assignPersonToAllLegs(personId, { tripId, role });
      } else {
        await Promise.all(selectedLegIds.map((legId) => assignPersonToLeg(personId, { legId, role })));
      }
      await onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Assign to Trip</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Trip</Label>
            <Select value={tripId} onValueChange={setTripId}>
              <SelectTrigger><SelectValue placeholder="Select trip" /></SelectTrigger>
              <SelectContent>
                {trips.map((t) => <SelectItem key={t.TripID} value={t.TripID}>{t.TripID} — {t.Registration}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {tripId && (
            <div className="space-y-1">
              <Label>Legs</Label>
              <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border p-2">
                {legs.map((leg) => (
                  <label key={leg.LegID} className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={selectedLegIds.includes(leg.LegID)}
                      disabled={alreadyAssignedLegIds.has(leg.LegID)}
                      onChange={() => toggleLeg(leg.LegID)}
                    />
                    LEG {leg.Seq}: {leg.DepICAO} → {leg.ArrICAO}
                    {alreadyAssignedLegIds.has(leg.LegID) && <span className="text-muted-foreground"> (already assigned)</span>}
                  </label>
                ))}
              </div>
            </div>
          )}
          <div className="space-y-1">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as PersonRole)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PERSON_ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={!tripId || selectedLegIds.length === 0 || saving}>{saving ? 'Saving…' : 'Save'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

(`existingTripIds` is removed as a prop — replaced by
`existingAssignments`, since a person can now be re-opened against a trip
they're already partially assigned to, to add the remaining legs. The
trip `<Select>` no longer filters out trips the person already has some
assignment on. `PERSON_ROLES` is this file's existing local constant —
unchanged.)

- [ ] **Step 4: Verify — build**

Run: `npx tsc -p tsconfig.client.json`. Expect the `PersonDetail.tsx`
errors from Task 3 Step 6 to be gone.

- [ ] **Step 5: Verify — manual browser check**

Open a person who is assigned to a multi-leg trip. Confirm ASSIGNED TRIPS
groups their legs under one trip block, each leg row showing its own
role. Click ASSIGN TO TRIP, pick a trip they're already partially on —
confirm already-assigned legs show checked+disabled with
"(already assigned)". Select a trip they're not on at all, leave all legs
checked (the default), Save — confirm `assign-all-legs` path is used
(check Network tab or server logs) and they appear on every leg. Uncheck
one leg before saving on a different trip — confirm the per-leg
`Promise.all` path is used instead and only the checked legs get an
assignment.

- [ ] **Step 6: Snapshot (no git commit)**

---

### Task 6: Frontend — `ComposerPage.tsx`

**Files:**
- Modify: `src/client/pages/ComposerPage.tsx`

**Interfaces:**
- Consumes: `getPersonsForLeg`, `getPersonsForTrip` (new return shape), `dedupeToTripPersonView`, `TripLegPersonView` from Task 3.

- [ ] **Step 1: Update imports**

Add `getPersonsForLeg`, `dedupeToTripPersonView` to the existing
`@/lib/dataStore` import list. Add `TripLegPersonView` to the existing
`import type { Comm, Trip, Leg, Service, TripPersonView } from '@/data/types';`
line.

- [ ] **Step 2: Replace the trip-level data-loading effect and add a leg-level one**

Replace:

```typescript
const [persons, setPersons] = useState<TripPersonView[]>([]);

useEffect(() => {
  getTrips().then(setTrips);
}, []);

useEffect(() => {
  let cancelled = false;
  if (!tripId) { setLegs([]); setTripServices([]); setComms([]); setPersons([]); return; }
  Promise.all([getLegsForTrip(tripId), getServices(), getCommsForTrip(tripId), getPersonsForTrip(tripId)]).then(([l, s, c, p]) => {
    if (!cancelled) { setLegs(l); setTripServices(s.filter((svc) => svc.TripID === tripId)); setComms(c); setPersons(p); }
  });
  return () => { cancelled = true; };
}, [tripId]);
```

with:

```typescript
const [tripPersonRegister, setTripPersonRegister] = useState<TripLegPersonView[]>([]);
const [persons, setPersons] = useState<TripPersonView[]>([]);

useEffect(() => {
  getTrips().then(setTrips);
}, []);

useEffect(() => {
  let cancelled = false;
  if (!tripId) { setLegs([]); setTripServices([]); setComms([]); setTripPersonRegister([]); return; }
  Promise.all([getLegsForTrip(tripId), getServices(), getCommsForTrip(tripId), getPersonsForTrip(tripId)]).then(([l, s, c, p]) => {
    if (!cancelled) { setLegs(l); setTripServices(s.filter((svc) => svc.TripID === tripId)); setComms(c); setTripPersonRegister(p); }
  });
  return () => { cancelled = true; };
}, [tripId]);

useEffect(() => {
  let cancelled = false;
  if (legId) {
    getPersonsForLeg(legId).then((p) => { if (!cancelled) setPersons(p); });
  } else {
    setPersons(dedupeToTripPersonView(tripPersonRegister));
  }
  return () => { cancelled = true; };
}, [legId, tripPersonRegister]);
```

(`handleCompose`'s call to `generateEmail(..., persons, ...)` is
unchanged — it already reads whichever `persons` state is current.)

- [ ] **Step 3: Verify — build**

Run: `npm run build:client`. Expect 0 exit, 0 errors.

- [ ] **Step 4: Verify — manual browser check**

In ComposerPage: select a trip that has a person with different roles on
different legs (from Task 4/5's test setup, or create one). Leave
Leg = None, compose an email — confirm PIC/crew/pax resolve via the
deduped trip-wide fallback (some role shown, no crash). Select a specific
leg where that person's role differs — confirm the composed email uses
that leg's role.

- [ ] **Step 5: Snapshot (no git commit)**

---

### Task 7: Full-stack build + end-to-end verification (controller-performed)

Per the pattern established in every prior plan in this repo: this task
produces no diff of its own, so it's performed directly by the controller
rather than dispatched to an implementer, and has no task review of its
own.

- [ ] **Step 1:** `npm run build` — exits 0 (verify `build:server` and
  `build:client` separately if the Windows Prisma-EPERM file-lock issue
  recurs — `Get-Process node | Stop-Process -Force` before rebuilding,
  same as every prior slice).
- [ ] **Step 2:** Start the stack (`npm run start:prod`). Re-run Task 1
  Step 6's `psql` verification queries against the final running state to
  reconfirm the migration's data preservation.
- [ ] **Step 3:** Live walkthrough via the API (curl/Invoke-RestMethod
  with a locally-minted bearer token if browser login isn't available,
  same fallback used for every prior slice):
  - `GET /persons?legId=<leg with demo crew>` — confirm merged
    `TripPersonView` rows.
  - `GET /persons?tripId=<same trip>` — confirm one row per (person, leg)
    with `legId`/`legSeq`/`legDepIcao`/`legArrIcao` present.
  - Create a roster person, `POST /persons/:id/assign` to one leg, confirm
    they appear in that leg's `GET /persons?legId=`, not in a sibling
    leg's.
  - `POST /persons/:id/assign-all-legs` for a multi-leg trip, confirm they
    now appear in every leg's `GET /persons?legId=`.
  - `DELETE /persons/:id/assign/:legId` for one leg only, confirm they
    drop from that leg but remain on the others.
  - `GET /persons/:id/assignments`, confirm leg-level rows with trip
    context.
  - Delete a leg that has assignments, confirm only that leg's
    `LegPersonAssignment` rows are cascade-removed (query the other legs'
    assignment counts before/after).
  - And, if possible, the full browser flows from Tasks 4–6's manual
    checks.
- [ ] **Step 4:** Report: build status, which checks passed, any
  deviations ledgered as rulings.

---
