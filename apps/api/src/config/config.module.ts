import { Global, Module } from '@nestjs/common';
import { parseEnv, type Env } from './env';

export const ENV = Symbol('ENV');

/** Provides the validated `Env` object. Inject with `@Inject(ENV)`. */
@Global()
@Module({
  providers: [{ provide: ENV, useFactory: (): Env => parseEnv() }],
  exports: [ENV],
})
export class AppConfigModule {}
