import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ContactChannelsService, CONTACT_CHANNELS_INCLUDE } from '../contacts/contact-channels.service';
import { CreatePersonDto } from './dto/create-person.dto';
import { UpdatePersonDto } from './dto/update-person.dto';
import { AssignPersonDto } from './dto/assign-person.dto';
import { AssignAllLegsDto } from './dto/assign-all-legs.dto';

@Injectable()
export class PersonsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly contactChannels: ContactChannelsService,
  ) {}

  async findAll(params: { legId?: string; tripId?: string }) {
    const { legId, tripId } = params;
    if (legId) {
      const assignments = await this.prisma.legPersonAssignment.findMany({
        where: { legId },
        include: { person: { include: CONTACT_CHANNELS_INCLUDE } },
      });
      return assignments.map((a) => ({
        ...a.person, role: a.role, commercialFlightEta: a.commercialFlightEta, hotel: a.hotel,
      }));
    }
    if (tripId) {
      const assignments = await this.prisma.legPersonAssignment.findMany({
        where: { leg: { tripId } },
        include: { person: { include: CONTACT_CHANNELS_INCLUDE }, leg: { select: { legId: true, seq: true, depIcao: true, arrIcao: true } } },
        orderBy: { leg: { seq: 'asc' } },
      });
      return assignments.map((a) => ({
        ...a.person, role: a.role, commercialFlightEta: a.commercialFlightEta, hotel: a.hotel,
        legId: a.leg.legId, legSeq: a.leg.seq, legDepIcao: a.leg.depIcao, legArrIcao: a.leg.arrIcao,
      }));
    }
    return this.prisma.person.findMany({ include: CONTACT_CHANNELS_INCLUDE });
  }

  async findAllPaginated(page: number, limit: number) {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.prisma.person.findMany({ skip, take: limit, include: CONTACT_CHANNELS_INCLUDE }),
      this.prisma.person.count(),
    ]);
    return { data, page, limit, total, totalPages: Math.ceil(total / limit) };
  }

  async findOne(personId: string) {
    const person = await this.prisma.person.findUnique({ where: { personId }, include: CONTACT_CHANNELS_INCLUDE });
    if (!person) throw new NotFoundException(`Person ${personId} not found`);
    return person;
  }

  async create(dto: CreatePersonDto) {
    const user = dto.user || 'SYSTEM';
    const { user: _user, channels, medicalValidUntil, passportExpiryDate, passportDateOfBirth, ...rest } = dto;
    const person = await this.prisma.person.create({
      data: {
        ...rest,
        medicalValidUntil: medicalValidUntil ? new Date(medicalValidUntil) : undefined,
        passportExpiryDate: passportExpiryDate ? new Date(passportExpiryDate) : undefined,
        passportDateOfBirth: passportDateOfBirth ? new Date(passportDateOfBirth) : undefined,
      },
    });
    await this.contactChannels.replace({ personId: person.personId }, channels ?? []);
    await this.audit.log(user, 'Person', person.personId, 'Created', '', person.personId);
    return this.findOne(person.personId);
  }

  async update(personId: string, dto: UpdatePersonDto) {
    const before = await this.findOne(personId);
    const user = dto.user || 'SYSTEM';
    const { user: _user, channels, medicalValidUntil, passportExpiryDate, passportDateOfBirth, ...rest } = dto;
    const person = await this.prisma.person.update({
      where: { personId },
      data: {
        ...rest,
        medicalValidUntil: medicalValidUntil ? new Date(medicalValidUntil) : undefined,
        passportExpiryDate: passportExpiryDate ? new Date(passportExpiryDate) : undefined,
        passportDateOfBirth: passportDateOfBirth ? new Date(passportDateOfBirth) : undefined,
      },
    });
    if (channels !== undefined) await this.contactChannels.replace({ personId }, channels);
    // Same before/after asymmetry as ClientsService.update() (Task 4) — `before`
    // includes `channels` via findOne, the bare `update()` result never does.
    // Exclude it from both sides so logDiff doesn't record a spurious change.
    const { channels: _beforeChannels, ...beforeForDiff } = before as unknown as Record<string, unknown> & { channels?: unknown };
    await this.audit.logDiff(user, 'Person', personId, beforeForDiff, person as unknown as Record<string, unknown>);
    return this.findOne(personId);
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
