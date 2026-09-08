import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateVendorAssignmentDto } from './dto/create-vendor-assignment.dto';
import { UpdateVendorAssignmentDto } from './dto/update-vendor-assignment.dto';

export interface VendorAssignmentFilters {
  providerId?: string;
  countryIso2?: string;
  serviceType?: string;
  clientId?: string;
}

@Injectable()
export class VendorAssignmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  findAll(filters: VendorAssignmentFilters) {
    return this.prisma.vendorAssignment.findMany({
      where: {
        providerId: filters.providerId,
        countryIso2: filters.countryIso2,
        serviceType: filters.serviceType,
        clientId: filters.clientId,
      },
      orderBy: { createdAtZ: 'desc' },
    });
  }

  async findOne(id: string) {
    const row = await this.prisma.vendorAssignment.findUnique({ where: { id } });
    if (!row) throw new NotFoundException(`VendorAssignment ${id} not found`);
    return row;
  }

  private validate(preferred: boolean | undefined, rank: number | undefined | null, prohibited: boolean | undefined) {
    if (preferred && prohibited) {
      throw new BadRequestException('A vendor assignment cannot be both preferred and prohibited');
    }
    if (!prohibited && rank == null) {
      throw new BadRequestException('rank is required unless prohibited is true');
    }
  }

  async create(dto: CreateVendorAssignmentDto) {
    const prohibited = dto.prohibited ?? false;
    this.validate(dto.preferred, prohibited ? null : dto.rank ?? null, prohibited);

    const existing = await this.prisma.vendorAssignment.findFirst({
      where: {
        providerId: dto.providerId,
        countryIso2: dto.countryIso2 ?? null,
        icao: dto.icao ?? null,
        serviceType: dto.serviceType,
        permitType: dto.permitType ?? null,
        clientId: dto.clientId ?? null,
      },
    });
    if (existing) {
      throw new BadRequestException(
        `An identical vendor assignment already exists (id: ${existing.id}) for this provider/context — ` +
          'use a different provider for a tied-preference alternative, or edit the existing row',
      );
    }

    const user = dto.user || 'SYSTEM';
    const row = await this.prisma.vendorAssignment.create({
      data: {
        providerId: dto.providerId,
        countryIso2: dto.countryIso2,
        icao: dto.icao,
        serviceType: dto.serviceType,
        permitType: dto.permitType,
        clientId: dto.clientId,
        preferred: dto.preferred ?? false,
        rank: prohibited ? null : dto.rank,
        prohibited,
        active: dto.active ?? true,
        effectiveFrom: dto.effectiveFrom,
        effectiveUntil: dto.effectiveUntil,
        notes: dto.notes,
        createdBy: user,
      },
    });
    await this.audit.log(user, 'VendorAssignment', row.id, 'Created', '', row.id);
    return row;
  }

  async update(id: string, dto: UpdateVendorAssignmentDto) {
    const before = await this.findOne(id);
    const user = dto.user || 'SYSTEM';
    const preferred = dto.preferred ?? before.preferred;
    const prohibited = dto.prohibited ?? before.prohibited;
    const rank = dto.rank !== undefined ? dto.rank : before.rank;
    this.validate(preferred, prohibited ? null : rank, prohibited);

    const { user: _user, ...data } = dto;
    const row = await this.prisma.vendorAssignment.update({
      where: { id },
      data: { ...data, rank: prohibited ? null : rank },
    });
    await this.audit.logDiff(user, 'VendorAssignment', id, before as unknown as Record<string, unknown>, row as unknown as Record<string, unknown>);
    return row;
  }
}
