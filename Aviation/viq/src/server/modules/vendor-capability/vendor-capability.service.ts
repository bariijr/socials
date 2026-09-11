import { Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateVendorCapabilityRequestDto } from './dto/create-vendor-capability-request.dto';

const TOKEN_TTL_DAYS = 30;

// Every list/find method below omits `token` from its select except
// findByToken (the vendor's own lookup, which needs it to exist as a
// column to match against, not to display) -- see Task 3's Interfaces
// note in the plan. Listing the fields explicitly (rather than `omit`)
// keeps this correct even if the Prisma version in use predates `omit`.
const ADMIN_SAFE_SELECT = {
  id: true,
  providerId: true,
  countryIso2: true,
  icao: true,
  serviceType: true,
  tokenExpiresAtZ: true,
  status: true,
  contactName: true,
  contactEmail: true,
  canService: true,
  vendorNotes: true,
  submittedAtZ: true,
  reviewedBy: true,
  reviewedAtZ: true,
  reviewNotes: true,
  createdBy: true,
  createdAtZ: true,
  provider: { select: { providerId: true, name: true } },
} as const;

@Injectable()
export class VendorCapabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateVendorCapabilityRequestDto) {
    const user = dto.user || 'SYSTEM';
    const token = randomBytes(24).toString('hex');
    const tokenExpiresAtZ = new Date(Date.now() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
    const created = await this.prisma.vendorCapabilityRequest.create({
      data: {
        providerId: dto.providerId,
        countryIso2: dto.countryIso2,
        icao: dto.icao,
        serviceType: dto.serviceType,
        token,
        tokenExpiresAtZ,
        createdBy: user,
      },
    });
    await this.audit.log(user, 'VendorCapabilityRequest', created.id, 'Created', '', `${dto.providerId} / ${dto.serviceType}`);
    return created;
  }

  findAll(filter: { providerId?: string; status?: string } = {}) {
    return this.prisma.vendorCapabilityRequest.findMany({
      where: { providerId: filter.providerId, status: filter.status },
      select: ADMIN_SAFE_SELECT,
      orderBy: { createdAtZ: 'desc' },
    });
  }

  async findOne(id: string) {
    const row = await this.prisma.vendorCapabilityRequest.findUnique({ where: { id }, select: ADMIN_SAFE_SELECT });
    if (!row) throw new NotFoundException(`VendorCapabilityRequest ${id} not found`);
    return row;
  }

  async findByToken(token: string) {
    const row = await this.prisma.vendorCapabilityRequest.findUnique({ where: { token } });
    if (!row) throw new NotFoundException('Capability request not found');
    return row;
  }
}
