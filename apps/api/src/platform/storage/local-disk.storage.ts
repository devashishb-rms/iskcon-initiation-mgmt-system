import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { assertSafeKey, ObjectNotFoundError, ObjectStorage } from './object-storage';

/**
 * Development, test and single-server installations: objects are files under one directory.
 * Keys are validated and the resolved path must stay inside the directory. Writes go to a temporary
 * file that is renamed into place, so a reader never sees a half-written object.
 */
export class LocalDiskStorage extends ObjectStorage {
  private readonly root: string;

  constructor(directory: string) {
    super();
    this.root = resolve(directory);
  }

  private pathOf(key: string): string {
    assertSafeKey(key);
    const full = resolve(this.root, key);
    if (!full.startsWith(this.root + sep)) throw new ObjectNotFoundError(key);
    return full;
  }

  /** The content type is not kept: a file on disk has none, and the database row remembers it. */
  async put(key: string, body: Buffer | Readable, _options?: { mime: string }): Promise<void> {
    const target = this.pathOf(key);
    await mkdir(dirname(target), { recursive: true, mode: 0o700 });
    const temp = `${target}.${randomUUID()}.part`;
    try {
      await pipeline(body instanceof Buffer ? Readable.from([body]) : body, createWriteStream(temp, { mode: 0o600 }));
      await rename(temp, target);
    } catch (e) {
      await rm(temp, { force: true });
      throw e;
    }
  }

  async get(key: string): Promise<Readable> {
    const target = this.pathOf(key);
    if (!(await this.exists(key))) throw new ObjectNotFoundError(key);
    return createReadStream(target);
  }

  async delete(key: string): Promise<void> {
    await rm(this.pathOf(key), { force: true });
  }

  async exists(key: string): Promise<boolean> {
    try {
      return (await stat(this.pathOf(key))).isFile();
    } catch {
      return false;
    }
  }
}
