# VIQ Person Roster Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split `Person` into a trip-independent roster record (identity, licence, medical, passport) plus `PersonRating` (one-to-many ratings) and `TripPersonAssignment` (per-trip role/hotel/ETA), with a migration that preserves existing demo data, backend CRUD for all three, and the minimal frontend adaptation to keep `TripDetail.tsx`'s crew/pax manifest and `AdminAssets.tsx`'s Person tab working.

**Architecture:** Three Prisma models replace the single trip-coupled `Person`. `PersonsService.findAll(tripId?)` returns either the full roster or, when `tripId` is given, that trip's assigned people with roster + assignment fields merged into one object — chosen specifically so `TripDetail.tsx` needs no JSX changes, only a type/data-source swap (`TripPersonView`). New `PersonRatingsModule`. `dataStore.ts`'s Person functions get the same async/API-backed rewire every other resource in this project has already been through, plus new assignment/rating functions.

**Tech Stack:** No new dependencies. Reuses this project's established async-migration pattern (Trips/Legs/Stops/Services/Comms/Docs already went through it) and its established hand-edited-migration pattern (4a's `--create-only` + manual SQL edit, here run in the *preserve* direction rather than the *delete* direction).

**Spec:** `docs/superpowers/specs/2026-08-25-viq-person-roster-design.md`

## Global Constraints

- Do NOT `git commit` any of this work — explicit user instruction, carried over from every prior sub-project in this session.
- The migration must **preserve** existing `Person` data (copy `tripId`/`role`/`hotel`/`commercialFlightEta` into `TripPersonAssignment` rows before dropping those columns from `persons`) — do not delete-and-recreate like 4a's migration did (that was correct there only because those rows had no real file behind them; these represent real demo crew/pax data).
- `PersonRating` stays one-to-many — never flatten onto `Person` as fixed columns.
- `role`/`hotel`/`commercialFlightEta` belong on `TripPersonAssignment` only — never push them back onto `Person`.
- `GET /persons?tripId=X` keeps its existing URL contract; only its internal query/join logic changes.
- Do not redesign `AdminAssets.tsx`'s Person tab beyond keeping it functional against the new API — the real redesign is a later sub-project (4d-2).
- `dataStore.ts` has `// @ts-nocheck`. `TripDetail.tsx` and `AdminAssets.tsx` do NOT — real type-checking applies.

---

### Task 1: Backend — schema split, data-preserving migration

**Files:**
- Modify: `prisma/schema.prisma` (`Person`, `Trip` models; new `PersonRating`, `TripPersonAssignment`)
- Create: a new Prisma migration (via `npm run prisma:migrate --create-only`, hand-edited)

**Interfaces:**
- Produces: `Person` (roster fields only), `PersonRating`, `TripPersonAssignment` Prisma models.

- [x] **Step 1: Replace the `Person` model**

In `prisma/schema.prisma`, replace the existing `Person` model:

```prisma
model Person {
  personId            String    @id @map("person_id")
  tripId              String    @map("trip_id")
  name                String
  role                String
  licenceNumber       String?   @map("licence_number")
  medicalValidUntil   DateTime? @map("medical_valid_until")
  passportNationality String?   @map("passport_nationality")
  phone               String?
  email               String?
  commercialFlightEta DateTime? @map("commercial_flight_eta")
  hotel               String?

  trip Trip @relation(fields: [tripId], references: [tripId], onDelete: Cascade)
  docs DocAttachment[]

  @@index([tripId])
  @@map("persons")
}
```

with:

```prisma
model Person {
  personId               String    @id @map("person_id")
  name                   String
  defaultRole            String?   @map("default_role")
  licenceNumber          String?   @map("licence_number")
  medicalValidUntil      DateTime? @map("medical_valid_until")
  medicalClass           String?   @map("medical_class")
  medicalExaminer        String?   @map("medical_examiner")
  passportNumber         String?   @map("passport_number")
  passportNationality    String?   @map("passport_nationality")
  passportIssuingCountry String?   @map("passport_issuing_country")
  passportExpiryDate     DateTime? @map("passport_expiry_date")
  passportDateOfBirth    DateTime? @map("passport_date_of_birth")
  passportSex            String?   @map("passport_sex")
  phone                  String?
  email                  String?

  ratings     PersonRating[]
  assignments TripPersonAssignment[]
  docs        DocAttachment[]

  @@map("persons")
}

model PersonRating {
  id               Int       @id @default(autoincrement())
  personId         String    @map("person_id")
  ratingType       String    @map("rating_type")
  issuingAuthority String?   @map("issuing_authority")
  issueDate        DateTime? @map("issue_date")
  expiryDate       DateTime? @map("expiry_date")
  notes            String?

  person Person @relation(fields: [personId], references: [personId], onDelete: Cascade)

  @@index([personId])
  @@map("person_ratings")
}

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

- [x] **Step 2: Add the reverse relation on `Trip`**

Find `model Trip` and add one line near its other reverse-relation fields
(e.g. next to `services Service[]` or similar — read the model first to
place it consistently):

```prisma
  assignments TripPersonAssignment[]
