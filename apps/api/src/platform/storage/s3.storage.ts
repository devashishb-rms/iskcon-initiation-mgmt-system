import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from '@aws-sdk/client-s3';
import { buffer } from 'node:stream/consumers';
import { Readable } from 'node:stream';
import { assertSafeKey, ObjectNotFoundError, ObjectStorage } from './object-storage';

export interface S3StorageOptions {
  bucket: string;
  region: string;
  /** Set for S3-compatible stores such as MinIO. */
  endpoint?: string;
  forcePathStyle?: boolean;
  /** Static credentials; when absent the SDK's default chain (instance role, environment) is used. */
  credentials?: { accessKeyId: string; secretAccessKey: string };
  /** Server-side encryption header sent with every upload; `null` when the store does not support it. */
  serverSideEncryption: 'AES256' | 'aws:kms' | null;
}

const isMissing = (e: unknown): boolean => {
  const err = e as { name?: string; $metadata?: { httpStatusCode?: number } };
  return err.name === 'NoSuchKey' || err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404;
};

/** S3 or any S3-compatible bucket (MinIO). The bucket must be private; objects are encrypted at rest. */
export class S3Storage extends ObjectStorage {
  constructor(
    private readonly options: S3StorageOptions,
    private readonly client: Pick<S3Client, 'send'> = new S3Client(clientConfig(options)),
  ) {
    super();
  }

  async put(key: string, body: Buffer | Readable, { mime }: { mime: string }): Promise<void> {
    assertSafeKey(key);
    // Uploads are capped (MAX_UPLOAD_MB), so a stream is read into memory: PutObject needs the length up front.
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.options.bucket,
        Key: key,
        Body: body instanceof Buffer ? body : await buffer(body),
        ContentType: mime,
        ...(this.options.serverSideEncryption ? { ServerSideEncryption: this.options.serverSideEncryption } : {}),
      }),
    );
  }

  async get(key: string): Promise<Readable> {
    assertSafeKey(key);
    try {
      const out = await this.client.send(new GetObjectCommand({ Bucket: this.options.bucket, Key: key }));
      if (!(out.Body instanceof Readable)) throw new ObjectNotFoundError(key);
      return out.Body;
    } catch (e) {
      if (isMissing(e)) throw new ObjectNotFoundError(key);
      throw e;
    }
  }

  async delete(key: string): Promise<void> {
    assertSafeKey(key);
    await this.client.send(new DeleteObjectCommand({ Bucket: this.options.bucket, Key: key }));
  }

  async exists(key: string): Promise<boolean> {
    assertSafeKey(key);
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.options.bucket, Key: key }));
      return true;
    } catch (e) {
      if (isMissing(e)) return false;
      throw e;
    }
  }
}

function clientConfig(o: S3StorageOptions): S3ClientConfig {
  return {
    region: o.region,
    ...(o.endpoint ? { endpoint: o.endpoint } : {}),
    forcePathStyle: o.forcePathStyle ?? false,
    ...(o.credentials ? { credentials: o.credentials } : {}),
  };
}
