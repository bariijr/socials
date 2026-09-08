import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MailService } from '../mail/mail.service';
import { CommsService } from './comms.service';
import { truncateAll } from '../../test/db-test-utils';

describe('CommsService.failed (Action Board widget)', () => {
  let prisma: PrismaService;
  let comms: CommsService;

  beforeAll(() => {
    prisma = new PrismaService();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    comms = new CommsService(prisma, new AuditService(prisma), {} as MailService);
    await prisma.trip.create({ data: { tripId: 'TEST-COMMFAIL-1', client: 'Test Client' } });
  });

  it('returns only Failed comms, most recent first', async () => {
    await prisma.comm.create({
      data: { commId: 'C-1', direction: 'Outbound', tripId: 'TEST-COMMFAIL-1', from: 'a@x.com', to: 'b@x.com', subject: 'Permit request', body: '...', status: 'Sent' },
    });
    await prisma.comm.create({
      data: { commId: 'C-2', direction: 'Outbound', tripId: 'TEST-COMMFAIL-1', from: 'a@x.com', to: 'b@x.com', subject: 'Handling request', body: '...', status: 'Failed', errorMessage: 'SMTP timeout' },
    });
    const failed = await comms.failed(20);
    expect(failed).toHaveLength(1);
    expect(failed[0].commId).toBe('C-2');
  });

  it('filters by search across trip/subject/recipient', async () => {
    await prisma.comm.create({
      data: { commId: 'C-3', direction: 'Outbound', tripId: 'TEST-COMMFAIL-1', from: 'a@x.com', to: 'ops@vendor.com', subject: 'Overflight Kenya', body: '...', status: 'Failed' },
    });
    const matched = await comms.failed(20, 'Kenya');
    expect(matched).toHaveLength(1);
    const unmatched = await comms.failed(20, 'Nonexistent');
    expect(unmatched).toHaveLength(0);
  });
});
