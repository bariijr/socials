# VIQ Person Roster Foundation (Sub-project 4d-1 of the document-intelligence initiative)

## Context

4a/4b/4c (file storage, OCR, verify-before-save) are complete. Item 13
asked for Person records carrying passport biodata, medical cert details,
and instrument ratings, with "record will continue staying in the
database" — confirmed with the user during brainstorming to mean a real,
trip-independent personnel roster (the same captain flies many trips; you
don't re-enter their passport every time), not an expanded per-trip
manifest entry. This is a genuine data-model restructuring, split into
three sub-projects:

- **4d-1 (this spec)** — the foundation: schema split, a data-preserving
  migration, backend CRUD, and the minimal frontend adaptation needed to
  keep today's crew/pax manifest and admin "Add Person" flow working
  against the new model.
- 4d-2 — a real Person detail page (biodata/medical/ratings/docs/expiry in
  one place) and a proper roster-management rework of `AdminAssets.tsx`'s
  Person tab (today's flat "one trip per person" list and dialog don't fit
  a roster where one person can have several trip assignments — this spec
  only keeps that tab working, not redesigned).
- 4d-3 — an expiry-monitoring dashboard spanning the whole roster
  (passports, medical certs, ratings, docs all in one place).

**Investigation findings that shape this spec**: `Person` today has
`tripId String` (**required**, `onDelete: Cascade`) — a person cannot
exist independent of one trip, and deleting that trip deletes them. The
frontend's `dataStore.ts` Person functions (`getPersons`, `savePerson`,
`deletePerson`) are still synchronous/localStorage-only — exactly the
"backend module exists, frontend never got its turn" gap already found and
fixed for Docs (4a), so this slice does that same rewire while also
restructuring the schema underneath it. `AdminAssets.tsx`'s `PersonDialog`
is the one existing create/assign UI — it picks a Trip + Name/Role/Phone/
Email/LicenceNumber and saves them as one flat record; this needs to keep
working (create-or-edit a person, optionally assigned to a trip) without a
full redesign, which is 4d-2's job.

Per explicit user instruction (carried over from every prior sub-project in
this session): **do not `git commit` any of this work.**

## Goal

`Person` becomes a trip-independent roster record (identity, licence,
medical, passport fields) that can hold zero, one, or many ratings
(`PersonRating`) and can be assigned to zero, one, or many trips
(`TripPersonAssignment`, carrying the per-trip specifics — role, hotel,
commercial-flight ETA — that don't belong on a reusable identity record).
Deleting a trip no longer deletes the people who flew it; deleting a
roster person removes their assignments/ratings/docs but not the trips
they were on. `TripDetail.tsx`'s crew/pax manifest and `AdminAssets.tsx`'s
Person tab both keep working against the new model, adapted but not
redesigned.

## Design decisions

- **Three tables, not one wide table.** `Person` (roster identity +
  qualifications), `PersonRating` (one-to-many — a person can hold several
  ratings: type ratings, ATPL, instrument rating), `TripPersonAssignment`
  (join table — the per-trip role/hotel/ETA that's fundamentally about
  *this trip*, not the person's permanent identity). Flattening ratings
  onto `Person` would cap a person at a fixed number of ratings; keeping
  `role`/`hotel`/`commercialFlightEta` on `Person` would mean a person's
  "role" is a single global value even though the same person can be PIC
  on one trip and off-duty pax positioning on another.
- **Data-preserving migration, not a wipe.** Unlike 4a's migration (which
  deleted 4 synthetic seed rows with no real file behind them — a
  legitimately different situation), existing `Person` rows here represent
  real demo crew/pax data worth keeping. The migration copies each
  existing row's `(tripId, role, commercialFlightEta, hotel)` into a new
  `TripPersonAssignment` row *before* those columns are dropped from
  `persons` — implemented as hand-edited raw SQL in a
  `--create-only`-generated migration (same mechanism used for 4a's
  migration, different direction: `INSERT ... SELECT` to preserve, not
  `DELETE` to clear).
- **`GET /persons?tripId=X` keeps its existing contract**, but its
  internal meaning changes: with no `tripId`, it returns the full roster;
  with `tripId`, it returns that trip's assigned people, each with their
  roster identity fields *and* that trip's assignment fields merged into
  one object (a `TripPersonView` shape on the frontend) — chosen
  specifically so `TripDetail.tsx`'s existing crew/pax manifest JSX (which
  reads `person.Name`, `.Role`, `.Phone`, `.Hotel`,
  `.CommercialFlightETA`, `.PassportNationality`, `.LicenceNumber` all off
  one object) needs no rendering changes, only a type/data-source swap.
