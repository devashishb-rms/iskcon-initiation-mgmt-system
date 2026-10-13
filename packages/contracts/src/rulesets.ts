import { z } from 'zod';
import { isoDateTime, optionalText } from './common';
import { documentType } from './enums';

export const ruleParams = z.object({
  practiceMonths: z.number().int().min(0).max(240),
  shelterMonths: z.number().int().min(0).max(240),
  secondGapMonths: z.number().int().min(0).max(240),
  changeGuruMonths: z.number().int().min(0).max(240),
  returnGapMonths: z.number().int().min(0).max(240),
  examRequired: z.boolean(),
  courseRequired: z.boolean(),
  letterRequired: z.boolean(),
  requiredDocuments: z.array(documentType).max(20),
});
export type RuleParamsDto = z.infer<typeof ruleParams>;

export const ruleVersionDto = z.object({
  id: z.string().uuid(),
  version: z.number().int(),
  status: z.enum(['DRAFT', 'PUBLISHED']),
  params: ruleParams,
  note: z.string().nullable(),
  createdBy: z.string(),
  createdAt: isoDateTime,
  publishedAt: isoDateTime.nullable(),
});
export type RuleVersionDto = z.infer<typeof ruleVersionDto>;

export const ruleSetDto = z.object({
  id: z.string().uuid(),
  name: z.string(),
  guru: z.object({ id: z.string().uuid(), name: z.string() }).nullable(),
  isBaseline: z.boolean(),
  current: ruleVersionDto.nullable(),
  draft: ruleVersionDto.nullable(),
  versions: z.array(ruleVersionDto),
});
export type RuleSetDto = z.infer<typeof ruleSetDto>;

export const saveDraftBody = z.object({ params: ruleParams, note: optionalText(500) });
export const createRuleSetBody = z.object({ guruId: z.string().uuid() });

export const floorIssue = z.object({
  field: z.string(),
  code: z.enum(['NOT_WHOLE_MONTHS', 'BELOW_FLOOR', 'CANNOT_DISABLE']),
  params: z.record(z.number()).optional(),
});
export type FloorIssue = z.infer<typeof floorIssue>;
