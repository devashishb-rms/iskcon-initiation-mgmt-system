import { Injectable } from '@nestjs/common';
import archiver from 'archiver';
import type { Readable } from 'node:stream';

export interface ArchiveEntry {
  /** Path inside the zip. Never contains a directory part from user input. */
  name: string;
  content: Buffer | Readable;
}

/** Builds a zip in memory from buffers and streams (documents are read from storage as streams). */
@Injectable()
export class PackageArchive {
  build(entries: ArchiveEntry[]): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      const archive = archiver('zip', { zlib: { level: 6 } });
      const chunks: Buffer[] = [];
      archive.on('data', (c: Buffer) => chunks.push(c));
      archive.on('end', () => resolve(Buffer.concat(chunks)));
      archive.on('error', reject);
      archive.on('warning', reject);
      for (const e of entries) archive.append(e.content, { name: e.name });
      void archive.finalize().catch(reject);
    });
  }
}
