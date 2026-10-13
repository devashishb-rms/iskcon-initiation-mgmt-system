import { z } from 'zod';
import { message } from './common';
import { isoDate } from './common';
import { documentType, ruleId } from './enums';

export const checkStatus = z.enum(['MET', 'UNKNOWN', 'NOT_MET', 'LATER', 'EXCEPTION']);

export const checklistItem = z.object({
  id: ruleId,
  label: message,
  status: checkStatus,
  originalStatus: checkStatus.optional(),
  detail: message,
  source: z
    .enum([
      'MENTOR_CONFIRMATION',
      'TEMPLE_RECORD',
      'REGISTER',
      'UPLOADED_CERTIFICATE',
      'RECOMMENDATION_RECORD',
      'COMMITTEE_EXCEPTION',
    ])
    .nullable(),
  dueOn: isoDate.nullable(),
});

export const evaluationDto = z.object({
  items: z.array(checklistItem),
  blockers: z.array(ruleId),
  canApprove: z.boolean(),
  missingDocuments: z.array(documentType),
  counts: z.record(checkStatus, z.number().int()),
  worst: z.enum(['MET', 'UNKNOWN', 'NOT_MET']),
  summary: z.object({ met: z.number().int(), total: z.number().int() }),
});
export type EvaluationDto = z.infer<typeof evaluationDto>;

export const nextStepDto = z.object({
  code: z.string(),
  ruleId: ruleId.nullable(),
  dueOn: isoDate.nullable(),
});
export type NextStepDto = z.infer<typeof nextStepDto>;

export const ruleVersionRef = z.object({
  id: z.string().uuid(),
  ruleSetId: z.string().uuid(),
  ruleSetName: z.string(),
  version: z.number().int(),
});
export type RuleVersionRef = z.infer<typeof ruleVersionRef>;
