import {
  guruDto,
  mentorOption,
  personDto,
  type CreatePersonBody,
  type GuruDto,
  type Locale,
  type MentorOption,
  type PersonDto,
  type UpdatePersonBody,
} from '@iskcon/contracts';
import { z } from 'zod';
import { request } from './request';

export const peopleApi = {
  list: (): Promise<PersonDto[]> => request('/people', { schema: z.array(personDto) }),
  create: (body: Omit<CreatePersonBody, 'locale'> & { locale?: Locale }): Promise<PersonDto> =>
    request('/people', { method: 'POST', body, schema: personDto }),
  update: (id: string, body: UpdatePersonBody): Promise<PersonDto> =>
    request(`/people/${id}`, { method: 'PATCH', body, schema: personDto }),
  mentors: (): Promise<MentorOption[]> => request('/mentors', { schema: z.array(mentorOption) }),
  gurus: (): Promise<GuruDto[]> => request('/gurus', { schema: z.array(guruDto) }),
  createGuru: (name: string): Promise<GuruDto> => request('/gurus', { method: 'POST', body: { name }, schema: guruDto }),
  updateGuru: (id: string, body: { name?: string; active?: boolean }): Promise<GuruDto> =>
    request(`/gurus/${id}`, { method: 'PATCH', body, schema: guruDto }),
  /**
   * Stores the signed-in person's language. docs/api.md has no route for this yet (see
   * CONTRACT_REQUESTS.md), so callers treat a failure as "cookie only".
   */
  updateMyLocale: (locale: Locale) => request<void>('/people/me', { method: 'PATCH', body: { locale }, skipAuthRedirect: true }),
};
