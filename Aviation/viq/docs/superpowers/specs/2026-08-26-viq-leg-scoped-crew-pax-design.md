# VIQ Leg-Scoped Crew & Pax Manifest (Sub-project 4d-4 of the document-intelligence initiative)

## Context

4d-1 (person roster foundation) introduced `TripPersonAssignment` — one row
per person per **trip**, applying the same role/hotel/ETA uniformly to
every leg of that trip. 4d-2 (Person detail page) and 4d-3 (expiry
dashboard) built on top of that trip-wide model without changing it.

The user's explicit requirement, stated during brainstorming for this
slice: **"a person can be in some trip legs and not others, similarly PIC
may be FO on other legs or completely absent so persons can be assigned to
entire trips or legs and may have variable functions in each leg."** Given
a choice between (A) trip-wide assignment with per-leg overrides for the
exception case, or (B) fully leg-scoped assignment as the only model, the
user explicitly chose **(B) fully leg-scoped** — a person's assignment is
fundamentally a `(Leg, Person)` fact; "assigned to the whole trip" is a
convenience action that creates one such fact per leg, not a first-class
trip-level relation.

**Investigation findings that shape this spec:**

- `TripsService.sheet()` (`GET /trips/:tripId/sheet`) independently queries
  the same `TripPersonAssignment` relation via `Trip.assignments`, in
  parallel to `PersonsService.findAll(tripId)`. It has **no frontend
  caller today** (`dataStore.ts`'s `getTripSheet` aggregates via separate
  parallel REST calls instead), but it is real, reachable server code and
  must not be left broken by the schema change.
- `emailTemplates.ts`'s `generateEmail()` already receives `legId` as a
  parameter and derives PIC/crew/pax by filtering whatever `persons` array
  its caller passes in (`persons.find(p => p.Role === 'PIC')`, etc.). It
  needs **no internal changes** — once callers pass it a leg-scoped
  `persons` array instead of a trip-wide one, the existing filter logic
  is already correct per-leg.
- `ComposeDrawer.tsx` already receives a specific `leg: Leg` prop and is
  always invoked from `ServiceInlineEditor`, which is always invoked from
  `LegEditor` for one specific leg — its `persons` prop can become
  leg-scoped with **no code changes in either component**, only a change
  to what the caller passes in.
- `ComposerPage.tsx` is the one real exception: it has a genuinely
  optional "Leg (optional)" selector, so it must support a no-leg-selected
  state.
- `NewTripWizard.tsx` calls `savePerson()` to create roster identity
  records during trip creation but **never calls `assignPersonToTrip`
  today** — newly-created persons in the wizard are not linked to the
  trip's roster at all (a pre-existing gap, out of scope for this slice).
  No changes needed there.
- The trip-wide "CREW & PAX REGISTER" tab in `TripDetail.tsx` (lines
  1614–1674) is a distinct, real consumer of a trip-wide person list,
  separate from the per-leg "LEG CREW & PAX MANIFEST" block inside each
  leg card. Both need to keep working, with different shapes.

Per explicit user instruction (carried over from every prior sub-project
in this session): **do not `git commit` any of this work.**

## Goal

Replace `TripPersonAssignment` (trip-scoped) with `LegPersonAssignment`
(leg-scoped) as the sole assignment relation. A person's role, hotel, and
commercial-flight ETA are now facts about one specific leg. The existing
trip-wide "assign to trip" UX becomes a convenience action that assigns a
person to every leg of a trip in one step, implemented as N leg-level
assignments underneath — never a separate trip-level table. The
`TripDetail.tsx` "LEG CREW & PAX MANIFEST" block, currently a read-only
display of the trip's whole roster repeated identically on every leg,
becomes a real per-leg CRUD surface: add/remove a person, per leg,
independently.

## Design decisions

- **One table, not two.** No `TripPersonAssignment` survives alongside
  `LegPersonAssignment` as a default/override pair — the user explicitly
  rejected that shape. Every assignment fact lives on `LegPersonAssignment`.
- **Data-preserving migration.** Every existing `TripPersonAssignment` row
  fans out to one `LegPersonAssignment` row per leg of that trip (same
  role/hotel/ETA copied onto each). No existing assignment data is lost;
  a trip that today shows its whole crew on every leg continues to show
  exactly that after migration — the only change is that the underlying
  facts are now per-leg and can be edited independently going forward.
