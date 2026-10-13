import { pageOf, registerEntryDto, type Page, type RegisterEntryDto } from '@iskcon/contracts';
import { apiUrl, request } from './request';

/** `from`/`to` are not in the contract yet (CONTRACT_REQUESTS.md); they are sent anyway and also applied in the browser. */
export interface RegisterFilters {
  q?: string;
  guruId?: string;
  track?: 'FIRST' | 'SECOND';
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export const registerApi = {
  list: (q: RegisterFilters): Promise<Page<RegisterEntryDto>> => request('/register', { query: { ...q }, schema: pageOf(registerEntryDto) }),
  correct: (id: string, spiritualName: string, reason: string): Promise<RegisterEntryDto> =>
    request(`/register/${id}`, { method: 'PATCH', body: { spiritualName, reason }, schema: registerEntryDto }),
  exportCsvUrl: (q: RegisterFilters) => apiUrl('/register/export.csv', { ...q, page: undefined, pageSize: undefined }),
  exportPdfUrl: (q: RegisterFilters) => apiUrl('/register/export.pdf', { ...q, page: undefined, pageSize: undefined }),
};
