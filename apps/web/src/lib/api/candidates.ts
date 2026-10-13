import {
  candidateListItem,
  createCandidateResponse,
  pageOf,
  type CandidateListQuery,
  type CreateCandidateBody,
  type CreateCandidateResponse,
  type CandidateListItem,
  type Page,
} from '@iskcon/contracts';
import { apiUrl, request } from './request';

/**
 * Query for the list. `waitingOnMentor` is only ever sent as `true`: the API coerces the string
 * "false" to true (z.coerce.boolean), so "off" must mean "omit".
 */
export type CandidateFilters = Partial<Omit<CandidateListQuery, 'waitingOnMentor'>> & { waitingOnMentor?: boolean };

const listParams = (q: CandidateFilters) => ({ ...q, waitingOnMentor: q.waitingOnMentor ? true : undefined });

export const candidatesApi = {
  list: (q: CandidateFilters): Promise<Page<CandidateListItem>> =>
    request('/candidates', { query: listParams(q), schema: pageOf(candidateListItem) }),
  create: (body: Omit<CreateCandidateBody, 'track' | 'createLogin'> & { track: 'FIRST' | 'SECOND'; createLogin: boolean }): Promise<CreateCandidateResponse> =>
    request('/candidates', { method: 'POST', body, schema: createCandidateResponse }),
  createSecondApplication: (candidateId: string, guruId?: string) =>
    request<{ applicationId: string }>(`/candidates/${candidateId}/applications`, { method: 'POST', body: guruId ? { guruId } : {} }),
  exportCsvUrl: (q: CandidateFilters) => apiUrl('/candidates/export.csv', { ...listParams(q), page: undefined, pageSize: undefined }),
  exportPdfUrl: (q: CandidateFilters) => apiUrl('/candidates/export.pdf', { ...listParams(q), page: undefined, pageSize: undefined }),
};
