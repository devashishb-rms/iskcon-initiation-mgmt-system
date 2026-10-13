import { foreignKey, index, integer, pgTable, text, unique, uuid } from 'drizzle-orm/pg-core';
import { pk, tenantCol, createdAtCol, tstz } from './_helpers';
import { documentTypeEnum } from './enums';
import { applications } from './candidates';
import { users } from './identity';

export const documents = pgTable(
  'documents',
  {
    id: pk(),
    tenantId: tenantCol(),
    applicationId: uuid().notNull(),
    type: documentTypeEnum().notNull(),
    filename: text().notNull(),
    mime: text().notNull(),
    sizeBytes: integer().notNull(),
    /** Key in the private object store. Never a public URL (NFR-7). */
    storageKey: text().notNull().unique(),
    sha256: text().notNull(),
    uploadedById: uuid()
      .notNull()
      .references(() => users.id),
    uploadedAt: createdAtCol(),
    deletedAt: tstz(),
  },
  (t) => [
    unique('documents_tenant_id_uq').on(t.tenantId, t.id),
    index('documents_app_idx').on(t.tenantId, t.applicationId),
    foreignKey({ columns: [t.tenantId, t.applicationId], foreignColumns: [applications.tenantId, applications.id] }),
  ],
);
