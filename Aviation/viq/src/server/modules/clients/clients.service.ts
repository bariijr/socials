import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ContactChannelsService, CONTACT_CHANNELS_INCLUDE } from '../contacts/contact-channels.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';

@Injectable()
export class ClientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly contactChannels: ContactChannelsService,
  ) {}

  // No pagination — client lists stay reference-data-sized for now, same as
  // Operators/Providers; `search` powers the New Trip wizard's typeahead.
  findAll(search?: string) {
    const where: Prisma.ClientWhereInput | undefined = search
      ? { name: { contains: search, mode: 'insensitive' } }
      : undefined;
    return this.prisma.client.findMany({ where, orderBy: { name: 'asc' }, take: search ? 20 : undefined, include: CONTACT_CHANNELS_INCLUDE });
  }

  async findOne(clientId: string) {
    const client = await this.prisma.client.findUnique({ where: { clientId }, include: CONTACT_CHANNELS_INCLUDE });
    if (!client) throw new NotFoundException(`Client ${clientId} not found`);
    return client;
  }

  // CLI-000027 style, atomically incremented -- mirrors TripsService.nextTripId().
  // Reuses the existing trip_id_counters (prefix, count) table under a
  // distinct 'CLI' prefix key rather than a Trip-specific one, so no schema
  // migration is needed for this counter.
  async nextClientId(): Promise<string> {
    const rows = await this.prisma.$queryRaw<{ count: number }[]>`
      INSERT INTO trip_id_counters (prefix, count)
      VALUES ('CLI', 1)
      ON CONFLICT (prefix) DO UPDATE SET count = trip_id_counters.count + 1
      RETURNING count
    `;
    return `CLI-${String(rows[0].count).padStart(6, '0')}`;
  }

  async create(dto: CreateClientDto) {
    const user = dto.user || 'SYSTEM';
    const { user: _user, channels, ...rest } = dto;
    const clientId = await this.nextClientId();
    const client = await this.prisma.client.create({ data: { ...rest, clientId } });
    await this.contactChannels.replace({ clientId: client.clientId }, channels ?? []);
    await this.audit.log(user, 'Client', client.clientId, 'Created', '', client.clientId);
    return this.findOne(client.clientId);
  }

  async update(clientId: string, dto: UpdateClientDto) {
    const before = await this.findOne(clientId);
    const user = dto.user || 'SYSTEM';
    const { user: _user, channels, ...rest } = dto;
    const client = await this.prisma.client.update({ where: { clientId }, data: rest });
    if (channels !== undefined) await this.contactChannels.replace({ clientId }, channels);
    const { channels: _beforeChannels, ...beforeForDiff } = before as unknown as Record<string, unknown> & { channels?: unknown };
    await this.audit.logDiff(user, 'Client', clientId, beforeForDiff, client as unknown as Record<string, unknown>);
    return this.findOne(clientId);
  }

  // Trip.clientId is ON DELETE SET NULL, so a client with trips attached can
  // still be deleted — those trips just fall back to their own free-text
  // `client` string, unlike Operator's delete guard (which blocks outright
  // because Aircraft.currentOperatorId has no sensible fallback value).
  async remove(clientId: string, user = 'SYSTEM') {
    await this.findOne(clientId);
    await this.prisma.client.delete({ where: { clientId } });
    await this.audit.log(user, 'Client', clientId, 'Deleted', clientId, '');
    return { clientId, deleted: true };
  }
}
