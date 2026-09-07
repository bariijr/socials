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
  localFallback?: boolean;
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
  private clamscan: ClamScanInstance | null = null;

  // Shared by onModuleInit (startup) and scan()'s lazy-retry path, so the
  // options object -- notably localFallback: false, see Fix 5 -- can never
  // drift between the two call sites.
  private initClamscan(): Promise<ClamScanInstance> {
    return new (NodeClam as NodeClamCtor)().init({
      removeInfected: false,
      // Never silently shell out to a local clamdscan binary if the TCP
      // scan fails -- that would run against whatever virus-definition
      // database happens to exist locally, an unverified scan path that
      // behaves differently from every environment this was tested in.
      localFallback: false,
      clamdscan: {
        host: process.env.CLAMAV_HOST || 'localhost',
        port: process.env.CLAMAV_PORT ? Number(process.env.CLAMAV_PORT) : 3320,
        timeout: 60000,
      },
      preference: 'clamdscan',
    });
  }

  async onModuleInit() {
    // Deliberately non-fatal: this.clamscan is a provider inside
    // DocumentsModule, which AppModule imports. A rejected onModuleInit
    // would make NestFactory.create(AppModule) reject and crash the whole
    // process on boot -- not just document processing -- if ClamAV happens
    // to still be unreachable (e.g. its documented several-minute
    // first-boot window downloading virus definitions, with no
    // ordering/health-wait enforced between it and the app). Instead we
    // leave clamscan null and retry lazily from scan().
    try {
      this.clamscan = await this.initClamscan();
      this.logger.log('ClamAV client ready');
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      this.logger.warn(`ClamAV client failed to initialize at startup, will retry lazily on first scan: ${message}`);
    }
  }

  async scan(filePath: string): Promise<ScanResult> {
    if (!this.clamscan) {
      try {
        this.clamscan = await this.initClamscan();
        this.logger.log('ClamAV client ready (lazy init)');
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Unknown error';
        throw new Error(`ClamAV is unreachable, cannot scan ${filePath}: ${message}`);
      }
    }

    const { isInfected, viruses } = await this.clamscan.isInfected(filePath);
    if (isInfected === null) {
      // node-clam returns null for a read timeout or any unrecognized
      // daemon response -- not just for "definitely clean". Treating that
      // as clean would be a fail-open security gate, so an indeterminate
      // result throws instead, which the processor's catch-all maps to
      // PROCESSING_FAILED and BullMQ retries.
      throw new Error(`ClamAV returned an indeterminate result for ${filePath}`);
    }
    return isInfected ? { clean: false, signature: viruses?.[0] } : { clean: true };
  }
}