```

- [x] **Step 3: Generate the migration without applying it**

Run: `npm run prisma:migrate -- --name split_person_roster_and_assignments --create-only`
Expected: Prisma reports it cannot execute the migration as-is (dropping
`persons.trip_id`/`role`/`commercial_flight_eta`/`hotel` while rows exist)
and writes the migration file without applying it — same shape of warning
seen in 4a's migration, but this time the fix is to preserve data via
`INSERT...SELECT`, not delete it.

- [x] **Step 4: Hand-edit the migration to preserve data**

Open the generated `prisma/migrations/<timestamp>_split_person_roster_and_assignments/migration.sql`.
Reorder/insert statements so table creation and data copy happen **before**
any column is dropped from `persons`. The required shape:

```sql
-- 1. Create the new assignment table first.
CREATE TABLE "trip_person_assignments" (
  "id" SERIAL PRIMARY KEY,
  "trip_id" TEXT NOT NULL,
  "person_id" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "commercial_flight_eta" TIMESTAMP(3),
  "hotel" TEXT
);

-- 2. Copy every existing person's trip/role/hotel/ETA into it before
--    those columns are dropped from persons.
INSERT INTO "trip_person_assignments" ("trip_id", "person_id", "role", "commercial_flight_eta", "hotel")
SELECT "trip_id", "person_id", "role", "commercial_flight_eta", "hotel" FROM "persons";

-- 3. Create the ratings table (no existing data to migrate into it).
CREATE TABLE "person_ratings" (
  "id" SERIAL PRIMARY KEY,
  "person_id" TEXT NOT NULL,
  "rating_type" TEXT NOT NULL,
  "issuing_authority" TEXT,
  "issue_date" TIMESTAMP(3),
  "expiry_date" TIMESTAMP(3),
  "notes" TEXT
);

-- 4. Now it's safe to restructure persons — the data that lived in the
--    dropped columns already exists in trip_person_assignments.
ALTER TABLE "persons"
  DROP COLUMN "trip_id",
  DROP COLUMN "role",
  DROP COLUMN "commercial_flight_eta",
  DROP COLUMN "hotel",
  ADD COLUMN "default_role" TEXT,
  ADD COLUMN "medical_class" TEXT,
  ADD COLUMN "medical_examiner" TEXT,
  ADD COLUMN "passport_number" TEXT,
  ADD COLUMN "passport_issuing_country" TEXT,
  ADD COLUMN "passport_expiry_date" TIMESTAMP(3),
  ADD COLUMN "passport_date_of_birth" TIMESTAMP(3),
  ADD COLUMN "passport_sex" TEXT;

-- 5. Indexes and foreign keys.
CREATE INDEX "trip_person_assignments_trip_id_idx" ON "trip_person_assignments"("trip_id");
CREATE INDEX "trip_person_assignments_person_id_idx" ON "trip_person_assignments"("person_id");
CREATE UNIQUE INDEX "trip_person_assignments_trip_id_person_id_key" ON "trip_person_assignments"("trip_id", "person_id");
CREATE INDEX "person_ratings_person_id_idx" ON "person_ratings"("person_id");

ALTER TABLE "trip_person_assignments" ADD CONSTRAINT "trip_person_assignments_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("trip_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "trip_person_assignments" ADD CONSTRAINT "trip_person_assignments_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("person_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "person_ratings" ADD CONSTRAINT "person_ratings_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("person_id") ON DELETE CASCADE ON UPDATE CASCADE;
```

(The auto-generated file's exact constraint/index names and statement
order will differ — merge this required shape into it rather than
replacing it wholesale if Prisma already generated most of these
statements correctly; the one non-negotiable rule is data copy before
column drop.)

- [x] **Step 5: Apply the migration**

Run: `npm run prisma:migrate -- --name split_person_roster_and_assignments`
(same name — Prisma will pick up the already-created, now-edited migration
directory and apply it). Expected: exits 0.

- [x] **Step 6: Verify data was preserved**

```powershell
docker exec jetflow_api_postgres psql -U jetflow -d jetflow -c "SELECT count(*) FROM persons;"
docker exec jetflow_api_postgres psql -U jetflow -d jetflow -c "SELECT count(*) FROM trip_person_assignments;"
```

Expected: both counts equal the pre-migration `persons` row count (every
person kept their identity row, and gained exactly one assignment row for
the trip they were on).

- [x] **Step 7: Snapshot (no git commit)**

---

### Task 2: Backend — `PersonsService`/`Controller` rework, `PersonRatingsModule`

**Files:**
- Modify: `src/server/modules/persons/dto/create-person.dto.ts`
- Modify: `src/server/modules/persons/dto/update-person.dto.ts` (verify it still just wraps create — likely no change needed, confirm)
- Create: `src/server/modules/persons/dto/assign-person.dto.ts`
- Modify: `src/server/modules/persons/persons.service.ts`
- Modify: `src/server/modules/persons/persons.controller.ts`
- Create: `src/server/modules/person-ratings/person-ratings.module.ts`, `.controller.ts`, `.service.ts`, `dto/create-rating.dto.ts`, `dto/update-rating.dto.ts`
- Modify: `src/server/app.module.ts`

**Interfaces:**
- Produces: `GET /persons` (roster) / `GET /persons?tripId=X` (merged trip view). `POST/PATCH/DELETE /persons`. `POST /persons/:personId/assign`, `DELETE /persons/:personId/assign/:tripId`. `GET /persons/:personId/ratings`, `POST/PATCH/DELETE /ratings`.

- [x] **Step 1: Rewrite `create-person.dto.ts`**

Replace the full file:

```typescript
import { IsDateString, IsEmail, IsIn, IsOptional, IsString } from 'class-validator';

