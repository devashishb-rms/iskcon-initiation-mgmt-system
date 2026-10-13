import { z } from 'zod';

/** Every error body, RFC 9457-style. `code` is stable and translated by the client; `detail` is for logs. */
export const problem = z.object({
  type: z.string(),
  status: z.number().int(),
  code: z.string(),
  title: z.string(),
  detail: z.string().optional(),
  params: z.record(z.union([z.string(), z.number()])).optional(),
  errors: z
    .array(z.object({ path: z.string(), code: z.string(), message: z.string().optional(), params: z.record(z.union([z.string(), z.number()])).optional() }))
    .optional(),
  requestId: z.string().optional(),
});
export type Problem = z.infer<typeof problem>;

export const ERROR_CODES = [
  'VALIDATION_FAILED',
  'UNAUTHENTICATED',
  'MFA_REQUIRED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'RATE_LIMITED',
  'OTP_INVALID',
  'OTP_EXPIRED',
  'APPROVAL_BLOCKED',
  'INVALID_STAGE_TRANSITION',
  'RULE_BELOW_FLOOR',
  'RULESET_NO_DRAFT',
  'FILE_TOO_LARGE',
  'FILE_TYPE_NOT_ALLOWED',
  'CEREMONY_NOT_PLANNED',
  'CANDIDATE_NOT_ACCEPTED',
  'REASON_REQUIRED',
  'CONSENT_REQUIRED',
  'INTERNAL',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];
