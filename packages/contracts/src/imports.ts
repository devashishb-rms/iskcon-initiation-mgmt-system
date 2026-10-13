import { z } from 'zod';
import { isoDate } from './common';
import { track } from './enums';

/** One validated row of the temple's existing candidate list (FR-23). */
export const importRow = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().max(30).optional(),
  email: z.string().trim().toLowerCase().email().max(160).optional(),
  groupName: z.string().trim().max(120).optional(),
  mentorName: z.string().trim().max(120).optional(),
  guruName: z.string().trim().max(120).optional(),
  track: track.default('FIRST'),
  shelterDate: isoDate.optional(),
  practiceSince: isoDate.optional(),
});
export type ImportRow = z.infer<typeof importRow>;

export const importRowResult = z.object({
  line: z.number().int(),
  status: z.enum(['OK', 'WARNING', 'ERROR']),
  messages: z.array(z.object({ code: z.string(), params: z.record(z.union([z.string(), z.number()])).optional() })),
  row: z.record(z.unknown()),
});
export const importPreview = z.object({
  id: z.string().uuid(),
  filename: z.string(),
  totals: z.object({ rows: z.number().int(), ok: z.number().int(), warnings: z.number().int(), errors: z.number().int() }),
  results: z.array(importRowResult),
});
export type ImportPreview = z.infer<typeof importPreview>;
export const importCommitResult = z.object({
  created: z.number().int(),
  skipped: z.number().int(),
  skippedRows: z.array(
    z.object({ line: z.number().int(), code: z.string(), params: z.record(z.union([z.string(), z.number()])).optional() }),
  ),
});
export type ImportCommitResult = z.infer<typeof importCommitResult>;

/** The person running the import confirms every listed person agreed to be stored (NFR-3). */
export const commitImportBody = z.object({ consent: z.object({ accepted: z.literal(true), version: z.string().max(80) }) });
export type CommitImportBody = z.infer<typeof commitImportBody>;