const PERSON_ROLES = [
  'PIC', 'SIC', 'FA', 'Mechanic', 'Engineer', 'Medical Staff', 'Other', 'Pax', 'VIP', 'Principal',
] as const;

export class CreatePersonDto {
  @IsString()
  personId!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsIn(PERSON_ROLES)
  defaultRole?: (typeof PERSON_ROLES)[number];

  @IsOptional()
  @IsString()
  licenceNumber?: string;

  @IsOptional()
  @IsDateString()
  medicalValidUntil?: string;

  @IsOptional()
  @IsString()
  medicalClass?: string;

  @IsOptional()
  @IsString()
  medicalExaminer?: string;

  @IsOptional()
  @IsString()
  passportNumber?: string;

  @IsOptional()
  @IsString()
  passportNationality?: string;

  @IsOptional()
  @IsString()
  passportIssuingCountry?: string;

  @IsOptional()
  @IsDateString()
  passportExpiryDate?: string;

  @IsOptional()
  @IsDateString()
  passportDateOfBirth?: string;

  @IsOptional()
  @IsString()
  passportSex?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  user?: string;
}

export { PERSON_ROLES };
```

- [x] **Step 2: Confirm `update-person.dto.ts` needs no change**

Read it — it's almost certainly `PartialType(OmitType(CreatePersonDto,
['personId']))`, which continues to work unchanged against the new
`CreatePersonDto`. If it references `tripId` explicitly anywhere, fix
that; otherwise this step is a no-op (say so explicitly).

- [x] **Step 3: Create `assign-person.dto.ts`**

`src/server/modules/persons/dto/assign-person.dto.ts`:

```typescript
import { IsDateString, IsIn, IsOptional, IsString } from 'class-validator';
import { PERSON_ROLES } from './create-person.dto';

export class AssignPersonDto {
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

- [x] **Step 4: Rewrite `persons.service.ts`**

Replace the full file:

```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreatePersonDto } from './dto/create-person.dto';
import { UpdatePersonDto } from './dto/update-person.dto';
import { AssignPersonDto } from './dto/assign-person.dto';

@Injectable()
export class PersonsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll(tripId?: string) {
    if (!tripId) {
      return this.prisma.person.findMany();
    }
    const assignments = await this.prisma.tripPersonAssignment.findMany({
      where: { tripId },
      include: { person: true },
    });
    return assignments.map((a) => ({
      ...a.person,
      role: a.role,
      commercialFlightEta: a.commercialFlightEta,
      hotel: a.hotel,
    }));
  }

  async findOne(personId: string) {
    const person = await this.prisma.person.findUnique({ where: { personId } });
    if (!person) throw new NotFoundException(`Person ${personId} not found`);
    return person;
  }

  async create(dto: CreatePersonDto) {
    const user = dto.user || 'SYSTEM';
    const { user: _user, ...data } = dto;
    const person = await this.prisma.person.create({ data });
    await this.audit.log(user, 'Person', person.personId, 'Created', '', person.personId);
    return person;
  }

  async update(personId: string, dto: UpdatePersonDto) {
    const before = await this.findOne(personId);
    const user = dto.user || 'SYSTEM';
    const { user: _user, ...data } = dto;
    const person = await this.prisma.person.update({ where: { personId }, data });
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
    const assignment = await this.prisma.tripPersonAssignment.upsert({
      where: { tripId_personId: { tripId: dto.tripId, personId } },
      create: {
        tripId: dto.tripId,
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
    await this.audit.log(user, 'TripPersonAssignment', `${dto.tripId}:${personId}`, 'Assigned', '', dto.role);
    return assignment;
  }

  async unassign(personId: string, tripId: string, user = 'SYSTEM') {
    await this.prisma.tripPersonAssignment.delete({ where: { tripId_personId: { tripId, personId } } });
    await this.audit.log(user, 'TripPersonAssignment', `${tripId}:${personId}`, 'Unassigned', '', '');
    return { personId, tripId, unassigned: true };
  }
}
```

- [x] **Step 5: Rewrite `persons.controller.ts`**

Replace the full file:

```typescript
import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { PersonsService } from './persons.service';
import { CreatePersonDto } from './dto/create-person.dto';
import { UpdatePersonDto } from './dto/update-person.dto';
import { AssignPersonDto } from './dto/assign-person.dto';

@Controller('persons')
export class PersonsController {
  constructor(private readonly persons: PersonsService) {}

  @Get()
  findAll(@Query('tripId') tripId?: string) {
    return this.persons.findAll(tripId);
  }

  @Post(':personId/assign')
  assign(@Param('personId') personId: string, @Body() dto: AssignPersonDto) {
    return this.persons.assign(personId, dto);
  }

  @Delete(':personId/assign/:tripId')
  unassign(@Param('personId') personId: string, @Param('tripId') tripId: string, @Query('user') user?: string) {
    return this.persons.unassign(personId, tripId, user);
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

(Route order matters: `:personId/assign` and `:personId/assign/:tripId`
must be declared before the bare `:personId` routes so Nest doesn't try to
match `assign` as a `:personId` value — same reasoning already applied to
`DocsController` in the 4a/4b/4c plans.)

- [x] **Step 6: Create the `PersonRatingsModule`**

`src/server/modules/person-ratings/dto/create-rating.dto.ts`:

```typescript
import { IsDateString, IsOptional, IsString } from 'class-validator';

export class CreateRatingDto {
  @IsString()
  personId!: string;

