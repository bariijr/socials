import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreatePermitAuthorizationDto } from './dto/create-permit-authorization.dto';
import { UpdatePermitAuthorizationDto } from './dto/update-permit-authorization.dto';

@Injectable()
export class PermitAuthorizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  findAll(filters: { operatorId?: string; countryIso2?: string; serviceType?: string; status?: string }) {
    return this.prisma.permitAuthorization.findMany({
      where: {
        operatorId: filters.operatorId,
        countryIso2: filters.countryIso2,
        serviceType: filters.serviceType,
        status: filters.status,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const auth = await this.prisma.permitAuthorization.findUnique({ where: { id } });
    if (!auth) throw new NotFoundException(`PermitAuthorization ${id} not found`);
    return auth;
  }

  async create(dto: CreatePermitAuthorizationDto) {
    const user = dto.user || 'SYSTEM';
    const auth = await this.prisma.permitAuthorization.create({
      data: {
        operatorId: dto.operatorId,
        countryIso2: dto.countryIso2,
        serviceType: dto.serviceType,
        authorizationType: dto.authorizationType,
        referenceNumber: dto.referenceNumber,
        validFrom: dto.validFrom,
        validUntil: dto.validUntil,
        docId: dto.docId,
        notes: dto.notes,
        createdBy: user,
        status: 'Draft',
      },
    });
    await this.audit.log(user, 'PermitAuthorization', auth.id, 'Created', '', auth.id);
    return auth;
  }

  async update(id: string, dto: UpdatePermitAuthorizationDto) {
    const before = await this.findOne(id);
    if (before.status === 'Verified') {
      throw new BadRequestException('Cannot edit a Verified authorization — revoke it first');
    }
    const user = dto.user || 'SYSTEM';
    const { user: _user, ...data } = dto;
    const auth = await this.prisma.permitAuthorization.update({ where: { id }, data });
    await this.audit.logDiff(user, 'PermitAuthorization', id, before as unknown as Record<string, unknown>, auth as unknown as Record<string, unknown>);
    return auth;
  }

  async verify(id: string, role: string | undefined, user = 'SYSTEM') {
    if (role !== 'Admin') throw new ForbiddenException('Verifying an authorization requires the Admin role');
    const before = await this.findOne(id);
    if (before.status !== 'Draft') {
      throw new BadRequestException(`Cannot verify from status "${before.status}"`);
    }
    const auth = await this.prisma.permitAuthorization.update({
      where: { id },
      data: { status: 'Verified', verifiedBy: user, verifiedAt: new Date() },
    });
    await this.audit.log(user, 'PermitAuthorization', id, 'Verified', before.status, 'Verified');
    return auth;
  }

  async revoke(id: string, role: string | undefined, user = 'SYSTEM') {
    if (role !== 'Admin') throw new ForbiddenException('Revoking an authorization requires the Admin role');
    const before = await this.findOne(id);
    if (before.status === 'Revoked') {
      throw new BadRequestException('Already revoked');
    }
    const auth = await this.prisma.permitAuthorization.update({ where: { id }, data: { status: 'Revoked' } });
    await this.audit.log(user, 'PermitAuthorization', id, 'Revoked', before.status, 'Revoked');

    const linkedServices = await this.prisma.service.findMany({ where: { authorizationId: id } });
    for (const svc of linkedServices) {
      await this.audit.log(
        user, 'Service', svc.svcId, 'FlaggedStale', svc.status,
        `Linked authorization ${id} was revoked — review manually.`,
      );
    }
    return auth;
  }
}
