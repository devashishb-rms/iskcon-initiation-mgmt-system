import { z } from 'zod';
import { locale, role } from './enums';

/** An email address or a phone number. Normalised on the server. */
export const identifier = z.string().trim().min(5).max(120);

export const requestOtpBody = z.object({ identifier });
export const verifyOtpBody = z.object({ identifier, code: z.string().regex(/^\d{6}$/) });
export const verifyMfaBody = z.object({ code: z.string().regex(/^\d{6}$/) });
export const confirmMfaEnrolBody = verifyMfaBody;

export const sessionUser = z.object({
  id: z.string().uuid(),
  name: z.string(),
  roles: z.array(role),
  locale,
});
export type SessionUser = z.infer<typeof sessionUser>;

export const sessionResponse = z.object({
  user: sessionUser,
  tenant: z.object({ slug: z.string(), name: z.string(), timezone: z.string() }),
  mfa: z.object({
    required: z.boolean(),
    enrolled: z.boolean(),
    verified: z.boolean(),
  }),
});
export type SessionResponse = z.infer<typeof sessionResponse>;

export const mfaEnrolResponse = z.object({ secret: z.string(), otpauthUrl: z.string() });

export const updateMyLocaleBody = z.object({ locale });