  @IsString()
  ratingType!: string;

  @IsOptional()
  @IsString()
  issuingAuthority?: string;

  @IsOptional()
  @IsDateString()
  issueDate?: string;

  @IsOptional()
  @IsDateString()
  expiryDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
```

`src/server/modules/person-ratings/dto/update-rating.dto.ts`:

```typescript
import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateRatingDto } from './create-rating.dto';

export class UpdateRatingDto extends PartialType(OmitType(CreateRatingDto, ['personId'] as const)) {}
```

`src/server/modules/person-ratings/person-ratings.service.ts`:

```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateRatingDto } from './dto/create-rating.dto';
import { UpdateRatingDto } from './dto/update-rating.dto';

@Injectable()
export class PersonRatingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  findForPerson(personId: string) {
    return this.prisma.personRating.findMany({ where: { personId } });
  }

  async findOne(id: number) {
    const rating = await this.prisma.personRating.findUnique({ where: { id } });
    if (!rating) throw new NotFoundException(`Rating ${id} not found`);
    return rating;
  }

  async create(dto: CreateRatingDto, user = 'SYSTEM') {
    const rating = await this.prisma.personRating.create({ data: dto });
    await this.audit.log(user, 'PersonRating', String(rating.id), 'Created', '', rating.ratingType);
    return rating;
  }

  async update(id: number, dto: UpdateRatingDto, user = 'SYSTEM') {
    await this.findOne(id);
    const rating = await this.prisma.personRating.update({ where: { id }, data: dto });
    await this.audit.log(user, 'PersonRating', String(id), 'Updated', '', rating.ratingType);
    return rating;
  }

  async remove(id: number, user = 'SYSTEM') {
    await this.findOne(id);
    await this.prisma.personRating.delete({ where: { id } });
    await this.audit.log(user, 'PersonRating', String(id), 'Deleted', String(id), '');
    return { id, deleted: true };
  }
}
```

`src/server/modules/person-ratings/person-ratings.controller.ts`:

```typescript
import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { PersonRatingsService } from './person-ratings.service';
import { CreateRatingDto } from './dto/create-rating.dto';
import { UpdateRatingDto } from './dto/update-rating.dto';

@Controller()
export class PersonRatingsController {
  constructor(private readonly ratings: PersonRatingsService) {}

  @Get('persons/:personId/ratings')
  findForPerson(@Param('personId') personId: string) {
    return this.ratings.findForPerson(personId);
  }

  @Post('ratings')
  create(@Body() dto: CreateRatingDto) {
    return this.ratings.create(dto);
  }

  @Patch('ratings/:id')
  update(@Param('id') id: string, @Body() dto: UpdateRatingDto) {
    return this.ratings.update(Number(id), dto);
  }

  @Delete('ratings/:id')
  remove(@Param('id') id: string) {
    return this.ratings.remove(Number(id));
  }
}
```

(`@Controller()` with no base path, since this controller's two route
groups — `persons/:personId/ratings` and `ratings/:id` — don't share a
common prefix; each route's full path is spelled out explicitly.)

`src/server/modules/person-ratings/person-ratings.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { PersonRatingsService } from './person-ratings.service';
import { PersonRatingsController } from './person-ratings.controller';

@Module({
  controllers: [PersonRatingsController],
  providers: [PersonRatingsService],
  exports: [PersonRatingsService],
})
export class PersonRatingsModule {}
```

- [x] **Step 7: Register `PersonRatingsModule` in `app.module.ts`**

Add the import and register it in the `imports` array, alongside
`PersonsModule`.

- [x] **Step 8: Verify — build**

Run: `npx nest build`. Expect 0 exit.

- [x] **Step 9: Snapshot (no git commit)**

---

### Task 3: Frontend — `types.ts`, `dataStore.ts`

**Files:**
- Modify: `src/client/data/types.ts`
- Modify: `src/client/lib/dataStore.ts`

**Interfaces:**
- Produces: `getPersonRoster()`, `getPersonsForTrip(tripId): Promise<TripPersonView[]>`, `savePerson(person): Promise<Person>`, `assignPersonToTrip(personId, data)`, `unassignPersonFromTrip(personId, tripId)`, `deletePerson(personId)`, `getPersonRatings(personId)`, `savePersonRating(rating)`, `deletePersonRating(id)`.

- [x] **Step 1: Replace the `Person` interface, add `PersonRating`/`TripPersonView`**

In `src/client/data/types.ts`, replace the existing `Person` interface:

```typescript
export interface Person {
  PersonID: string;
  TripID: string;
  Name: string;
  Role: PersonRole;
  LicenceNumber?: string;
  MedicalValidUntil?: string;
  PassportNationality?: string;
  Phone?: string;
  Email?: string;
  CommercialFlightETA?: string;
  Hotel?: string;
}
```

with:

```typescript
export interface Person {
  PersonID: string;
  Name: string;
  DefaultRole?: PersonRole;
  LicenceNumber?: string;
  MedicalValidUntil?: string;
  MedicalClass?: string;
  MedicalExaminer?: string;
  PassportNumber?: string;
  PassportNationality?: string;
  PassportIssuingCountry?: string;
  PassportExpiryDate?: string;
  PassportDateOfBirth?: string;
  PassportSex?: string;
  Phone?: string;
  Email?: string;
}

