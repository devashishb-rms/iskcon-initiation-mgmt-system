import { Injectable } from '@nestjs/common';

export interface ScanResult {
  clean: boolean;
  /** Name of what was found, for the audit log (never shown to the uploader). */
  threat?: string;
}

/**
 * Integration point for anti-virus. Every upload passes through `scan` before it is stored. The
 * default implementation accepts everything: the type allow-list, the size cap and the magic-byte
 * check are the protection a temple gets out of the box. To add ClamAV (or a cloud scanner), write a
 * class that extends `VirusScanner` and bind it in `DocumentsModule`
 * (`{ provide: VirusScanner, useClass: ClamAvScanner }`); nothing else changes.
 */
export abstract class VirusScanner {
  abstract scan(content: Buffer, file: { filename: string; mime: string }): Promise<ScanResult>;
}

@Injectable()
export class NoopVirusScanner extends VirusScanner {
  async scan(): Promise<ScanResult> {
    return { clean: true };
  }
}
