import { z } from 'zod';
import { isoDateTime, pageQuery } from './common';

export const auditQuery = pageQuery.extend({ applicationId: z.string().uuid().optional(), action: z.string().max(80).optional() });
export const auditEntryDto = z.object({
  id: z.number().int(),
  at: isoDateTime,
  actorName: z.string(),
  action: z.string(),
  entityType: z.string(),
  entityId: z.string().nullable(),
  applicationId: z.string().nullable(),
  ruleSetVersionId: z.string().nullable(),
  detail: z.unknown().nullable(),
});
export type AuditEntryDto = z.infer<typeof auditEntryDto>;
