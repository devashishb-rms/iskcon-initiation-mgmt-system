import { z } from 'zod';
import { isoDate, pageQuery, text } from './common';
import { track } from './enums';

export const registerQuery = pageQuery.extend({
  q: z.string().trim().max(80).optional(),
  guruId: z.string().uuid().optional(),
  track: track.optional(),
  /** Initiation date range, inclusive (YYYY-MM-DD). */
  from: isoDate.optional(),
  to: isoDate.optional(),
});
export type RegisterQuery = z.infer<typeof registerQuery>;

export const registerEntryDto = z.object({
  id: z.string().uuid(),
  applicationId: z.string().uuid(),
  candidateName: z.string(),
  spiritualName: z.string(),
  track,
  guru: z.object({ id: z.string().uuid(), name: z.string() }),
  ceremonyId: z.string().uuid(),
  initiatedOn: isoDate,
});
export type RegisterEntryDto = z.infer<typeof registerEntryDto>;
export const correctRegisterBody = z.object({ spiritualName: text(120), reason: text(500) });
