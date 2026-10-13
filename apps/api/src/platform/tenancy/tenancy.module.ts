import { Global, Inject, Injectable, MiddlewareConsumer, Module, type NestMiddleware, type NestModule } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { DbService } from '../../database/database.module';
import { tenants } from '../../database/schema';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env';
import { RequestContextService } from './request-context';
import { AppError } from '../../common/errors';

export interface TenantRecord {
  id: string;
  slug: string;
  name: string;
  timezone: string;
  defaultLocale: string;
}

/**
 * Decides which temple a request is for. Today there is one answer, from configuration. The SaaS
 * build swaps this class for one that reads the sub-domain; nothing else changes (ADR-0003).
 */
export abstract class TenantResolver {
  abstract resolve(req: Request): Promise<TenantRecord>;
}

@Injectable()
export class TenantDirectory {
  private cache = new Map<string, { at: number; tenant: TenantRecord }>();
  constructor(private readonly db: DbService) {}

  async bySlug(slug: string): Promise<TenantRecord | undefined> {
    const hit = this.cache.get(slug);
    if (hit && Date.now() - hit.at < 60_000) return hit.tenant;
    const [row] = await this.db.client.select().from(tenants).where(eq(tenants.slug, slug)).limit(1);
    if (!row) return undefined;
    this.cache.set(slug, { at: Date.now(), tenant: row });
    return row;
  }
  async byId(id: string): Promise<TenantRecord | undefined> {
    const [row] = await this.db.client.select().from(tenants).where(eq(tenants.id, id)).limit(1);
    return row;
  }
  async all(): Promise<TenantRecord[]> {
    return this.db.client.select().from(tenants);
  }
  clearCache(): void {
    this.cache.clear();
  }
}

@Injectable()
export class SingleTenantResolver extends TenantResolver {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly directory: TenantDirectory,
  ) {
    super();
  }
  async resolve(): Promise<TenantRecord> {
    const tenant = await this.directory.bySlug(this.env.DEFAULT_TENANT_SLUG);
    if (!tenant) throw new AppError('NOT_FOUND', 404, `Tenant "${this.env.DEFAULT_TENANT_SLUG}" does not exist. Run the seed.`);
    return tenant;
  }
}

/** Opens the request context (request id, tenant, caller address) for everything that follows. */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(
    private readonly ctx: RequestContextService,
    private readonly resolver: TenantResolver,
  ) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const incoming = req.header('x-request-id');
    const requestId = incoming && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID();
    res.setHeader('x-request-id', requestId);
    this.resolver.resolve(req).then(
      (tenant) =>
        this.ctx.run(
          { requestId, tenantId: tenant.id, ip: req.ip, userAgent: req.header('user-agent') ?? undefined },
          () => next(),
        ),
      (err) => next(err),
    );
  }
}

@Global()
@Module({
  providers: [
    RequestContextService,
    TenantDirectory,
    { provide: TenantResolver, useClass: SingleTenantResolver },
    RequestContextMiddleware,
  ],
  exports: [RequestContextService, TenantDirectory, TenantResolver],
})
export class TenancyModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes('*path');
  }
}