- **New passport/medical fields land as flat columns on `Person`**, not a
  separate table — a person has one current passport and one current
  medical certificate at a time in practice, unlike ratings.
  `passportNationality` already exists; the rest are additions alongside
  it.
- **`AdminAssets.tsx`'s `PersonDialog` keeps its current shape (Trip +
  Name/Role/Phone/Email/LicenceNumber, one Save)**, but its save handler
  now does two calls instead of one: upsert the roster `Person`, then
  assign-to-trip if a trip was selected. This preserves today's UX exactly
  (create-or-edit a person while optionally slotting them into a trip)
  without redesigning the tab for many-assignments-per-person — that
  redesign is explicitly 4d-2's job, not this slice's.

## Backend

### Schema

```prisma
model Person {
  personId                String    @id @map("person_id")
  name                    String
  defaultRole             String?   @map("default_role")
  licenceNumber           String?   @map("licence_number")
  medicalValidUntil       DateTime? @map("medical_valid_until")
  medicalClass            String?   @map("medical_class")
  medicalExaminer         String?   @map("medical_examiner")
  passportNumber          String?   @map("passport_number")
  passportNationality     String?   @map("passport_nationality")
  passportIssuingCountry  String?   @map("passport_issuing_country")
  passportExpiryDate      DateTime? @map("passport_expiry_date")
  passportDateOfBirth     DateTime? @map("passport_date_of_birth")
  passportSex             String?   @map("passport_sex")
  phone                   String?
  email                   String?

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

(`Trip` needs a reverse `assignments TripPersonAssignment[]` field added
for the relation to be valid — cosmetic, Prisma requires both sides
declared.)

### Migration (data-preserving)

Generate via `npm run prisma:migrate -- --name split_person_roster_and_assignments --create-only`,
then hand-edit the generated SQL so the `INSERT ... SELECT` runs **before**
the `persons` table's columns are dropped:

```sql
-- Preserve every existing person's trip/role/hotel/ETA as an assignment
-- before restructuring the persons table itself.
CREATE TABLE "trip_person_assignments" (
  "id" SERIAL PRIMARY KEY,
  "trip_id" TEXT NOT NULL,
  "person_id" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "commercial_flight_eta" TIMESTAMP(3),
  "hotel" TEXT
);

INSERT INTO "trip_person_assignments" ("trip_id", "person_id", "role", "commercial_flight_eta", "hotel")
SELECT "trip_id", "person_id", "role", "commercial_flight_eta", "hotel" FROM "persons";

CREATE TABLE "person_ratings" (
  "id" SERIAL PRIMARY KEY,
  "person_id" TEXT NOT NULL,
  "rating_type" TEXT NOT NULL,
  "issuing_authority" TEXT,
  "issue_date" TIMESTAMP(3),
  "expiry_date" TIMESTAMP(3),
  "notes" TEXT
);

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

CREATE INDEX "trip_person_assignments_trip_id_idx" ON "trip_person_assignments"("trip_id");
CREATE INDEX "trip_person_assignments_person_id_idx" ON "trip_person_assignments"("person_id");
CREATE UNIQUE INDEX "trip_person_assignments_trip_id_person_id_key" ON "trip_person_assignments"("trip_id", "person_id");
CREATE INDEX "person_ratings_person_id_idx" ON "person_ratings"("person_id");

ALTER TABLE "trip_person_assignments" ADD CONSTRAINT "trip_person_assignments_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("trip_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "trip_person_assignments" ADD CONSTRAINT "trip_person_assignments_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("person_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "person_ratings" ADD CONSTRAINT "person_ratings_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("person_id") ON DELETE CASCADE ON UPDATE CASCADE;
```

(Exact generated SQL will differ in formatting/ordering — this is the
required *shape and sequencing* — dropped columns' data must be copied out
first. The implementer should generate via `--create-only`, compare
against this shape, and adjust rather than hand-write from scratch, since
Prisma's generated constraint/index names may differ slightly from what's
shown here.)

### `PersonsService`/`Controller` rework

`findAll(tripId?)`: with no `tripId`, `prisma.person.findMany()` (the
roster). With `tripId`, query `prisma.tripPersonAssignment.findMany({
where: { tripId }, include: { person: true } })` and map each row to a
flat merged object (assignment fields + spread person fields) — this
merged shape is what the frontend maps into `TripPersonView`.

`create`/`update`/`remove` operate on roster-only fields (no `tripId`,
`role`, `hotel`, `commercialFlightEta` in `CreatePersonDto`/
`UpdatePersonDto` any more — those move to the new assignment DTO below).

New methods/routes:

```typescript
// PersonsService
async assign(personId: string, dto: AssignPersonDto) {
  await this.findOne(personId); // 404s if the person doesn't exist
  const assignment = await this.prisma.tripPersonAssignment.upsert({
    where: { tripId_personId: { tripId: dto.tripId, personId } },
    create: { tripId: dto.tripId, personId, role: dto.role, hotel: dto.hotel, commercialFlightEta: dto.commercialFlightEta ? new Date(dto.commercialFlightEta) : null },
    update: { role: dto.role, hotel: dto.hotel, commercialFlightEta: dto.commercialFlightEta ? new Date(dto.commercialFlightEta) : null },
  });
  await this.audit.log(dto.user || 'SYSTEM', 'TripPersonAssignment', `${dto.tripId}:${personId}`, 'Assigned', '', dto.role);
  return assignment;
}

