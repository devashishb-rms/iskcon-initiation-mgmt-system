import { timestamp, uuid } from 'drizzle-orm/pg-core';
import { tenants } from './core';

export const pk = () => uuid().primaryKey().defaultRandom();
/** Every table is tenant-scoped (ADR-0003). */
export const tenantCol = () =>
  uuid()
    .notNull()
    .references(() => tenants.id);
export const createdAtCol = () => timestamp({ withTimezone: true }).notNull().defaultNow();
export const tstz = () => timestamp({ withTimezone: true });
