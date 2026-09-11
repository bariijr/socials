import { PrismaClient } from '@prisma/client';
import { truncateAll } from '../../test/db-test-utils';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ContactChannelsService } from '../contacts/contact-channels.service';
import { ClientsService } from './clients.service';

describe('ClientsService client ID generation', () => {
  let prisma: PrismaService;
  let clients: ClientsService;

  beforeAll(() => {
    prisma = new PrismaService();
    const audit = new AuditService(prisma);
    const contactChannels = new ContactChannelsService(prisma);
    clients = new ClientsService(prisma, audit, contactChannels);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await truncateAll(prisma as unknown as PrismaClient);
  });

  it('assigns a CLI-###### ID, ignoring any clientId supplied by the caller', async () => {
    const created = await clients.create({
      // A caller-supplied clientId must never win -- this used to be the
      // live value (frontend generated `CLI-${Date.now()}`) and is now
      // stripped by CreateClientDto's whitelist; the server always assigns
      // its own.
      clientId: 'CALLER-SUPPLIED',
      name: 'Example Aviation',
    } as any);

    expect(created.clientId).toMatch(/^CLI-\d{6}$/);
    expect(created.clientId).not.toBe('CALLER-SUPPLIED');
  });

  it('never assigns the same clientId twice, even to concurrent creates', async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) => clients.create({ name: `Concurrent Client ${i}` } as any)),
    );

    const ids = results.map((r) => r.clientId);
    expect(new Set(ids).size).toBe(10);
  });

  it('increments sequentially across separate creates', async () => {
    const first = await clients.create({ name: 'First' } as any);
    const second = await clients.create({ name: 'Second' } as any);

    const firstNum = Number(first.clientId.split('-')[1]);
    const secondNum = Number(second.clientId.split('-')[1]);
    expect(secondNum).toBe(firstNum + 1);
  });
});
