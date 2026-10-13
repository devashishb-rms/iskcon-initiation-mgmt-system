import {
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { pk, tenantCol, createdAtCol, tstz } from './_helpers';
import { channelEnum, roleEnum } from './enums';

export const users = pgTable(
  'users',
  {
    id: pk(),
    tenantId: tenantCol(),
    name: text().notNull(),
    email: text(),
    phone: text(),
    locale: text().notNull().default('en'),
    active: boolean().notNull().default(true),
    /** AES-256-GCM sealed TOTP secret, present only after the person enrolled a second factor. */
    totpSecretSealed: text(),
    totpEnabledAt: tstz(),
    createdAt: createdAtCol(),
    updatedAt: createdAtCol(),
  },
  (t) => [
    unique('users_tenant_id_uq').on(t.tenantId, t.id),
    unique('users_tenant_email_uq').on(t.tenantId, t.email),
    unique('users_tenant_phone_uq').on(t.tenantId, t.phone),
  ],
);

export const userRoles = pgTable(
  'user_roles',
  {
    tenantId: tenantCol(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: roleEnum().notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.role] }), index('user_roles_tenant_role_idx').on(t.tenantId, t.role)],
);

export const otpChallenges = pgTable(
  'otp_challenges',
  {
    id: pk(),
    tenantId: tenantCol(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    channel: channelEnum().notNull(),
    destination: text().notNull(),
    codeHash: text().notNull(),
    attempts: integer().notNull().default(0),
    expiresAt: tstz().notNull(),
    consumedAt: tstz(),
    createdAt: createdAtCol(),
  },
  (t) => [index('otp_user_created_idx').on(t.tenantId, t.userId, t.createdAt)],
);

export const sessions = pgTable(
  'sessions',
  {
    id: pk(),
    tenantId: tenantCol(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** SHA-256 of the opaque cookie value. The raw token is never stored. */
    tokenHash: text().notNull().unique(),
    /** Set once the second factor is proven. */
    mfaVerifiedAt: tstz(),
    createdAt: createdAtCol(),
    lastSeenAt: createdAtCol(),
    expiresAt: tstz().notNull(),
    revokedAt: tstz(),
    ip: text(),
    userAgent: text(),
  },
  (t) => [index('sessions_user_idx').on(t.tenantId, t.userId)],
);
