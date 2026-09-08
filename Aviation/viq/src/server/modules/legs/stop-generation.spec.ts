import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ServicesService } from '../services/services.service';
import { StopsService } from '../stops/stops.service';
import { LegsService } from './legs.service';
import { TripsService } from '../trips/trips.service';
import { truncateAll } from '../../test/db-test-utils';

describe('connecting-stop generation', () => {
  let prisma: PrismaService;
  let legs: LegsService;
  let trips: TripsService;
  let tripCounter = 0;

  beforeAll(() => {
    prisma = new PrismaService();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // PrismaService extends PrismaClient, so it's assignable directly --
    // no cast needed.
    await truncateAll(prisma);
    const audit = new AuditService(prisma);
    const services = new ServicesService(prisma, audit);
    const stops = new StopsService(prisma, audit);
    legs = new LegsService(prisma, audit, services, stops);
    trips = new TripsService(prisma, audit, services);
    tripCounter += 1;
  });

  async function makeTrip(): Promise<string> {
    const tripId = `TEST-STOPS-${tripCounter}`;
    await trips.create({ tripId, client: 'Test Client' });
    return tripId;
  }

  async function addLeg(
    tripId: string,
    seq: number,
    depIcao: string,
    arrIcao: string,
    etdZ: string,
    etaZ: string,
  ) {
    return legs.create({
      legId: `${tripId}-LEG-${seq}`,
      tripId,
      seq,
      depIcao,
      arrIcao,
      etdZ,
      etaZ,
      countriesOverflown: [],
      generateServices: false,
    });
  }

  it('scenario 1: HTDA -> FALA (single leg) has zero connecting Stop rows and a display count of 1', async () => {
    const tripId = await makeTrip();
    await addLeg(tripId, 1, 'HTDA', 'FALA', '2026-10-01T06:00:00.000Z', '2026-10-01T09:00:00.000Z');

    const allLegs = await prisma.leg.findMany({ where: { tripId } });
    const stopRows = await prisma.stop.findMany({ where: { tripId } });

    expect(allLegs).toHaveLength(1); // display stop count = legs.length = 1 (FALA)
    expect(stopRows).toHaveLength(0); // no connecting transition exists
  });

  it('scenario 2: FALA -> HECA -> HAAB (two legs, no repeats) creates one connecting stop at HECA', async () => {
    const tripId = await makeTrip();
    const leg1 = await addLeg(tripId, 1, 'FALA', 'HECA', '2026-10-01T06:00:00.000Z', '2026-10-01T09:00:00.000Z');
    await addLeg(tripId, 2, 'HECA', 'HAAB', '2026-10-01T11:00:00.000Z', '2026-10-01T14:00:00.000Z');

    const allLegs = await prisma.leg.findMany({ where: { tripId } });
    const stopRows = await prisma.stop.findMany({ where: { tripId } });

    expect(allLegs).toHaveLength(2); // display stop count = 2 (HECA, HAAB)
    expect(stopRows).toHaveLength(1);
    expect(stopRows[0].icao).toBe('HECA');
    expect(stopRows[0].afterLegId).toBe(leg1.legId);
  });

  it('scenario 3: HTDA -> FALA -> FALA (repeated ICAO, demo-flight shape) creates two distinct connecting Stop rows at FALA', async () => {
    const tripId = await makeTrip();
    const leg1 = await addLeg(tripId, 1, 'HTDA', 'FALA', '2026-10-01T06:00:00.000Z', '2026-10-01T09:00:00.000Z');
    await addLeg(tripId, 2, 'FALA', 'FALA', '2026-10-01T10:00:00.000Z', '2026-10-01T10:30:00.000Z');

    const stopRows = await prisma.stop.findMany({ where: { tripId }, orderBy: { stopId: 'asc' } });

    // Before this fix, the second FALA transition's stop was silently
    // dropped by ICAO-based dedup -- this is the direct regression test
    // for Conflict #1 in the Phase 0 assessment.
    expect(stopRows).toHaveLength(1); // one connecting transition: HTDA->FALA, FALA->FALA
    expect(stopRows[0].icao).toBe('FALA');
    expect(stopRows[0].afterLegId).toBe(leg1.legId);
  });

  it('scenario 4: FALA -> FALA -> FBMN (repeated ICAO, different position) creates exactly one connecting stop, and FBMN is display-only', async () => {
    const tripId = await makeTrip();
    const leg1 = await addLeg(tripId, 1, 'FALA', 'FALA', '2026-10-01T06:00:00.000Z', '2026-10-01T06:30:00.000Z');
    await addLeg(tripId, 2, 'FALA', 'FBMN', '2026-10-01T07:00:00.000Z', '2026-10-01T10:00:00.000Z');

    const allLegs = await prisma.leg.findMany({ where: { tripId } });
    const stopRows = await prisma.stop.findMany({ where: { tripId } });

    expect(allLegs).toHaveLength(2); // display stop count = 2 (FALA, FBMN)
    expect(stopRows).toHaveLength(1); // only the FALA->FALA transition connects
    expect(stopRows[0].icao).toBe('FALA');
    expect(stopRows[0].afterLegId).toBe(leg1.legId);
  });

  it('two non-adjacent transitions sharing the same ICAO each get their own Stop row', async () => {
    // HTDA->FALA, FALA->HECA, HECA->FALA, FALA->FBMN: FALA is the
    // connecting airport for two separate, non-adjacent transitions.
    const tripId = await makeTrip();
    const leg1 = await addLeg(tripId, 1, 'HTDA', 'FALA', '2026-10-01T04:00:00.000Z', '2026-10-01T06:00:00.000Z');
    await addLeg(tripId, 2, 'FALA', 'HECA', '2026-10-01T07:00:00.000Z', '2026-10-01T09:00:00.000Z');
    const leg3 = await addLeg(tripId, 3, 'HECA', 'FALA', '2026-10-01T10:00:00.000Z', '2026-10-01T12:00:00.000Z');
    await addLeg(tripId, 4, 'FALA', 'FBMN', '2026-10-01T13:00:00.000Z', '2026-10-01T16:00:00.000Z');

    const stopRows = await prisma.stop.findMany({ where: { tripId }, orderBy: { arrZ: 'asc' } });
    const falaStops = stopRows.filter((s) => s.icao === 'FALA');

    expect(stopRows).toHaveLength(3); // FALA (after leg1), HECA (after leg2), FALA (after leg3)
    expect(falaStops).toHaveLength(2);
    expect(falaStops.map((s) => s.afterLegId).sort()).toEqual([leg1.legId, leg3.legId].sort());
  });

  it('claims a pre-existing unlinked Stop at the connecting ICAO instead of creating a duplicate (final-review fix 1)', async () => {
    // Reproduces the shape every trip that existed before Stop.afterLegId
    // landed has (see prisma/seed.ts's OMDB stop on trip 2608001), and the
    // shape a leg delete-then-re-add produces (Stop.afterLegId's FK is
    // onDelete: SetNull, so deleting a leg orphans its stop rather than
    // removing it) -- a manually-created, unlinked Stop at an ICAO a new
    // leg-add will connect through.
    const tripId = await makeTrip();
    const leg1 = await addLeg(tripId, 1, 'HTDA', 'FALA', '2026-10-01T06:00:00.000Z', '2026-10-01T09:00:00.000Z');

    const preExisting = await prisma.stop.create({
      data: {
        stopId: `${tripId}-STOP-FALA-PREEXISTING`,
        tripId,
        icao: 'FALA',
        arrZ: new Date('2026-10-01T09:00:00.000Z'),
        depZ: new Date('2026-10-01T09:30:00.000Z'),
        groundTimeHours: 0.5,
        purpose: 'Tech',
      },
    });
    expect(preExisting.afterLegId).toBeNull();

    // Adding a connecting leg through FALA should claim the pre-existing
    // stop, not create a second row alongside it.
    await addLeg(tripId, 2, 'FALA', 'HECA', '2026-10-01T10:00:00.000Z', '2026-10-01T12:00:00.000Z');

    const stopRows = await prisma.stop.findMany({ where: { tripId, icao: 'FALA' } });

    expect(stopRows).toHaveLength(1); // still just one Stop row at FALA -- claimed, not duplicated
    expect(stopRows[0].stopId).toBe(preExisting.stopId); // the original row, carrying any services scoped to it
    expect(stopRows[0].afterLegId).toBe(leg1.legId);
  });
});
