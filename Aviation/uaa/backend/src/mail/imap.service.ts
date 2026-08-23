import { Injectable, Logger } from '@nestjs/common';
import { ImapFlow } from 'imapflow';
import { Interval } from '@nestjs/schedule';
import { PermitsService } from '../permits/permits.service';
import { parseCorrelationToken } from './correlation-token';

@Injectable()
export class ImapService {
  private readonly logger = new Logger(ImapService.name);
  private readonly client: ImapFlow | null;

  constructor(private readonly permitsService: PermitsService) {
    this.client = process.env.IMAP_HOST
      ? new ImapFlow({
          host: process.env.IMAP_HOST,
          port: Number(process.env.IMAP_PORT ?? 993),
          secure: process.env.IMAP_SECURE !== 'false',
          auth: { user: process.env.IMAP_USER ?? '', pass: process.env.IMAP_PASS ?? '' },
          logger: false,
        })
      : null;
  }

  async pollInbox(): Promise<{ filed: number; skipped: number }> {
    if (!this.client) {
      this.logger.warn('IMAP not configured — dry-run only. Skipping inbound poll.');
      return { filed: 0, skipped: 0 };
    }

    await this.client.connect();
    let filed = 0;
    let skipped = 0;

    try {
      await this.client.mailboxOpen('INBOX');
      const uids = await this.client.search({ seen: false });

      for (const uid of uids || []) {
        const message = await this.client.fetchOne(String(uid), { envelope: true, source: true });
        if (!message) continue;
        const subject = message.envelope?.subject ?? '';
        const token = parseCorrelationToken(subject);

        if (token) {
          await this.permitsService.addManualComm(token.permitRequestId, {
            fromAddress: message.envelope?.from?.[0]?.address ?? '',
            subject,
            body: message.source?.toString() ?? '',
          });
          filed++;
        } else {
          skipped++;
        }

        await this.client.messageFlagsAdd(String(uid), ['\\Seen']);
      }
    } finally {
      await this.client.logout();
    }

    return { filed, skipped };
  }

  @Interval(15 * 60 * 1000)
  async scheduledPoll() {
    const { filed, skipped } = await this.pollInbox();
    if (filed > 0 || skipped > 0) {
      this.logger.log(`Inbound poll: filed ${filed}, skipped ${skipped} (unmatched, needs manual filing).`);
    }
  }
}
