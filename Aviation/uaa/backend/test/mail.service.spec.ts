import { Test } from '@nestjs/testing';
import { MailService } from '../src/mail/mail.service';

describe('MailService', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('sends via the configured SMTP transport when SMTP_HOST is set', async () => {
    process.env.SMTP_HOST = 'smtp.example.com';
    process.env.SMTP_PORT = '587';
    process.env.SMTP_USER = 'user';
    process.env.SMTP_PASS = 'pass';
    process.env.SMTP_FROM = 'from@example.com';

    const sendMail = jest.fn().mockResolvedValue({ messageId: '1' });
    const moduleRef = await Test.createTestingModule({ providers: [MailService] }).compile();
    const service = moduleRef.get(MailService);
    (service as any).transporter = { sendMail };

    const result = await service.send({ to: 'to@example.com', subject: 'Subj', body: 'Body' });

    expect(sendMail).toHaveBeenCalledWith({
      from: 'from@example.com',
      to: 'to@example.com',
      subject: 'Subj',
      text: 'Body',
    });
    expect(result).toEqual({ sent: true });
  });

  it('passes cc and bcc through to the SMTP transport when provided', async () => {
    process.env.SMTP_HOST = 'smtp.example.com';
    process.env.SMTP_FROM = 'from@example.com';

    const sendMail = jest.fn().mockResolvedValue({ messageId: '1' });
    const moduleRef = await Test.createTestingModule({ providers: [MailService] }).compile();
    const service = moduleRef.get(MailService);
    (service as any).transporter = { sendMail };

    await service.send({ to: 'to@example.com', cc: 'cc@example.com', bcc: 'bcc@example.com', subject: 'Subj', body: 'Body' });

    expect(sendMail).toHaveBeenCalledWith({
      from: 'from@example.com',
      to: 'to@example.com',
      cc: 'cc@example.com',
      bcc: 'bcc@example.com',
      subject: 'Subj',
      text: 'Body',
    });
  });

  it('dry-runs (logs, does not throw) when SMTP_HOST is not configured', async () => {
    delete process.env.SMTP_HOST;

    const moduleRef = await Test.createTestingModule({ providers: [MailService] }).compile();
    const service = moduleRef.get(MailService);

    const result = await service.send({ to: 'to@example.com', subject: 'Subj', body: 'Body' });

    expect(result).toEqual({ sent: false });
  });
});
