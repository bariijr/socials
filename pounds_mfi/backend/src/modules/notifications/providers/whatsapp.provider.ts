import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class WhatsAppProvider {
  private readonly logger = new Logger(WhatsAppProvider.name);

  constructor(private config: ConfigService) {}

  async send(to: string, message: string): Promise<string> {
    const provider = this.config.get('whatsapp.provider');
    try {
      if (provider === '360dialog') return this.sendVia360dialog(to, message);
      return this.sendViaMetaCloud(to, message);
    } catch (error) {
      this.logger.error(`WhatsApp send failed: ${error.message}`);
      throw error;
    }
  }

  private async sendVia360dialog(to: string, message: string): Promise<string> {
    const apiKey = this.config.get('whatsapp.apiKey');
    const apiUrl = this.config.get('whatsapp.apiUrl');
    const from = this.config.get('whatsapp.fromNumber');

    const resp = await axios.post(
      `${apiUrl}/messages`,
      {
        recipient_type: 'individual',
        to,
        type: 'text',
        text: { body: message },
      },
      { headers: { 'D360-API-KEY': apiKey, 'Content-Type': 'application/json' } },
    );

    this.logger.log(`WhatsApp via 360dialog to ${to}: ${resp.data.messages?.[0]?.id}`);
    return resp.data.messages?.[0]?.id || 'sent';
  }

  private async sendViaMetaCloud(to: string, message: string): Promise<string> {
    const apiKey = this.config.get('whatsapp.apiKey');
    const from = this.config.get('whatsapp.fromNumber');

    const resp = await axios.post(
      `https://graph.facebook.com/v18.0/${from}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: { preview_url: false, body: message },
      },
      { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' } },
    );

    return resp.data.messages?.[0]?.id || 'sent';
  }
}
