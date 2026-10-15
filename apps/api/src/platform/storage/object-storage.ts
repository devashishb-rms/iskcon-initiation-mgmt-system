import { randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';

export interface PutOptions {
  mime: string;
}

/** Port. Modules depend on this, never on the S3 SDK or the file system (dependency inversion). */
export abstract class ObjectStorage {
  abstract put(key: string, content: Buffer, options: PutOptions): Promise<void>;
  /** Rejects with `ObjectNotFoundError` when nothing is stored under the key. */
  abstract get(key: string): Promise<Readable>;
}

export class ObjectNotFoundError extends Error {
  constructor(readonly key: string) {
    super(`No object stored under ${key}`);
    this.name = 'ObjectNotFoundError';
  }
}

/** A new, unguessable key for a file on an application. Nothing about the file itself is in it. */
export function applicationObjectKey(tenantId: string, applicationId: string): string {
  return `${tenantId}/applications/${applicationId}/${randomUUID()}`;
}
