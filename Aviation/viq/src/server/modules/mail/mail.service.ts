import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

export interface SendMailResult {
  ok: boolean;
  error?: string;
}

@Injectable()
export class MailService {
  private transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });

  async send({ to, subject, body }: { to: string; subject: string; body: string }): Promise<SendMailResult> {
    try {
      await this.transporter.sendMail({
        from: process.env.SMTP_FROM || 'VIQ Operations <ops@example.com>',
        to,
        subject,
        text: body,
      });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Unknown SMTP error' };
    }
  }
}
