import { ceremonyDto, eligibleAttendee, type CeremonyDto } from '@iskcon/contracts';
import { z } from 'zod';
import { request } from './request';

export type EligibleAttendee = z.infer<typeof eligibleAttendee>;

export const ceremoniesApi = {
  list: (): Promise<CeremonyDto[]> => request('/ceremonies', { schema: z.array(ceremonyDto) }),
  get: (id: string): Promise<CeremonyDto> => request(`/ceremonies/${id}`, { schema: ceremonyDto }),
  create: (body: { guruId: string; track: 'FIRST' | 'SECOND'; venue: string; date: string }): Promise<CeremonyDto> =>
    request('/ceremonies', { method: 'POST', body, schema: ceremonyDto }),
  eligible: (id: string): Promise<EligibleAttendee[]> => request(`/ceremonies/${id}/eligible`, { schema: z.array(eligibleAttendee) }),
  attach: (id: string, applicationId: string): Promise<CeremonyDto> =>
    request(`/ceremonies/${id}/attendees`, { method: 'POST', body: { applicationId }, schema: ceremonyDto }),
  detach: (id: string, applicationId: string): Promise<CeremonyDto> =>
    request(`/ceremonies/${id}/attendees/${applicationId}`, { method: 'DELETE', schema: ceremonyDto }),
  markAttendance: (id: string, applicationId: string, present: boolean): Promise<CeremonyDto> =>
    request(`/ceremonies/${id}/attendees/${applicationId}`, { method: 'PATCH', body: { present }, schema: ceremonyDto }),
  complete: (id: string, spiritualNames: Record<string, string>): Promise<CeremonyDto> =>
    request(`/ceremonies/${id}/complete`, { method: 'POST', body: { spiritualNames }, schema: ceremonyDto }),
  cancel: (id: string): Promise<CeremonyDto> => request(`/ceremonies/${id}/cancel`, { method: 'POST', schema: ceremonyDto }),
};