async unassign(personId: string, tripId: string, user = 'SYSTEM') {
  await this.prisma.tripPersonAssignment.delete({ where: { tripId_personId: { tripId, personId } } });
  await this.audit.log(user, 'TripPersonAssignment', `${tripId}:${personId}`, 'Unassigned', '', '');
  return { personId, tripId, unassigned: true };
}
```

```typescript
// PersonsController additions
@Post(':personId/assign')
assign(@Param('personId') personId: string, @Body() dto: AssignPersonDto) {
  return this.persons.assign(personId, dto);
}

@Delete(':personId/assign/:tripId')
unassign(@Param('personId') personId: string, @Param('tripId') tripId: string, @Query('user') user?: string) {
  return this.persons.unassign(personId, tripId, user);
}
```

`AssignPersonDto` (`src/server/modules/persons/dto/assign-person.dto.ts`):
`tripId` (string, required), `role` (one of the existing `PERSON_ROLES`,
required), `hotel?`, `commercialFlightEta?`, `user?`.

### `PersonRatingsModule` (new, small)

`src/server/modules/person-ratings/` — `person-ratings.module.ts`,
`.controller.ts`, `.service.ts`, `dto/create-rating.dto.ts` (`personId`,
`ratingType`, `issuingAuthority?`, `issueDate?`, `expiryDate?`, `notes?`),
`dto/update-rating.dto.ts` (`PartialType(OmitType(CreateRatingDto,
['personId']))`). Routes: `GET /persons/:personId/ratings`,
`POST /ratings`, `PATCH /ratings/:id`, `DELETE /ratings/:id` (mixed
nesting — list is naturally scoped under a person, mutations address a
rating by its own id, matching how `DocsController`'s `:docId`-scoped
mutations work today). Register in `app.module.ts`.

## Frontend

### `types.ts`

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

// What TripDetail.tsx actually renders — roster identity + this trip's
// assignment specifics, merged into one object so existing JSX (`.Role`,
// `.Hotel`, `.CommercialFlightETA` alongside `.Name`, `.PassportNationality`,
// `.LicenceNumber`) needs no changes.
export interface TripPersonView extends Person {
  Role: PersonRole;
  CommercialFlightETA?: string;
  Hotel?: string;
}
```

`TripSheet.persons` (in `dataStore.ts`) changes from `Person[]` to
`TripPersonView[]`.

### `dataStore.ts`

Replace the existing synchronous `getPersons`/`getPersonsForTrip`/
`savePerson`/`deletePerson` block:

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

(`getPersons` — the old bare export — is renamed `getPersonRoster` since
its meaning changed from "every person row" to "the roster." It has
exactly one other caller besides `getTripSheet`: `exportBackup()`
(confirmed via investigation — not called from any page/component today,
only exported for programmatic use, but still real code that must not be
left broken).)

### Fix two pre-existing unawaited-async bugs, found during this investigation

`dataStore.ts` has `// @ts-nocheck`, so neither of these surfaces as a
compile error — both were only caught by reading the code directly:

1. **`getTripSheet`**: confirm whether `persons: getPersonsForTrip(tripId)`
   is still missing its `await` (it was, as of the last investigation) and,
   if so, add it to the existing `Promise.all` batch alongside `legs`/
   `stops`/`services`/`comms`/`docs` — same fix already applied there in
   the 4a plan.
2. **`exportBackup()`** (new finding from this investigation, not
   previously caught): `persons: getPersons()` and `docs: getDocs()`
   inside its returned object are both unawaited — `getDocs` has been
   async since the 4a slice and this call site was never updated (4a's
   "search for other callers" scope was `src/client/pages`/
   `src/client/components` only, missing this one inside `dataStore.ts`
   itself). Fix by adding both to the function's existing `Promise.all`:

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
    ...