- **`TripPersonView` keeps its exact shape**, but its meaning shifts from
  "this trip's assignment" to "this leg's assignment." This is why
  `emailTemplates.ts`, `ComposeDrawer.tsx`, and `ServiceInlineEditor`
  need zero code changes — only their caller's data source changes.
- **A new `TripLegPersonView` shape** (person + leg context) serves the
  genuinely trip-wide consumers: the CREW & PAX REGISTER tab, the
  Composer's no-leg-selected fallback, and `PersonDetail.tsx`'s reverse
  lookup. One row per `(person, leg)` — a person on 3 legs produces 3
  rows, each correctly labeled with its own leg and role.
- **A convenience "assign to all legs" endpoint**, not a convenience
  table. `POST /persons/:personId/assign-all-legs` loops leg-level
  upserts in one transaction so the common case ("put the PIC on the
  whole trip") stays one user action, without reintroducing a trip-level
  relation.
- **`GET /persons` keeps evolving the same query-param contract** it
  already uses (`?tripId=` today): `?legId=` returns one leg's roster
  (`TripPersonView[]`), `?tripId=` returns the trip-wide register
  (`TripLegPersonView[]`, one row per person per leg) — a new, incompatible
  meaning for the existing `tripId` param, since every current caller of
  `?tripId=` is being updated in this same slice.
- **`PersonDetail.tsx`'s `AssignedTripsCard` groups leg rows by trip** for
  display (one block per trip, containing that trip's assigned legs) —
  this is a display grouping only; the underlying data and API stay
  leg-scoped.

## Backend

### Schema

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

Remove `TripPersonAssignment` entirely. Update the relation fields it
requires elsewhere:

- `Trip`: remove `assignments TripPersonAssignment[]` (no replacement —
  `Trip` no longer has a direct assignment relation; go through `Leg`).
- `Leg`: add `assignments LegPersonAssignment[]`.
- `Person`: rename `assignments TripPersonAssignment[]` to
  `legAssignments LegPersonAssignment[]`.

### Migration (data-preserving)

Generate via
`npm run prisma:migrate -- --name leg_scoped_assignments --create-only`,
then hand-edit so the fan-out `INSERT ... SELECT` runs before
`trip_person_assignments` is dropped:

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

(As with the 4d-1 migration: exact generated SQL/constraint names may
differ slightly — generate via `--create-only`, compare against this
shape and sequencing, adjust rather than hand-write from scratch. The
required invariant is that the `INSERT ... SELECT` runs while
`trip_person_assignments` still exists, before the `DROP TABLE`.)

### `PersonsService` rework

```typescript
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

async assign(personId: string, dto: AssignPersonDto) {
  await this.findOne(personId);
  const user = dto.user || 'SYSTEM';
  const assignment = await this.prisma.legPersonAssignment.upsert({
    where: { legId_personId: { legId: dto.legId, personId } },
    create: { legId: dto.legId, personId, role: dto.role, hotel: dto.hotel, commercialFlightEta: dto.commercialFlightEta ? new Date(dto.commercialFlightEta) : null },
    update: { role: dto.role, hotel: dto.hotel, commercialFlightEta: dto.commercialFlightEta ? new Date(dto.commercialFlightEta) : null },
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
```

`create`/`update`/`remove`/`findOne` are unchanged (roster-only fields,
already independent of assignment).

### `PersonsController` rework

```typescript
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
```

(`findOne`/`create`/`update`/`remove` routes unchanged. None of these
routes carry a `@Roles('Admin')` tag — consistent with every other route
in this controller today; write access is gated at `canEdit` in the
frontend, same as the rest of the trip/leg/person editing surface. Add
`import { AssignAllLegsDto } from './dto/assign-all-legs.dto';` to this
controller's existing DTO imports.)

### DTOs

`src/server/modules/persons/dto/assign-person.dto.ts` — rename `tripId` to `legId`:

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

New `src/server/modules/persons/dto/assign-all-legs.dto.ts`:

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

### `TripsService.sheet()` rework

```typescript
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
`getTripSheet` aggregates independently, see Frontend section below — but
it must compile and return a correct shape since it is real, reachable
server code.)

## Frontend

### `types.ts`

`TripPersonView` is unchanged (still `Person & { Role, CommercialFlightETA?, Hotel? }`) —
its meaning is now "this leg's assignment." Add:

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
```

`LegWithPersons` (used only by `TripSheet.legs`):

```typescript
export interface LegWithPersons extends Leg {
  persons: TripPersonView[];
}
```

### `dataStore.ts`

Replace the `TripSheet` interface:

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

Replace `mapTripPersonFromApi`/`getPersonsForTrip`/`assignPersonToTrip`/
`unassignPersonFromTrip`/`getPersonAssignments` and `getTripSheet`:

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

(`PersonAssignment` is already exported from `dataStore.ts` today with a
trip-level shape — this replaces it in place, same export name, new leg-
aware shape. Every import site — currently only `PersonDetail.tsx` — is
covered below.)

`getTripSheet`:

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

Delete `assignPersonToTrip`/`unassignPersonFromTrip` (replaced by the leg-
and all-legs-scoped functions above).

### `TripDetail.tsx`

- Line ~1172: `const { trip, legs, stops, services, comms, persons, docs } = sheet;`
  — unchanged destructure; `legs` is now `LegWithPersons[]`, top-level
  `persons` is now `TripLegPersonView[]`.
- Line ~1407: the `<LegEditor ... persons={persons} .../>` call inside the
  legs-rendering block changes to `persons={leg.persons}` — this is the
  one line that switches the whole per-leg subtree from trip-wide to
  leg-scoped data. `LegEditor`'s own prop type stays `TripPersonView[]`
  (unchanged) since it was always "whatever list the caller passes for
  this leg" — only the caller's source changes.
- `ServiceInlineEditor`'s two call sites (inside `LegEditor`, `persons={persons}`
  at both) are unchanged — they already forward `LegEditor`'s own
  `persons` prop, which is now leg-scoped by construction.
- **"LEG CREW & PAX MANIFEST" block** (lines 677–696) becomes real CRUD.
  Add local state inside `LegEditor`:

```typescript
const [addPersonOpen, setAddPersonOpen] = useState(false);
```

  Replace the block:

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

  New component, defined alongside `LegEditor` in the same file:

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

  (`Combobox`, `Button`, `Input`, `Trash2`, `Plus`, `useMemo`, `useEffect`
  are already imported in this file — no changes needed for those. Add to
  this file's existing imports:
  - from `@/lib/dataStore`: `getPersonRoster`, `assignPersonToLeg`,
    `assignPersonToAllLegs`, `unassignPersonFromLeg`.
  - from `@/data/types`: `Person`, `PersonRole` (added to the existing
    `import type { Service, Leg, Trip, ... } from '@/data/types'` line).
  - new: `import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';`
  - new: `import { Label } from '@/components/ui/label';`
  - new: `import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';`)

- **CREW & PAX REGISTER tab** (lines 1614–1674) — add a LEG column, key
  rows by `${PersonID}-${LegID}` since a person can now appear more than
  once:

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
      <TableCell><Badge variant="outline">{p.Role}</Badge></TableCell>
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

  The ROLE SUMMARY card's counts (`persons.filter(p => p.Role === role).length`)
  are unchanged code — they now count leg-assignments per role rather than
  distinct people, which is an intentional, more accurate reflection of a
  leg-scoped model (a person on 2 legs as PIC and 1 as FO shows as 2 PIC +
  1 FO, not 1 ambiguous "PIC" person).

### `PersonDetail.tsx`

Add imports: `getLegsForTrip`, `assignPersonToLeg`, `assignPersonToAllLegs`,
`unassignPersonFromLeg` from `@/lib/dataStore` (replacing
`assignPersonToTrip`/`unassignPersonFromTrip`); `Leg` and `useMemo` types/
hooks alongside the existing `Person, PersonRating, PersonRole,
DocAttachment, Trip` import and `useState, useEffect` import.

`AssignedTripsCard` groups leg-level `assignments` by `TripID`:

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
        )) }
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