export interface PersonRating {
  ID: number;
  PersonID: string;
  RatingType: string;
  IssuingAuthority?: string;
  IssueDate?: string;
  ExpiryDate?: string;
  Notes?: string;
}

// Roster identity + one trip's assignment specifics, merged — this is what
// TripDetail.tsx actually renders, so its existing JSX needs no changes.
export interface TripPersonView extends Person {
  Role: PersonRole;
  CommercialFlightETA?: string;
  Hotel?: string;
}
```

- [x] **Step 2: Update `TripSheet.persons`**

Find `export interface TripSheet` (in `dataStore.ts`) and change
`persons: Person[];` to `persons: TripPersonView[];`. Add `TripPersonView`
to the existing `import type { ... } from '@/data/types';` line.

- [x] **Step 3: Read the current Person CRUD block first**

Search for `function getPersons` in `dataStore.ts` — confirm the exact
current text before replacing (last touched before this session; line
numbers have shifted).

- [x] **Step 4: Replace the Person CRUD block**

```typescript
function mapPersonFromApi(p: any): Person {
  return {
    PersonID: p.personId,
    Name: p.name,
    DefaultRole: p.defaultRole ?? undefined,
    LicenceNumber: p.licenceNumber ?? undefined,
    MedicalValidUntil: p.medicalValidUntil ?? undefined,
    MedicalClass: p.medicalClass ?? undefined,
    MedicalExaminer: p.medicalExaminer ?? undefined,
    PassportNumber: p.passportNumber ?? undefined,
    PassportNationality: p.passportNationality ?? undefined,
    PassportIssuingCountry: p.passportIssuingCountry ?? undefined,
    PassportExpiryDate: p.passportExpiryDate ?? undefined,
    PassportDateOfBirth: p.passportDateOfBirth ?? undefined,
    PassportSex: p.passportSex ?? undefined,
    Phone: p.phone ?? undefined,
    Email: p.email ?? undefined,
  };
}

function mapTripPersonFromApi(p: any): TripPersonView {
  return { ...mapPersonFromApi(p), Role: p.role, CommercialFlightETA: p.commercialFlightEta ?? undefined, Hotel: p.hotel ?? undefined };
}

export async function getPersonRoster(): Promise<Person[]> {
  const rows = await apiJson<any[]>('/persons');
  return rows.map(mapPersonFromApi);
}

export async function getPersonsForTrip(tripId: string): Promise<TripPersonView[]> {
  const rows = await apiJson<any[]>(`/persons?tripId=${encodeURIComponent(tripId)}`);
  return rows.map(mapTripPersonFromApi);
}

export async function savePerson(person: Person, user = 'SYSTEM'): Promise<Person> {
  const roster = await getPersonRoster();
  const exists = roster.some((p) => p.PersonID === person.PersonID);
  const body = JSON.stringify({
    personId: person.PersonID, name: person.Name, defaultRole: person.DefaultRole,
    licenceNumber: person.LicenceNumber, medicalValidUntil: person.MedicalValidUntil,
    medicalClass: person.MedicalClass, medicalExaminer: person.MedicalExaminer,
    passportNumber: person.PassportNumber, passportNationality: person.PassportNationality,
    passportIssuingCountry: person.PassportIssuingCountry, passportExpiryDate: person.PassportExpiryDate,
    passportDateOfBirth: person.PassportDateOfBirth, passportSex: person.PassportSex,
    phone: person.Phone, email: person.Email, user,
  });
  const row = exists
    ? await apiJson<any>(`/persons/${person.PersonID}`, { method: 'PATCH', body })
    : await apiJson<any>('/persons', { method: 'POST', body });
  return mapPersonFromApi(row);
}

export async function assignPersonToTrip(
  personId: string,
  data: { tripId: string; role: string; hotel?: string; commercialFlightEta?: string },
  user = 'SYSTEM'
): Promise<void> {
  await apiJson(`/persons/${personId}/assign`, { method: 'POST', body: JSON.stringify({ ...data, user }) });
}

export async function unassignPersonFromTrip(personId: string, tripId: string, user = 'SYSTEM'): Promise<void> {
  await apiJson(`/persons/${personId}/assign/${tripId}?user=${encodeURIComponent(user)}`, { method: 'DELETE' });
}

export async function deletePerson(personId: string, user = 'SYSTEM'): Promise<void> {
  await apiJson(`/persons/${personId}?user=${encodeURIComponent(user)}`, { method: 'DELETE' });
}

export async function getPersonRatings(personId: string): Promise<PersonRating[]> {
  const rows = await apiJson<any[]>(`/persons/${personId}/ratings`);
  return rows.map((r: any) => ({
    ID: r.id, PersonID: r.personId, RatingType: r.ratingType, IssuingAuthority: r.issuingAuthority ?? undefined,
    IssueDate: r.issueDate ?? undefined, ExpiryDate: r.expiryDate ?? undefined, Notes: r.notes ?? undefined,
  }));
}

