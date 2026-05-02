import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailProvider {
  private readonly logger = new Logger(EmailProvider.name);
  private transporter: nodemailer.Transporter;

  constructor(private config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: config.get('email.host'),
      port: config.get('email.port'),
      secure: config.get('email.secure'),
      auth: {
        user: config.get('email.user'),
        pass: config.get('email.pass'),
      },
      pool: true,
      maxConnections: 5,
    });
  }

  async send(to: string, subject: string, html: string, text?: string): Promise<string> {
    const info = await this.transporter.sendMail({
      from: this.config.get('email.from'),
      to,
      subject,
      html,
      text: text || html.replace(/<[^>]*>/g, ''),
    });
    this.logger.log(`Email sent to ${to}: ${info.messageId}`);
    return info.messageId;
  }

  async sendBulk(recipients: string[], subject: string, html: string): Promise<void> {
    await Promise.allSettled(recipients.map((r) => this.send(r, subject, html)));
  }

  renderTemplate(template: string, vars: Record<string, any>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '');
  }
}