`AssignTripDialog` becomes trip → leg(s) → role:

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

(`existingTripIds` prop is removed from `AssignTripDialog` — replaced by
`existingAssignments`, since a person can now be re-opened against a trip
they're already partially on, to add the remaining legs. The trip
`<Select>` no longer filters out trips the person already has some
assignment on.)

### `ComposerPage.tsx`

Leg selection is genuinely optional here (unlike `ComposeDrawer.tsx`), so
this page needs both a leg-scoped fetch and a trip-wide fallback:

```typescript
const [tripPersonRegister, setTripPersonRegister] = useState<TripLegPersonView[]>([]);
const [persons, setPersons] = useState<TripPersonView[]>([]);

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

(Import `getPersonsForLeg`, `dedupeToTripPersonView`, and `TripLegPersonView`
alongside the existing `getPersonsForTrip`/`TripPersonView` imports. The
existing `getPersonsForTrip` call in the trip-level `Promise.all` is kept —
it now returns the trip-wide register instead of a flat list, feeding the
no-leg-selected fallback. `handleCompose`'s call to `generateEmail(...,
persons, ...)` is unchanged — it already reads whichever `persons` state
is current.)

### `emailTemplates.ts`, `ComposeDrawer.tsx`

No code changes. Both already receive `persons: TripPersonView[]` as a
prop/parameter from a caller that is being updated above; their own logic
is already correct once that data is leg-scoped.

### `NewTripWizard.tsx`

No changes — confirmed via investigation that this file only calls
`savePerson()` (roster identity) and never calls the trip/leg assignment
functions today. Out of scope for this slice.

## Testing

No test framework in this project — manual verification:

```powershell
npm run build
npm run start:prod
# 1. GET /api/persons?legId=<existing legId with demo crew> — confirm it
#    returns TripPersonView rows (role/hotel/eta merged onto roster fields),
#    matching what that leg's crew looked like before migration.
# 2. GET /api/persons?tripId=<same trip> — confirm one row per (person,
#    leg): if the trip has 2 legs and 3 people, expect up to 6 rows, each
#    carrying legId/legSeq/legDepIcao/legArrIcao.
# 3. Open that trip in the browser — LEG CREW & PAX MANIFEST on each leg
#    card shows that leg's roster (should look unchanged immediately after
#    migration, since every leg got fanned out from the old trip-wide row).
#    CREW & PAX REGISTER tab shows one row per (person, leg) with a LEG
#    column.
# 4. On one leg, ADD PERSON with an existing roster person, role "FO",
#    "Apply to all legs" unchecked — confirm they appear only on that
#    leg's manifest, not on other legs of the same trip.
# 5. Remove a person from one leg (leg-level REMOVE) — confirm they
#    disappear from that leg's manifest but (if previously assigned) still
#    appear on other legs.
# 6. ADD PERSON with "Apply to all legs" checked — confirm
#    POST /api/persons/:personId/assign-all-legs is called once and the
#    person appears on every leg's manifest with the same role.
# 7. Open that person's PersonDetail page — ASSIGNED TRIPS card groups by
#    trip, shows one row per leg they're on with that leg's role. Assign
#    them to a different trip via the dialog: pick trip, pick a subset of
#    legs, confirm only those legs get an assignment row via
#    Promise.all(assign) (not assign-all-legs, since not every leg was
#    selected). Re-open the dialog against a trip they're already
#    partially on — confirm already-assigned legs show checked+disabled
#    with "(already assigned)", and remaining legs can be added.
# 8. In ComposerPage: select a trip, leave Leg = None, compose an email —
#    confirm PIC/crew/pax resolve via the deduped trip-wide fallback. Then
#    select a specific leg where a person's role differs from another leg
#    — confirm the composed email uses that leg's role, not another leg's.
# 9. Delete a leg that has assignments — confirm cascade removes only that
#    leg's LegPersonAssignment rows (other legs of the trip unaffected).
```

## Out of scope

- Any change to `NewTripWizard.tsx`'s person-adding flow (confirmed to
  have no assignment call today — a separate, pre-existing gap).
- Editing an existing assignment's role/hotel/ETA in place from the
  manifest UI beyond remove-and-re-add — this slice adds create/delete;
  an in-place edit control is a reasonable small follow-up, not required
  here.
- `AdminAssets.tsx`'s Person tab / `PersonDialog` — untouched by this
  slice (it creates roster records and does its own single-trip default
  assignment via the old `PersonDialog.handleSave` two-call pattern from
  4d-1; migrating that call from `assignPersonToTrip` to something
  leg-aware is folded into this plan only if a task explicitly touches
  it — see plan).

## Do not

- Do not `git commit`.
- Do not reintroduce a trip-level assignment table alongside the new
  leg-level one — the user explicitly rejected the override-table shape.
- Do not lose existing assignment data in the migration — every current
  `TripPersonAssignment` row must fan out to one row per leg of its trip
  before the old table is dropped.
- Do not change `emailTemplates.ts`'s PIC/crew/pax filter logic — it is
  already correct once its input is leg-scoped.
- Do not make `ComposerPage.tsx`'s leg selector required — it stays
  optional, with the dedup fallback covering the no-leg-selected case.
