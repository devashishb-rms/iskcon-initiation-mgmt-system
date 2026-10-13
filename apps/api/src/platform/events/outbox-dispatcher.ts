import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { and, eq, sql } from 'drizzle-orm';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env';
import { DB_POOL, DbService, UnitOfWork, type Database } from '../../database/database.module';
import { outboxEvents, processedEvents } from '../../database/schema';
import { RequestContextService } from '../tenancy/request-context';
import { SUBSCRIBE_KEY, type DeliveredEvent } from './subscribe';

interface Subscription {
  name: string;
  type: string;
  invoke: (event: DeliveredEvent) => Promise<void>;
}

const MAX_ATTEMPTS = 8;

/** Delivers outbox events to subscribers, at least once, safe to run on several instances. */
@Injectable()
export class OutboxDispatcher implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly log = new Logger(OutboxDispatcher.name);
  private subscriptions: Subscription[] = [];
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(DB_POOL) private readonly root: Database,
    private readonly uow: UnitOfWork,
    private readonly db: DbService,
    private readonly ctx: RequestContextService,
    private readonly discovery: DiscoveryService,
    private readonly scanner: MetadataScanner,
    private readonly reflector: Reflector,
  ) {}

  onApplicationBootstrap(): void {
    this.subscriptions = this.discoverSubscriptions();
    if (this.env.OUTBOX_ENABLED && this.env.NODE_ENV !== 'test') {
      this.timer = setInterval(() => void this.drain().catch((e) => this.log.error(e)), this.env.OUTBOX_POLL_MS);
    }
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private discoverSubscriptions(): Subscription[] {
    const found: Subscription[] = [];
    for (const wrapper of this.discovery.getProviders()) {
      const instance = wrapper.instance as Record<string, unknown> | undefined;
      if (!instance || typeof instance !== 'object') continue;
      const proto = Object.getPrototypeOf(instance) as object | null;
      if (!proto) continue;
      for (const method of this.scanner.getAllMethodNames(proto)) {
        const type = this.reflector.get<string | undefined>(SUBSCRIBE_KEY, (instance as never)[method]);
        if (!type) continue;
        found.push({
          type,
          name: `${instance.constructor.name}.${method}`,
          invoke: async (e) => {
            await ((instance as never)[method] as (e: DeliveredEvent) => Promise<void>).call(instance, e);
          },
        });
      }
    }
    return found;
  }

  /**
   * Handles one batch. Returns how many events were attempted. Tests call this directly instead of
   * waiting for the timer.
   */
  async drain(limit = 25): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      return await this.root.transaction(async (claim) => {
        const raw = (
          await claim.execute(sql`
            SELECT id, tenant_id AS "tenantId", type, payload, occurred_at AS "occurredAt", attempts
            FROM outbox_events
            WHERE status = 'PENDING' AND available_at <= now()
            ORDER BY id
            LIMIT ${limit}
            FOR UPDATE SKIP LOCKED`)
        ).rows as unknown as Array<DeliveredEvent & { attempts: number }>;
        // Postgres returns bigint ids as strings.
        const rows = raw.map((r) => ({ ...r, id: Number(r.id) }));

        for (const row of rows) {
          const subs = this.subscriptions.filter((s) => s.type === row.type);
          try {
            for (const sub of subs) await this.deliver(sub, row);
            await claim
              .update(outboxEvents)
              .set({ status: 'PROCESSED', processedAt: new Date() })
              .where(eq(outboxEvents.id, row.id));
          } catch (err) {
            const attempts = row.attempts + 1;
            const dead = attempts >= MAX_ATTEMPTS;
            this.log.error({ err, eventId: row.id, type: row.type, attempts }, 'Outbox handler failed');
            await claim
              .update(outboxEvents)
              .set({
                attempts,
                lastError: String((err as Error).message).slice(0, 500),
                status: dead ? 'DEAD' : 'PENDING',
                availableAt: new Date(Date.now() + 2 ** attempts * 1000),
              })
              .where(eq(outboxEvents.id, row.id));
          }
        }
        return rows.length;
      });
    } finally {
      this.running = false;
    }
  }

  private async deliver(sub: Subscription, event: DeliveredEvent): Promise<void> {
    const done = await this.root
      .select({ id: processedEvents.eventId })
      .from(processedEvents)
      .where(and(eq(processedEvents.eventId, event.id), eq(processedEvents.subscriber, sub.name)));
    if (done.length) return;
    await this.ctx.runAsSystem(
      event.tenantId,
      () =>
        this.uow.run(async () => {
          await sub.invoke(event);
          await this.db.client.insert(processedEvents).values({ eventId: event.id, subscriber: sub.name });
        }),
      `event-${event.id}`,
    );
  }
}
