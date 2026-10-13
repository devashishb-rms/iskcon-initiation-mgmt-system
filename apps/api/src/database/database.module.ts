import { Global, Inject, Injectable, Module, type OnApplicationShutdown } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { NodePgQueryResultHKT } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import * as schema from './schema';

export { schema };
/** Works for the pool and for a transaction alike. */
export type DbClient = PgDatabase<NodePgQueryResultHKT, typeof schema>;
export type Database = NodePgDatabase<typeof schema>;

export const DB_POOL = Symbol('DB_POOL');

interface UowStore {
  tx: DbClient;
  afterCommit: Array<() => Promise<void> | void>;
}

/**
 * Unit of work: everything inside `run` commits or rolls back together, including the outbox events
 * published on the way. Repositories never open transactions; they ask `DbService.client`, which
 * is the active transaction when there is one.
 */
@Injectable()
export class UnitOfWork {
  private readonly als = new AsyncLocalStorage<UowStore>();

  constructor(@Inject(DB_POOL) private readonly root: Database) {}

  get active(): DbClient | undefined {
    return this.als.getStore()?.tx;
  }

  /** Joins the surrounding transaction if there is one. */
  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.als.getStore()) return fn();
    const afterCommit: UowStore['afterCommit'] = [];
    const result = await this.root.transaction((tx) => this.als.run({ tx, afterCommit }, fn));
    for (const cb of afterCommit) await cb();
    return result;
  }

  /** Runs after the transaction commits (send a mail, start a job). Runs now if there is no transaction. */
  async afterCommit(cb: () => Promise<void> | void): Promise<void> {
    const store = this.als.getStore();
    if (store) store.afterCommit.push(cb);
    else await cb();
  }
}

@Injectable()
export class DbService {
  constructor(
    @Inject(DB_POOL) private readonly root: Database,
    private readonly uow: UnitOfWork,
  ) {}

  /** The active transaction, or the pool. */
  get client(): DbClient {
    return this.uow.active ?? this.root;
  }
}

@Global()
@Module({
  providers: [
    {
      provide: DB_POOL,
      inject: [ENV],
      useFactory: (env: Env): Database => {
        const pool = new Pool({ connectionString: env.DATABASE_URL, max: env.DATABASE_POOL_MAX });
        return Object.assign(drizzle(pool, { schema, casing: 'snake_case' }), { $pool: pool });
      },
    },
    UnitOfWork,
    DbService,
  ],
  exports: [DB_POOL, UnitOfWork, DbService],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(DB_POOL) private readonly db: Database) {}

  async onApplicationShutdown(): Promise<void> {
    await (this.db as unknown as { $pool: Pool }).$pool.end();
  }
}
