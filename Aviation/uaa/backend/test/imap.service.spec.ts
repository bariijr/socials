import { Test } from '@nestjs/testing';
import { ImapService } from '../src/mail/imap.service';
import { PermitsService } from '../src/permits/permits.service';

describe('ImapService', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('dry-runs (no connection attempt) when IMAP_HOST is not configured', async () => {
    delete process.env.IMAP_HOST;
    const addManualComm = jest.fn();

    const moduleRef = await Test.createTestingModule({
      providers: [ImapService, { provide: PermitsService, useValue: { addManualComm } }],
    }).compile();
    const service = moduleRef.get(ImapService);

    const result = await service.pollInbox();

    expect(result).toEqual({ filed: 0, skipped: 0 });
    expect(addManualComm).not.toHaveBeenCalled();
  });

  it('files a message whose subject carries a matching correlation token', async () => {
    process.env.IMAP_HOST = 'imap.example.com';
    const addManualComm = jest.fn().mockResolvedValue({ id: 'comm-1' });

    const moduleRef = await Test.createTestingModule({
      providers: [ImapService, { provide: PermitsService, useValue: { addManualComm } }],
    }).compile();
    const service = moduleRef.get(ImapService);

    const fakeClient = {
      connect: jest.fn().mockResolvedValue(undefined),
      logout: jest.fn().mockResolvedValue(undefined),
      mailboxOpen: jest.fn().mockResolvedValue(undefined),
      search: jest.fn().mockResolvedValue([42]),
      fetchOne: jest.fn().mockResolvedValue({
        envelope: {
          subject: 'RE: Permit Request — Trip 482421 — Egypt [149/5c8f18b2-9f30-4438-a51e-aac332077443]',
          from: [{ address: 'permits.eg@example.com' }],
        },
        source: Buffer.from('body text'),
      }),
      messageFlagsAdd: jest.fn().mockResolvedValue(undefined),
    };
    (service as any).client = fakeClient;

    const result = await service.pollInbox();

    expect(addManualComm).toHaveBeenCalledWith(
      '5c8f18b2-9f30-4438-a51e-aac332077443',
      expect.objectContaining({ fromAddress: 'permits.eg@example.com' }),
    );
    expect(result).toEqual({ filed: 1, skipped: 0 });
  });

  it('leaves an unmatched message for the manual "file this email" fallback', async () => {
    process.env.IMAP_HOST = 'imap.example.com';
    const addManualComm = jest.fn();

    const moduleRef = await Test.createTestingModule({
      providers: [ImapService, { provide: PermitsService, useValue: { addManualComm } }],
    }).compile();
    const service = moduleRef.get(ImapService);

    const fakeClient = {
      connect: jest.fn().mockResolvedValue(undefined),
      logout: jest.fn().mockResolvedValue(undefined),
      mailboxOpen: jest.fn().mockResolvedValue(undefined),
      search: jest.fn().mockResolvedValue([43]),
      fetchOne: jest.fn().mockResolvedValue({
        envelope: { subject: 'Out of office', from: [{ address: 'someone@example.com' }] },
        source: Buffer.from('body text'),
      }),
      messageFlagsAdd: jest.fn().mockResolvedValue(undefined),
    };
    (service as any).client = fakeClient;

    const result = await service.pollInbox();

    expect(addManualComm).not.toHaveBeenCalled();
    expect(result).toEqual({ filed: 0, skipped: 1 });
  });
});
