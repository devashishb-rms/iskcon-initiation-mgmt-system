import { z } from 'zod';
import { isoDate, text } from './common';
import { ceremonyStatus, stage, track } from './enums';

export const createCeremonyBody = z.object({ guruId: z.string().uuid(), track, venue: text(200), date: isoDate });
export const attachAttendeeBody = z.object({ applicationId: z.string().uuid() });
export const markAttendanceBody = z.object({ present: z.boolean() });
export const completeCeremonyBody = z.object({
  /** Spiritual name per attendee who was present. Required for each present attendee. */
  spiritualNames: z.record(z.string().uuid(), text(120)),
});

export const ceremonyAttendeeDto = z.object({
  applicationId: z.string().uuid(),
  candidateName: z.string(),
  present: z.boolean(),
  spiritualName: z.string().nullable(),
  stage,
});
export const ceremonyDto = z.object({
  id: z.string().uuid(),
  guru: z.object({ id: z.string().uuid(), name: z.string() }),
  track,
  venue: z.string(),
  date: isoDate,
  status: ceremonyStatus,
  attendees: z.array(ceremonyAttendeeDto),
});
export type CeremonyDto = z.infer<typeof ceremonyDto>;
export type CeremonyAttendeeDto = z.infer<typeof ceremonyAttendeeDto>;

/** Applications the guru's office accepted and that fit this ceremony's guru and track. */
export const eligibleAttendee = z.object({ applicationId: z.string().uuid(), candidateName: z.string() });