```

   (Ellipsis marks the unchanged `referenceMeta` block that follows —
   leave it exactly as-is.)

### `TripDetail.tsx`

No JSX changes required — `sheet.persons` is now typed `TripPersonView[]`
instead of `Person[]`, and every field the existing crew/pax manifest and
CREW & PAX tab already read (`.Name`, `.Role`, `.Phone`, `.Email`,
`.Hotel`, `.CommercialFlightETA`, `.PassportNationality`,
`.LicenceNumber`) is present on the new type. Update the `Person`/
`TripPersonView` type imports at the top of the file if `Person` was
imported directly and needs to become `TripPersonView` for the `persons`
prop's type annotations.

### `AdminAssets.tsx`

- `const persons = getPersons();` (synchronous, line ~500) becomes async
  state, matching the established `CommsPage.tsx` fix pattern from the
  Comms-migration plan:

```tsx
const [persons, setPersons] = useState<Person[]>([]);
useEffect(() => { getPersonRoster().then(setPersons); }, [refreshKey]);
```

  (`refreshKey` is the existing `useState(0)` counter this file already
  uses to force-reload after a dialog save — include it in the dependency
  array so `refresh()` actually re-fetches.)

- The list row's `Trip: {p.TripID}` line is removed — a roster person no
  longer has a single `TripID`. Nothing replaces it in this slice (showing
  "which trips is this person on" is a 4d-2 concern); the row keeps
  Name/Role badge/Phone/edit/delete.
- `PersonDialog`'s `handleSave` becomes:

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

  (The Trip picker stays in the dialog exactly as it is today — still
  optional-in-spirit even though the current UI defaults it to the first
  trip in the list — only the save mechanics change from one flat write
  to two calls.)
- Import `getPersonRoster`, `savePerson`, `assignPersonToTrip`,
  `deletePerson` from `@/lib/dataStore` (replacing the old `getPersons`/
  `savePerson`/`deletePerson` import list — `savePerson`'s signature is
  now `async`, already handled by the `await` added above).

## Testing

No test framework in this project — manual verification:

```powershell
npm run build
npm run start:prod
# 1. GET /api/persons (no tripId) — confirm it returns the roster (no
#    tripId/role/hotel/commercialFlightEta fields on each row).
# 2. GET /api/persons?tripId=<existing tripId with demo crew> — confirm
#    each row has both roster fields (name, licenceNumber, etc.) AND
#    assignment fields (role, hotel, commercialFlightEta) merged, and that
#    this matches what existed before the migration (data preserved, not
#    lost).
# 3. Open a trip in the browser (or verify via API) — confirm the crew/pax
#    manifest and CREW & PAX tab render exactly as before the migration.
# 4. POST /api/persons (new roster person, no tripId), then
#    POST /api/persons/:personId/assign with a tripId/role — confirm
#    GET /api/persons?tripId=<that trip> now includes them.
# 5. DELETE /api/persons/:personId/assign/:tripId — confirm they drop out
#    of that trip's manifest but GET /api/persons (roster) still shows them.
# 6. Delete a trip that has assigned people — confirm the people are NOT
#    deleted (only their assignment to that trip is, via cascade on
#    TripPersonAssignment), unlike before this migration.
# 7. In AdminAssets.tsx's Persons tab: Add Person with a trip selected —
#    confirm it appears in that trip's manifest. Edit an existing person's
#    name — confirm it updates. Delete a person — confirm they're gone
#    from the roster (and, by cascade, any assignments/ratings/docs).
```

## Out of scope

- The Person detail page and `AdminAssets.tsx` roster-management redesign
  (multiple assignments per person, an "assign to another trip" action
  from a person's own view) — 4d-2.
- Expiry monitoring/alerting on any of the new date fields — 4d-3.
- Promoting `DocAttachment.verifiedFields` (4c) into these new structured
  Person columns automatically — still a manual/future concern.
- A ratings editor UI — the backend endpoints exist; nothing in this
  slice's frontend work creates or lists ratings visually (4d-2).

## Do not

- Do not `git commit`.
- Do not discard existing demo Person data in the migration — this is a
  data-preserving `INSERT...SELECT` migration, not a delete-and-recreate
  like 4a's (which was correct there because those rows had no real file
  behind them; these rows represent real crew/pax data worth keeping).
- Do not flatten `PersonRating` onto `Person` as fixed columns — it must
  stay one-to-many.
- Do not remove the `role`/`hotel`/`commercialFlightEta` per-trip
  specificity by pushing them back onto `Person` for convenience — that
  would defeat the entire point of this restructuring.
- Do not redesign `AdminAssets.tsx`'s Person tab beyond what's needed to
  keep it functioning against the new API — the real redesign is 4d-2.
