import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { ENV, AppConfigModule } from './config/config.module';
import type { Env } from './config/env';
import { ProblemFilter } from './common/problem.filter';
import { DatabaseModule } from './database/database.module';
import { DeliveryModule } from './platform/delivery/delivery.module';
import { EventsModule } from './platform/events/events.module';
import { RequestContextService } from './platform/tenancy/request-context';
import { TenancyModule } from './platform/tenancy/tenancy.module';
import { ClockModule } from './platform/clock/clock.module';
import { SecurityModule } from './platform/security/security.module';
import { AuditModule } from './modules/audit';
import { IdentityModule } from './modules/identity';
import { HealthModule } from './platform/health/health.module';

/**
 * The composition root. The application is a modular monolith: every feature is a module with its
 * own folder, its own tables and a small public surface (`index.ts`). See docs/architecture.md.
 */
@Module({
  imports: [
    AppConfigModule,
    LoggerModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({
        pinoHttp: {
          level: env.LOG_LEVEL,
          redact: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'],
          autoLogging: { ignore: (req) => req.url === '/healthz' || req.url === '/readyz' },
          customProps: () => ({}),
          ...(env.NODE_ENV === 'development' ? { transport: { target: 'pino-pretty' } } : {}),
        },
      }),
    }),
    ThrottlerModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: Env) => [{ ttl: 60_000, limit: env.NODE_ENV === 'test' ? 100_000 : 300 }],
    }),
    ScheduleModule.forRoot(),
    DatabaseModule,
    ClockModule,
    SecurityModule,
    TenancyModule,
    EventsModule,
    DeliveryModule,
    HealthModule,
    AuditModule,
    IdentityModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      inject: [RequestContextService],
      useFactory: (ctx: RequestContextService) => new ProblemFilter(ctx),
    },
  ],
})
export class AppModule {}
