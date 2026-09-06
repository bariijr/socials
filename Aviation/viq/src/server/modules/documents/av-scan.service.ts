// src/server/modules/documents/av-scan.service.ts
//
// Thin wrapper around a ClamAV daemon reached over TCP (no local clamscan/
// clamdscan binary needed -- clamd's network protocol is used directly).
// Deliberately a single narrow method so it's trivial to substitute a fake
// in tests -- npm test must never require a running ClamAV daemon.
//
// NOTE: the `clamscan` package (v2.4.0 as installed) ships no TypeScript
// type definitions at all (no .d.ts anywhere in the package, no "types"/
// "typings" field in its package.json, and no @types/clamscan package
// exists on npm). It's a plain CommonJS module exporting a class directly
// (`module.exports = NodeClam`). We declare the minimal shape we actually
// use ourselves rather than pulling in nonexistent upstream types.
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const NodeClam = require('clamscan');

interface ClamScanIsInfectedResult {
  file: string;
  isInfected: boolean | null;
  viruses: string[];
}

interface ClamScanInstance {
  isInfected(filePath: string): Promise<ClamScanIsInfectedResult>;
}

interface NodeClamInitOptions {
  removeInfected?: boolean;
  clamdscan?: {
    host?: string;
    port?: number;
    timeout?: number;
  };
  preference?: 'clamdscan' | 'clamscan';
}

interface NodeClamCtor {
  new (): {
    init(options: NodeClamInitOptions): Promise<ClamScanInstance>;
  };
}

export interface ScanResult {
  clean: boolean;
  signature?: string;
}

@Injectable()
export class AvScanService implements OnModuleInit {
  private readonly logger = new Logger(AvScanService.name);
  private clamscan!: ClamScanInstance;

  async onModuleInit() {
    this.clamscan = await new (NodeClam as NodeClamCtor)().init({
      removeInfected: false,
      clamdscan: {
        host: process.env.CLAMAV_HOST || 'localhost',
        port: process.env.CLAMAV_PORT ? Number(process.env.CLAMAV_PORT) : 3320,
        timeout: 60000,
      },
      preference: 'clamdscan',
    });
    this.logger.log('ClamAV client ready');
  }

  async scan(filePath: string): Promise<ScanResult> {
    const { isInfected, viruses } = await this.clamscan.isInfected(filePath);
    return isInfected ? { clean: false, signature: viruses?.[0] } : { clean: true };
  }
}
