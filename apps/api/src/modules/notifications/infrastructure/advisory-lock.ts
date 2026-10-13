import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DbService, UnitOfWork } from '../../../database/database.module';

/**
 * Postgres advisory locks that last until the surrounding transaction ends. Two API instances that
 * wake up for the same scheduled job race for the lock; the loser skips the run.
 */
@Injectable()
export class AdvisoryLock {
  constructor(
    private readonly db: DbService,
    private readonly uow: UnitOfWork,
  ) {}

  /** True when this transaction now holds the lock `name`; false when another transaction does. */
  async tryAcquire(name: string): Promise<boolean> {
    if (!this.uow.active) throw new Error('An advisory lock must be taken inside a unit of work');
    const result = await this.db.client.execute(sql`SELECT pg_try_advisory_xact_lock(hashtextextended(${name}, 0)) AS acquired`);
    return (result.rows[0] as { acquired: boolean } | undefined)?.acquired === true;
  }
}
