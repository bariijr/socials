import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TripsService } from '../trips/trips.service';
import { computeUrgency } from '../../common/geo.util';
import { CreateQuoteDto } from './dto/create-quote.dto';

@Injectable()
export class QuotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly trips: TripsService,
  ) {}

  // Persists an entire public-quote enquiry (Trip + Legs + Services + Persons)
  // as one atomic transaction — the "submit" step in the public quote flow.
  // Mirrors the frontend's LandingPage.submitQuote, but server-side and atomic.
  async submit(dto: CreateQuoteDto) {
    const tripId = await this.trips.nextTripId();
    const legIdMap = new Map<string, string>();
    dto.legs.forEach((leg, i) => {
      legIdMap.set(leg.clientLegId, `${tripId}-L${String(i + 1).padStart(2, '0')}`);
    });

    const result = await this.prisma.$transaction(async (tx) => {
      const trip = await tx.trip.create({
        data: {
          tripId,
          client: dto.client,
          operator: '',
          registration: dto.registration,
          status: 'Planning',
          owner: 'Web Enquiry',
          operationType: dto.operationType,
          missionType: dto.missionType,
          notes: [dto.notes, dto.contactEmail ? `Contact: ${dto.contactEmail}` : '']
            .filter(Boolean)
            .join(' — ') || undefined,
        },
      });

      const legs = [];
      for (const legDto of dto.legs) {
        const legId = legIdMap.get(legDto.clientLegId)!;
        const leg = await tx.leg.create({
          data: {
            legId,
            tripId,
            seq: legDto.seq,
            depIcao: legDto.depIcao,
            arrIcao: legDto.arrIcao,
            etdZ: legDto.etdZ,
            etaZ: legDto.etaZ,
            blockHours: legDto.blockHours ?? 0,
            countriesOverflown: (legDto.countriesOverflown ?? []).filter((iso2) =>
              (dto.services ?? []).some(
                (s) => s.clientLegId === legDto.clientLegId && s.serviceType === 'Overflight' && s.countryIso2 === iso2,
              ),
            ),
            callSign: legDto.callSign,
          },
        });
        legs.push(leg);
      }

      const services = [];
      for (const svcDto of dto.services ?? []) {
        const legId = legIdMap.get(svcDto.clientLegId);
        if (!legId) continue;
        const leg = legs.find((l) => l.legId === legId)!;
        const requiredByZ = new Date(leg.etdZ.getTime() - svcDto.leadTimeHours * 60 * 60 * 1000);
        const svc = await tx.service.create({
          data: {
            svcId: `${legId}-${svcDto.serviceType.toUpperCase()}-${svcDto.countryIso2}`,
            tripId,
            scopeType: 'LEG',
            scopeId: legId,
            serviceType: svcDto.serviceType,
            status: 'Not Started',
            basedOnEtdZ: leg.etdZ,
            requiredByZ,
            urgency: computeUrgency(requiredByZ),
            assignedTo: 'Unassigned',
            notes: svcDto.notes ?? `Web enquiry — ${svcDto.auto ? 'auto-derived' : 'manually added'} ${svcDto.serviceType} for ${svcDto.countryIso2}.`,
            countryIso2: svcDto.countryIso2,
          },
        });
        services.push(svc);
      }

      const persons = [];
      for (const [i, p] of (dto.persons ?? []).entries()) {
        if (!p.name.trim()) continue;
        const personId = `PER-${tripId}-${String(i + 1).padStart(3, '0')}`;
        const person = await tx.person.create({
          data: {
            personId,
            name: p.name,
            defaultRole: p.role,
            passportNationality: p.passportNationality,
          },
        });
        // Quote-enquiry persons carry no per-leg info (trip-wide in the
        // public form) — fan the assignment out to every leg of the trip,
        // same convenience semantics as PersonsService.assignAllLegs.
        await tx.legPersonAssignment.createMany({
          data: legs.map((leg) => ({ legId: leg.legId, personId, role: p.role })),
        });
        persons.push(person);
      }

      return { trip, legs, services, persons };
    });

    await this.audit.log('Web Enquiry', 'Trip', tripId, 'Submitted', '', `${result.legs.length} leg(s), ${result.services.length} service(s)`);
    return result;
  }
}
