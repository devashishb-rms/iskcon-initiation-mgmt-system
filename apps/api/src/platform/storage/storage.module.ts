import { Module } from '@nestjs/common';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env';
import { LocalObjectStorage, S3ObjectStorage } from './adapters';
import { ObjectStorage } from './object-storage';

@Module({
  providers: [
    {
      provide: ObjectStorage,
      inject: [ENV],
      useFactory: (env: Env) =>
        env.STORAGE_DRIVER === 's3' ? new S3ObjectStorage(env) : new LocalObjectStorage(env.STORAGE_LOCAL_DIR),
    },
  ],
  exports: [ObjectStorage],
})
export class StorageModule {}
