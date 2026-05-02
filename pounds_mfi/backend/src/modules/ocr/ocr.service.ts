import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createWorker } from 'tesseract.js';
import * as fs from 'fs';
import * as path from 'path';

export interface OcrResult {
  text: string;
  confidence: number;
  extracted: {
    receiptNumber?: string;
    amount?: number;
    date?: string;
    payerName?: string;
    bankName?: string;
  };
}

@Injectable()
export class OcrService {
  private readonly logger = new Logger(OcrService.name);

  constructor(private config: ConfigService) {}

  async extractText(filePath: string, mimeType?: string): Promise<OcrResult> {
    try {
      const worker = await createWorker('eng');
      const { data } = await worker.recognize(filePath);
      await worker.terminate();

      const extracted = this.parseReceiptText(data.text);
      return {
        text: data.text,
        confidence: data.confidence,
        extracted,
      };
    } catch (error) {
      this.logger.error(`OCR failed for ${filePath}: ${error.message}`);
      return {
        text: '',
        confidence: 0,
        extracted: {},
      };
    }
  }

  private parseReceiptText(text: string): OcrResult['extracted'] {
    const result: OcrResult['extracted'] = {};

    // Receipt number patterns
    const receiptPatterns = [
      /receipt\s*(?:no|number|#)[:\s]*([A-Z0-9\-]+)/i,
      /ref(?:erence)?\s*(?:no|number|#)?[:\s]*([A-Z0-9\-]+)/i,
      /txn?\s*(?:id|no)?[:\s]*([A-Z0-9\-]+)/i,
      /transaction\s*id[:\s]*([A-Z0-9\-]+)/i,
    ];
    for (const pattern of receiptPatterns) {
      const match = text.match(pattern);
      if (match) { result.receiptNumber = match[1].trim(); break; }
    }

    // Amount patterns
    const amountPatterns = [
      /(?:amount|total|ksh?|kes)[:\s]*([0-9,]+(?:\.[0-9]{2})?)/i,
      /([0-9,]+\.[0-9]{2})\s*(?:ksh?|kes|usd)?/i,
    ];
    for (const pattern of amountPatterns) {
      const match = text.match(pattern);
      if (match) {
        result.amount = parseFloat(match[1].replace(/,/g, ''));
        break;
      }
    }

    // Date patterns
    const datePatterns = [
      /(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/,
      /(\d{4}[\/\-\.]\d{2}[\/\-\.]\d{2})/,
      /((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4})/i,
    ];
    for (const pattern of datePatterns) {
      const match = text.match(pattern);
      if (match) { result.date = match[1]; break; }
    }

    // Payer name
    const nameMatch = text.match(/(?:from|sender|payer)[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i);
    if (nameMatch) result.payerName = nameMatch[1];

    // Bank name
    const banks = ['equity', 'kcb', 'cooperative', 'absa', 'ncba', 'stanbic', 'dtb', 'mpesa', 'airtel'];
    for (const bank of banks) {
      if (text.toLowerCase().includes(bank)) {
        result.bankName = bank.toUpperCase();
        break;
      }
    }

    return result;
  }

  async computeFileHash(filePath: string): Promise<string> {
    const crypto = await import('crypto');
    const content = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  async computeFingerprint(filePath: string): Promise<string> {
    const crypto = await import('crypto');
    const stats = fs.statSync(filePath);
    const sample = Buffer.alloc(Math.min(1024, stats.size));
    const fd = fs.openSync(filePath, 'r');
    fs.readSync(fd, sample, 0, sample.length, 0);
    fs.closeSync(fd);
    return crypto.createHash('md5')
      .update(`${stats.size}:${sample.toString('hex')}`)
      .digest('hex');
  }
}