export async function savePersonRating(rating: Omit<PersonRating, 'ID'> & { ID?: number }): Promise<PersonRating> {
  const body = JSON.stringify({
    personId: rating.PersonID, ratingType: rating.RatingType, issuingAuthority: rating.IssuingAuthority,
    issueDate: rating.IssueDate, expiryDate: rating.ExpiryDate, notes: rating.Notes,
  });
  const row = rating.ID
    ? await apiJson<any>(`/ratings/${rating.ID}`, { method: 'PATCH', body })
    : await apiJson<any>('/ratings', { method: 'POST', body });
  return { ID: row.id, PersonID: row.personId, RatingType: row.ratingType, IssuingAuthority: row.issuingAuthority ?? undefined, IssueDate: row.issueDate ?? undefined, ExpiryDate: row.expiryDate ?? undefined, Notes: row.notes ?? undefined };
}

export async function deletePersonRating(id: number): Promise<void> {
  await apiJson(`/ratings/${id}`, { method: 'DELETE' });
}
```

Add `PersonRating`, `TripPersonView` to the existing
`import type { ... } from '@/data/types';` line at the top of the file.

- [x] **Step 5: Fix `getTripSheet`'s unawaited `persons` call**

Find `getTripSheet` — confirm whether `persons: getPersonsForTrip(tripId)`
is still called without `await` inside the returned object (it was, per
the 4a-era investigation). If so, add it to the existing `Promise.all`
batch, same pattern as `docs` was added in the 4a plan:

```typescript
  const [legs, stops, services, comms, docs, persons] = await Promise.all([
    getLegsForTrip(tripId),
    getStopsForTrip(tripId),
    getServicesForTrip(tripId),
    getCommsForTrip(tripId),
    getDocsForTrip(tripId),
    getPersonsForTrip(tripId),
  ]);
  return {
    trip,
    legs,
    stops,
    services,
    comms,
    persons,
    docs,
  };
