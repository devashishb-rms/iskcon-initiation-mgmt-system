import { createReadStream } from 'node:fs';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import { GetObjectCommand, NoSuchKey, PutObjectCommand, S3Client, type ServerSideEncryption } from '@aws-sdk/client-s3';
import type { Env } from '../../config/env';
import { ObjectNotFoundError, ObjectStorage, type PutOptions } from './object-storage';

/** Development and tests: files under STORAGE_LOCAL_DIR. */
export class LocalObjectStorage extends ObjectStorage {
  private readonly root: string;

  constructor(dir: string) {
    super();
    this.root = resolve(dir);
  }

  async put(key: string, content: Buffer, _options: PutOptions): Promise<void> {
    const path = this.pathOf(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content, { flag: 'wx' });
  }

  async get(key: string): Promise<Readable> {
    const path = this.pathOf(key);
    try {
      await stat(path);
    } catch {
      throw new ObjectNotFoundError(key);
    }
    return createReadStream(path);
  }

  private pathOf(key: string): string {
    const path = resolve(this.root, key);
    if (!path.startsWith(this.root + sep)) throw new Error(`Object key escapes the storage directory: ${key}`);
    return path;
  }
}

/** AWS S3 or any S3-compatible store (MinIO, R2, Wasabi, ...). The bucket is private. */
export class S3ObjectStorage extends ObjectStorage {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly sse: ServerSideEncryption | undefined;

  constructor(env: Env) {
    super();
    if (!env.S3_BUCKET) throw new Error('S3_BUCKET is required when STORAGE_DRIVER=s3');
    this.bucket = env.S3_BUCKET;
    this.client = new S3Client({
      region: env.S3_REGION,
      endpoint: env.S3_ENDPOINT || undefined,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
      // Empty keys: the SDK's default chain (instance role on AWS).
      credentials:
        env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY
          ? { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY }
          : undefined,
    });
    const sse = env.S3_SSE ?? (env.S3_ENDPOINT ? 'none' : 'AES256');
    this.sse = sse === 'none' ? undefined : sse;
  }

  async put(key: string, content: Buffer, options: PutOptions): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: content,
        ContentType: options.mime,
        ServerSideEncryption: this.sse,
      }),
    );
  }

  async get(key: string): Promise<Readable> {
    try {
      const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      return res.Body as Readable;
    } catch (e) {
      if (e instanceof NoSuchKey || (e as { name?: string }).name === 'NotFound') throw new ObjectNotFoundError(key);
      throw e;
    }
  }
}
