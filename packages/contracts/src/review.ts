import { z } from 'zod';
import { isoDateTime, text } from './common';
import { decision, documentType, guruResponseType, ruleId } from './enums';
import { candidateListItem } from './candidates';

export const reviewQueueItem = candidateListItem.extend({
  waitingDays: z.number().int(),
  ruleVersionLabel: z.string(),
  missingDocuments: z.array(documentType),
  canApprove: z.boolean(),
});
export type ReviewQueueItem = z.infer<typeof reviewQueueItem>;

export const recordExceptionBody = z.object({ ruleId, reason: text(1000) });

/** Approving needs no reason; sending back or declining must give one that the candidate and mentor will read. */
export const decideBody = z
  .object({ decision, reason: z.string().trim().max(2000).optional() })
  .refine((v) => v.decision === 'APPROVE' || (v.reason && v.reason.length > 0), {
    message: 'REASON_REQUIRED',
    path: ['reason'],
  });
export type DecideBody = z.infer<typeof decideBody>;

export const recordGuruResponseBody = z
  .object({ response: guruResponseType, reason: z.string().trim().max(2000).optional() })
  .refine((v) => v.response === 'ACCEPTED' || (v.reason && v.reason.length > 0), {
    message: 'REASON_REQUIRED',
    path: ['reason'],
  });

export const packagePreview = z.object({
  missingDocuments: z.array(documentType),
  unmetItems: z.array(ruleId),
  generatedAt: isoDateTime,
});
export type PackagePreview = z.infer<typeof packagePreview>;
