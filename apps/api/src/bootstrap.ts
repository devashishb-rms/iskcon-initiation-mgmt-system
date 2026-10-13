import { type INestApplication, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Logger as PinoLogger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { ENV } from './config/config.module';
import type { Env } from './config/env';

/** Builds the HTTP app. Shared by `main.ts` and the integration tests so both run the same wiring. */
export async function createApp(): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  configureApp(app);
  return app;
}

export function configureApp(app: INestApplication): void {
  const env = app.get<Env>(ENV);
  const express = app as NestExpressApplication;
  express.set('trust proxy', 1);
  express.disable('x-powered-by');
  app.useLogger(app.get(PinoLogger));
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cookieParser());
  if (env.CORS_ORIGIN) app.enableCors({ origin: env.CORS_ORIGIN.split(','), credentials: true, exposedHeaders: ['X-Unread-Count', 'Content-Disposition'] });
  app.enableShutdownHooks();
  new Logger('Bootstrap').log(`Configured for ${env.NODE_ENV}`);
}
