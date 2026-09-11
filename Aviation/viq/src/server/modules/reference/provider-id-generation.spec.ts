import { PrismaClient } from '@prisma/client';
import { truncateAll } from '../../test/db-test-utils';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ContactChannelsService } from '../contacts/contact-channels.service';
import { ReferenceService } from './reference.service';

describe('ReferenceService provider ID generation', () => {
  let prisma: PrismaService;
  let reference: ReferenceService;

  beforeAll(() => {
    prisma = new PrismaService();
    const audit = new AuditService(prisma);
    const contactChannels = new ContactChannelsService(prisma);
    reference = new ReferenceService(prisma, audit, contactChannels);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await truncateAll(prisma as unknown as PrismaClient);
  });

  it('assigns a VEN-###### ID, ignoring any providerId supplied by the caller', async () => {
    const created = await reference.createProvider({
      providerId: 'CALLER-SUPPLIED',
      name: 'Example Handling',
      serviceTypes: ['Overflight'],
      scopeType: 'Global',
      scope: 'GLOBAL',
    } as any);

    expect(created!.providerId).toMatch(/^VEN-\d{6}$/);
    expect(created!.providerId).not.toBe('CALLER-SUPPLIED');
  });

  it('never assigns the same providerId twice, even to concurrent creates', async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        reference.createProvider({ name: `Concurrent Vendor ${i}`, serviceTypes: ['Overflight'], scopeType: 'Global', scope: 'GLOBAL' } as any),
      ),
    );

    const ids = results.map((r) => r!.providerId);
    expect(new Set(ids).size).toBe(10);
  });
});
