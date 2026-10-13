import { z } from 'zod';

/**
 * The body of a commit: the person running the import confirms that every person on the sheet gave
 * consent to be stored (NFR-3), naming the consent text they were shown. It mirrors `consent` in
 * `createCandidateBody`. A missing or false confirmation is reported as CONSENT_REQUIRED.
 */
export const commitImportBody = z
  .object({
    consent: z.object({ accepted: z.boolean().optional(), version: z.string().max(80).optional() }).optional(),
  })
  .superRefine((body, ctx) => {
    if (body.consent?.accepted !== true) ctx.addIssue({ code: 'custom', message: 'CONSENT_REQUIRED', path: ['consent', 'accepted'] });
    else if (!body.consent.version) ctx.addIssue({ code: 'custom', message: 'CONSENT_REQUIRED', path: ['consent', 'version'] });
  });
export type CommitImportBody = { consent: { accepted: true; version: string } };
