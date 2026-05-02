import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class SmsProvider {
  private readonly logger = new Logger(SmsProvider.name);

  constructor(private config: ConfigService) {}

  async send(to: string, message: string): Promise<string> {
    const provider = this.config.get('sms.provider');
    try {
      if (provider === 'africastalking') {
        return this.sendViaAfricasTalking(to, message);
      }
      return this.sendViaTwilio(to, message);
    } catch (error) {
      this.logger.warn(`Primary SMS failed, trying fallback: ${error.message}`);
      // Failover to secondary provider
      if (provider === 'africastalking') {
        return this.sendViaTwilio(to, message);
      }
      return this.sendViaAfricasTalking(to, message);
    }
  }

  private async sendViaAfricasTalking(to: string, message: string): Promise<string> {
    const apiKey = this.config.get('sms.at.apiKey');
    const username = this.config.get('sms.at.username');
    const from = this.config.get('sms.at.senderId');

    const resp = await axios.post(
      'https://api.africastalking.com/version1/messaging',
      new URLSearchParams({ username, to, message, from }),
      {
        headers: {
          apiKey,
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      },
    );

    const result = resp.data?.SMSMessageData?.Recipients?.[0];
    this.logger.log(`SMS via AT to ${to}: ${result?.status}`);
    return result?.messageId || 'sent';
  }

  private async sendViaTwilio(to: string, message: string): Promise<string> {
    const accountSid = this.config.get('sms.twilio.accountSid');
    const authToken = this.config.get('sms.twilio.authToken');
    const from = this.config.get('sms.twilio.fromNumber');

    const resp = await axios.post(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      new URLSearchParams({ To: to, From: from, Body: message }),
      { auth: { username: accountSid, password: authToken } },
    );

    this.logger.log(`SMS via Twilio to ${to}: ${resp.data.sid}`);
    return resp.data.sid;
  }
}
