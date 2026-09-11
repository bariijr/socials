import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateVendorCapabilityRequestDto } from './dto/create-vendor-capability-request.dto';
import { SubmitVendorCapabilityResponseDto } from './dto/submit-vendor-capability-response.dto';
import { ReviewVendorCapabilityRequestDto } from './dto/review-vendor-capability-request.dto';

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

// Used by the vendor-facing (public, token-gated) endpoints: findByToken and
// submit. Excludes internal Admin-only fields (reviewedBy, reviewedAtZ,
// reviewNotes, createdBy) that must never reach an anonymous vendor. Includes
// `token` -- the vendor already has it (it's in the URL they used to get
// here) -- and `status`/`tokenExpiresAtZ`, which submit() needs internally to
// validate the request before accepting an answer.
const VENDOR_SAFE_SELECT = {
  id: true,
  providerId: true,
  countryIso2: true,
  icao: true,
  serviceType: true,
  token: true,
  tokenExpiresAtZ: true,
  status: true,
  contactName: true,
  contactEmail: true,
  canService: true,
  vendorNotes: true,
  submittedAtZ: true,
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
    const countryIso2 = dto.countryIso2 || null;
    const icao = dto.icao || null;
    // A row with BOTH scope fields null is not "unscoped, harmless" -- under
    // the resolver's scope-compatible capability matching it would cover
    // EVERY context for that service type, silently blocking the provider
    // everywhere with no confirmation step. The Admin UI enforces this
    // client-side; the endpoint must enforce it too.
    if (!countryIso2 && !icao) {
      throw new BadRequestException('A capability request must be scoped to either a country or an airport.');
    }
    const token = randomBytes(24).toString('hex');
    const tokenExpiresAtZ = new Date(Date.now() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
    const created = await this.prisma.vendorCapabilityRequest.create({
      data: {
        providerId: dto.providerId,
        countryIso2,
        icao,
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
    const row = await this.prisma.vendorCapabilityRequest.findUnique({ where: { token }, select: VENDOR_SAFE_SELECT });
    if (!row) throw new NotFoundException('Capability request not found');
    return row;
  }

  async submit(token: string, dto: SubmitVendorCapabilityResponseDto) {
    const row = await this.findByToken(token);
    if (row.status !== 'PENDING') {
      throw new BadRequestException('This capability request has already been submitted.');
    }
    if (row.tokenExpiresAtZ.getTime() < Date.now()) {
      throw new BadRequestException('This capability request link has expired.');
    }
    const updated = await this.prisma.vendorCapabilityRequest.update({
      where: { id: row.id },
      data: {
        status: 'SUBMITTED',
        contactName: dto.contactName,
        contactEmail: dto.contactEmail,
        canService: dto.canService,
        vendorNotes: dto.vendorNotes,
        submittedAtZ: new Date(),
      },
      select: VENDOR_SAFE_SELECT,
    });
    await this.audit.log('VENDOR_PORTAL', 'VendorCapabilityRequest', updated.id, 'Submitted', 'PENDING', 'SUBMITTED');
    return updated;
  }

  async approve(id: string, dto: ReviewVendorCapabilityRequestDto) {
    return this.review(id, 'APPROVED', dto);
  }

  async reject(id: string, dto: ReviewVendorCapabilityRequestDto) {
    return this.review(id, 'REJECTED', dto);
  }

  private async review(id: string, outcome: 'APPROVED' | 'REJECTED', dto: ReviewVendorCapabilityRequestDto) {
    const user = dto.user || 'SYSTEM';
    const row = await this.prisma.vendorCapabilityRequest.findUnique({ where: { id } });
    if (!row) throw new NotFoundException(`VendorCapabilityRequest ${id} not found`);
    if (row.status === 'PENDING') {
      throw new BadRequestException('This capability request has not been submitted by the vendor yet.');
    }
    const updated = await this.prisma.vendorCapabilityRequest.update({
      where: { id },
      data: { status: outcome, reviewedBy: user, reviewedAtZ: new Date(), reviewNotes: dto.reviewNotes },
      select: ADMIN_SAFE_SELECT,
    });
    await this.audit.log(user, 'VendorCapabilityRequest', id, 'Reviewed', row.status, outcome);
    return updated;
  }
}
