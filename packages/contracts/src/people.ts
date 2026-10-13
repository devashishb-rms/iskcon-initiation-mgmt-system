import { z } from 'zod';
import { locale, role } from './enums';
import { text } from './common';

export const personDto = z.object({
  id: z.string().uuid(),
  name: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  roles: z.array(role),
  locale,
  active: z.boolean(),
  mfaEnrolled: z.boolean(),
});
export type PersonDto = z.infer<typeof personDto>;

export const createPersonBody = z
  .object({
    name: text(120),
    email: z.string().trim().toLowerCase().email().max(160).optional(),
    phone: z.string().trim().max(30).optional(),
    roles: z.array(role).min(1),
    locale: locale.default('en'),
  })
  .refine((v) => v.email || v.phone, { message: 'EMAIL_OR_PHONE_REQUIRED', path: ['email'] });
export type CreatePersonBody = z.infer<typeof createPersonBody>;

export const updatePersonBody = z.object({
  name: text(120).optional(),
  email: z.string().trim().toLowerCase().email().max(160).nullable().optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  roles: z.array(role).min(1).optional(),
  locale: locale.optional(),
  active: z.boolean().optional(),
});
export type UpdatePersonBody = z.infer<typeof updatePersonBody>;

export const mentorOption = z.object({ id: z.string().uuid(), name: z.string() });
export type MentorOption = z.infer<typeof mentorOption>;
