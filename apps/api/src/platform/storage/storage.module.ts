import { Global, Module } from '@nestjs/common';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env';
import { LocalDiskStorage } from './local-disk.storage';
import { ObjectStorage } from './object-storage';
import { S3Storage, type S3StorageOptions } from './s3.storage';

/**
 * Server-side encryption for S3 uploads: `AES256` (SSE-S3, the default on AWS), `aws:kms`, or `none`
 * for S3-compatible stores that have no key service configured (a MinIO started without KMS refuses
 * the header, so `none` is the default when `S3_ENDPOINT` is set).
 */
export function s3OptionsFromEnv(env: Env): S3StorageOptions {
  if (!env.S3_BUCKET) throw new Error('STORAGE_DRIVER=s3 needs S3_BUCKET');
  const sse = env.S3_SSE ?? (env.S3_ENDPOINT ? 'none' : 'AES256');
  return {
    bucket: env.S3_BUCKET,
    region: env.S3_REGION,
    endpoint: env.S3_ENDPOINT,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    credentials:
      env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY
        ? { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY }
        : undefined,
    serverSideEncryption: sse === 'none' ? null : sse,
  };
}

/** Private file storage for the whole application. The driver is chosen by `STORAGE_DRIVER` (`local` or `s3`). */
@Global()
@Module({
  providers: [
    {
      provide: ObjectStorage,
      inject: [ENV],
      useFactory: (env: Env): ObjectStorage =>
        env.STORAGE_DRIVER === 's3' ? new S3Storage(s3OptionsFromEnv(env)) : new LocalDiskStorage(env.STORAGE_LOCAL_DIR),
    },
  ],
  exports: [ObjectStorage],
})
export class StorageModule {}