```

- [x] **Step 6: Fix `exportBackup()`'s two unawaited calls**

Find `export async function exportBackup()`. Replace:

```typescript
export async function exportBackup(): Promise<BackupData> {
  const [trips, legs, stops, services, comms] = await Promise.all([
    getTrips(), getLegs(), getStops(), getServices(), getComms(),
  ]);
  return {
    version: '2.0.0',
    exportedAt: new Date().toISOString(),
    transactions: {
      trips,
      legs,
      stops,
      services,
      comms,
      audit: getAudit(),
      persons: getPersons(),
      docs: getDocs(),
      invoices: getInvoices(),
      settings: getSettings(),
    },
```

with:

```typescript
export async function exportBackup(): Promise<BackupData> {
  const [trips, legs, stops, services, comms, persons, docs] = await Promise.all([
    getTrips(), getLegs(), getStops(), getServices(), getComms(), getPersonRoster(), getDocs(),
  ]);
  return {
    version: '2.0.0',
    exportedAt: new Date().toISOString(),
    transactions: {
      trips,
      legs,
      stops,
      services,
      comms,
      audit: getAudit(),
      persons,
      docs,
      invoices: getInvoices(),
      settings: getSettings(),
    },
```

(Leave the rest of the function — `referenceMeta` and everything after —
untouched. `getInvoices`/`getSettings`/`getAudit` stay outside
`Promise.all` since they're confirmed still synchronous.)

- [x] **Step 7: Verify**

Run: `npx tsc -p tsconfig.client.json`. `dataStore.ts` itself never errors
(`// @ts-nocheck`); expect new errors in `TripDetail.tsx` and
`AdminAssets.tsx` (Task 4 fixes them).

- [x] **Step 8: Snapshot (no git commit)**

---

### Task 4: Frontend — `TripDetail.tsx` and `AdminAssets.tsx`

**Files:**
- Modify: `src/client/pages/TripDetail.tsx`
- Modify: `src/client/pages/admin/AdminAssets.tsx`

**Interfaces:**
- Consumes: `TripPersonView`, `getPersonRoster`, `savePerson`, `assignPersonToTrip`, `deletePerson` from Task 3.

- [x] **Step 1: Update `TripDetail.tsx`'s `Person` type usage**

Search for `Person` in the `import type { ... } from '@/data/types';` line
and in any explicit type annotations on props/state that hold trip crew/
pax data (e.g. `persons: Person[]` in `LegEditor`'s props, if present).
Replace with `TripPersonView` everywhere the value actually comes from
`sheet.persons`/`getPersonsForTrip`. No JSX changes are needed — every
field the existing manifest reads (`.Name`, `.Role`, `.Phone`, `.Email`,
`.Hotel`, `.CommercialFlightETA`, `.PassportNationality`,
`.LicenceNumber`) exists on `TripPersonView`.

- [x] **Step 2: Verify — build**

Run: `npx tsc -p tsconfig.client.json`. Expect the `TripDetail.tsx` errors
from Task 3 Step 7 to be gone; `AdminAssets.tsx` errors remain for this
task's next steps.

- [x] **Step 3: Update `AdminAssets.tsx`'s Person list loading**

Find `const persons = getPersons();` (synchronous). Replace with async
state, matching the established `CommsPage.tsx` fix pattern from the
Comms-migration plan:

```tsx
const [persons, setPersons] = useState<Person[]>([]);
useEffect(() => { getPersonRoster().then(setPersons); }, [refreshKey]);
```

(`refreshKey` is this file's existing force-reload counter — confirm its
exact name by reading the file; the existing `refresh()` function already
calls `setRefreshKey((k) => k + 1)`, this just makes the Person list
actually react to it, same as every other tab in this file already does
via its own `refreshKey`-dependent effect, if present — if `AdminAssets.tsx`
doesn't already use effects keyed on `refreshKey` for other tabs, confirm
the actual existing reload mechanism by reading the file and match it,
rather than assuming.)

- [x] **Step 4: Remove the per-row `Trip:` display**

In the Persons tab's list rendering, remove
`Role: {p.Role} | Trip: {p.TripID}` (or however the current text reads)
down to just the role — a roster person no longer has one `TripID`.
Showing their trips is out of scope for this slice.

- [x] **Step 5: Update `PersonDialog`'s save handler**

Replace the existing `handleSave`:

```typescript
const handleSave = () => {
  if (!name.trim() || !tripId) return;
  savePerson({
    PersonID: person?.PersonID || `PER-${Date.now()}`,
    TripID: tripId,
    Name: name.trim(),
    Role: role,
    Phone: phone.trim() || undefined,
    Email: email.trim() || undefined,
    LicenceNumber: licenceNumber.trim() || undefined,
  });
  onSaved();
  onClose();
};
```

with:

```typescript
const handleSave = async () => {
  if (!name.trim()) return;
  const saved = await savePerson({
    PersonID: person?.PersonID || `PER-${Date.now()}`,
    Name: name.trim(),
    DefaultRole: role,
    Phone: phone.trim() || undefined,
    Email: email.trim() || undefined,
    LicenceNumber: licenceNumber.trim() || undefined,
  });
  if (tripId) {
    await assignPersonToTrip(saved.PersonID, { tripId, role });
  }
  onSaved();
  onClose();
};
```

Update the Save button's `onClick` if it isn't already tolerant of an
async handler (React's `onClick` accepts an async function directly — no
wrapper needed, but confirm the button isn't disabled by a stale
`!tripId` check now that `tripId` is optional; the existing `disabled={!name.trim() || !tripId}` should become `disabled={!name.trim()}`).

- [x] **Step 6: Update the delete call**

Find `onClick={() => { deletePerson(p.PersonID); refresh(); }}` — since
`deletePerson` is now async, update to
`onClick={async () => { await deletePerson(p.PersonID); refresh(); }}`.

- [x] **Step 7: Update imports**

Replace `getPersons, savePerson, deletePerson` in the existing
`@/lib/dataStore` import list with `getPersonRoster, savePerson,
assignPersonToTrip, deletePerson`.

- [x] **Step 8: Verify — build**

Run: `npm run build:client`. Expect 0 exit, 0 errors.

- [x] **Step 9: Verify — manual browser check**

Log in, open a trip that had crew/pax before this migration — confirm the
manifest (both the leg-level card and the CREW & PAX tab) shows the same
people with the same details as before. Open `/admin/assets`'s Persons
tab — confirm the roster loads, Add Person with a trip selected works and
the person shows up in that trip's manifest, editing a person's name
persists, deleting a person removes them from the roster.

- [x] **Step 10: Snapshot (no git commit)**

---

### Task 5: Full-stack build + end-to-end verification (controller-performed)

Per the pattern established in every prior plan in this repo: this task
produces no diff of its own, so it's performed directly by the controller
rather than dispatched to an implementer, and has no task review of its own.

- [x] **Step 1:** `npm run build` — exits 0 (verify `nest build` and
  `build:client` separately if the Windows Prisma-EPERM file-lock issue
  recurs, same as every prior slice).
- [x] **Step 2:** Start the stack. Confirm the migration's data-preservation
  via direct `psql` queries (Task 1 Step 6's checks, re-run against the
  final state).
- [x] **Step 3:** Live walkthrough via the API (curl/Invoke-RestMethod with
  a locally-minted bearer token, same fallback used for every prior slice
  if browser login credentials aren't available): `GET /persons` (roster),
  `GET /persons?tripId=<existing trip>` (merged view matches pre-migration
  data), create a new roster person, assign them to a trip, confirm they
  appear in that trip's `GET /persons?tripId=...`, unassign them, confirm
  they're gone from that trip's list but still in the roster, delete a
  trip with assigned people and confirm the people survive (only their
  assignment row is cascade-deleted), create/update/delete a rating via
  `/ratings`. And, if possible, the browser flow from Task 4 Step 9.
- [x] **Step 4:** Report: build status, which checks passed, any deviations
  ledgered as rulings.

---

## Completion notes (2026-08-25)

**Execution approach**: executed directly by the controller (this
session), same as every prior slice, task by task, verified via build
after each. This was the largest and riskiest slice so far (real data
migration).

**Ruling — migration mechanism changed.** `prisma migrate dev
--create-only` refused to run at all in this non-interactive session this
time (`"Prisma Migrate has detected that the environment is
non-interactive, which is not supported"` — a data-loss confirmation
prompt, distinct from 4a's case where Prisma wrote the migration file
despite a non-interactive warning). Worked around it: generated the raw
SQL diff via `prisma migrate diff --from-url <db> --to-schema-datamodel
prisma/schema.prisma --script` (no interactivity, just a text diff),
manually created the timestamped migration directory, hand-assembled the
final migration.sql (data-preserving `INSERT...SELECT` ordered before the
`DROP COLUMN`s, using the exact constraint/index names from the real
diff), and applied it via `prisma migrate deploy` (designed for exactly
this non-interactive/scripted use case). Verified before and after: 7
`persons` rows in, 7 `persons` + 7 `trip_person_assignments` rows out,
with a `SELECT` spot-check confirming trip_id/role/hotel data landed
correctly per person. This is a mechanism change, not a design change —
the resulting schema and data exactly match what the spec/plan called for.

**Two real bugs found and fixed during Task 5 verification** (both in this
slice's own new code, not pre-existing):
1. `PersonRatingsService.create()`/`.update()` passed `issueDate`/
   `expiryDate` strings straight to Prisma without converting to `Date`
   objects — Prisma's `DateTime` scalar requires a full ISO-8601 datetime
   and rejects a bare `YYYY-MM-DD` (`class-validator`'s `@IsDateString()`
   accepts bare dates as valid, so this passed validation and failed only
   at the Prisma layer, as a 500). Fixed by destructuring those two fields
   out and wrapping them in `new Date(...)` before the Prisma call, same
   pattern already used correctly in `PersonsService.assign()`.
2. `PersonsService.create()`/`.update()` had the identical bug for the
   three new date fields (`medicalValidUntil`, `passportExpiryDate`,
   `passportDateOfBirth`) — inherited from the original file's existing
   `{ ...data }` pass-through pattern, which happened to never get
   exercised with a bare-date string before (the original DTO's only date
   field, `medicalValidUntil`, was seemingly never tested with one either).
   Fixed the same way. Both fixes were caught by actually attempting a
   create/update with real date values during verification, not by
   inspection — confirms the value of the "live walkthrough" verification
   step over trusting the build alone.

**Unplanned fallout fixed beyond the plan's anticipated Task 3/4 scope**
(found via `npx tsc`, not called out explicitly in the plan's task list):
- `src/server/modules/quotes/quotes.service.ts` — `QuotesService.submit()`
  created a `Person` with `tripId`/`role` embedded directly (the atomic
  public-quote-submission transaction). Fixed to create the roster
  `Person` (identity fields only) and a separate `TripPersonAssignment`
  row in the same transaction.
- `src/server/modules/trips/trips.service.ts` — `TripsService.sheet()`
  (the `GET /trips/:tripId/sheet` route; confirmed not called by the
  current frontend, which builds its own trip sheet client-side, but still
  real code that must compile and behave correctly) used `include: {
  persons: true }`, a relation that no longer exists on `Trip`. Fixed to
  `include: { assignments: { include: { person: true } } }` with the
  result flattened into the same merged `persons: [...]` shape
  `PersonsService.findAll(tripId)` produces, so this route's output
  contract is unchanged for any future caller.
- `src/client/lib/emailTemplates.ts` — `generateEmail()` called the
  now-async `getPersonsForTrip()` synchronously to compute PIC/crew/pax
  counts for message bodies, but `generateEmail()` itself is a synchronous
  function called directly inside `useEffect`s in `ComposeDrawer.tsx`/
  `ComposerPage.tsx` (not something to casually make async without
  rippling through both compose flows' UX). Resolved consistently with
  `generateEmail()`'s own existing pattern — it already takes `legs:
  Leg[]` as a caller-supplied parameter rather than fetching legs itself —
  by adding a `persons: TripPersonView[]` parameter the same way, and
  updating both call sites to fetch persons in their existing data-loading
  effects (`ComposeDrawer` via a new `persons` prop threaded from
  `TripDetail.tsx`'s `sheet.persons` through `LegEditor`/
  `ServiceInlineEditor`; `ComposerPage` via a new `persons` state fetched
  alongside its existing `legs`/`services`/`comms` `Promise.all`).
- `src/client/lib/seed-data.ts`'s `persons` array (7 literal objects) —
  same "dead but still typed, still seeded into localStorage by
  `initDataStore()`" situation as `docs` was in 4a. Updated field shape
  (`TripID`/`Role` → dropped/`DefaultRole`) to match the new `Person`
  interface; left as inert pre-seed data per the established precedent
  rather than removed.

**Verified (Tasks 1–5)**:
- `npx nest build` and `npm run build:client` both clean.
- Data preservation confirmed via direct `psql` queries before and after
  the migration (7 → 7/7 split correctly).
- Live API walkthrough covered every scenario the plan named: roster
  fetch, merged trip-view fetch (byte-for-byte match against
  pre-migration per-trip data), create + assign, unassign (person leaves
  the trip view, stays in the roster), **the core architectural
  win** — deleted a trip with an assigned person and confirmed the person
  survived (only the assignment cascade-deleted) — and full ratings CRUD
  (after the date-conversion fix).
- All test artifacts (throwaway person, throwaway trip, throwaway rating)
  deleted after verification; `persons`/`trip_person_assignments`/
  `person_ratings` row counts confirmed back to exactly their
  pre-verification baselines.
- Browser-based manual verification (Task 4 Step 9) was **not**
  performed — no login credentials available to this session, same
  limitation as every prior slice.

**Rulings made**: the migration-mechanism change above (`migrate diff` +
manual apply instead of `migrate dev --create-only`) is the only one —
purely a tooling workaround for this session's non-interactive
environment, with zero effect on the resulting schema or data, verified
identically to what the plan specified.
