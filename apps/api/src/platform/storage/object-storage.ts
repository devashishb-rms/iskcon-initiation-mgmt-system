import { randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';

/**
 * The port for private file storage. Business code depends on this abstract class; Nest binds the
 * local-disk or S3 implementation from configuration (`STORAGE_DRIVER`). Files are never public:
 * there is no URL method on purpose, downloads stream through the API after an access check (NFR-7).
 */
export abstract class ObjectStorage {
  /** Stores the bytes under `key`, replacing any earlier object. */
  abstract put(key: string, body: Buffer | Readable, options: { mime: string }): Promise<void>;
  /** The object's bytes. Throws `ObjectNotFoundError` if there is none. */
  abstract get(key: string): Promise<Readable>;
  /** Removes the object. Removing something that is not there is not an error. */
  abstract delete(key: string): Promise<void>;
  abstract exists(key: string): Promise<boolean>;
}

export class ObjectNotFoundError extends Error {
  constructor(readonly key: string) {
    super(`Object not found: ${key}`);
    this.name = 'ObjectNotFoundError';
  }
}

export class InvalidObjectKeyError extends Error {
  constructor(readonly key: string) {
    super('Invalid object key');
    this.name = 'InvalidObjectKeyError';
  }
}

const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const MAX_KEY_LENGTH = 512;

/**
 * A key is `/`-separated segments of letters, digits, dot, dash and underscore. No empty segment, no
 * `.` or `..`, no leading slash, no backslash: nothing that can leave the storage directory or
 * surprise an S3 listing. Every driver validates every key, so a bug elsewhere cannot become a
 * path traversal.
 */
export function assertSafeKey(key: string): void {
  const ok =
    key.length > 0 &&
    key.length <= MAX_KEY_LENGTH &&
    key.split('/').every((s) => SEGMENT.test(s) && s !== '..' && !s.endsWith('.'));
  if (!ok) throw new InvalidObjectKeyError(key);
}

/** `tenants/<tenantId>/applications/<applicationId>/<uuid>`: random, and never derived from a file name. */
export function applicationObjectKey(tenantId: string, applicationId: string): string {
  const key = `tenants/${tenantId}/applications/${applicationId}/${randomUUID()}`;
  assertSafeKey(key);
  return key;
}
