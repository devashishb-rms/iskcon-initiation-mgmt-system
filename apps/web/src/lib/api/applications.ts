import {
  applicationDetail,
  documentDto,
  exceptionDto,
  noteDto,
  packagePreview,
  timelineEvent,
  type ApplicationDetail,
  type DocumentDto,
  type ExceptionDto,
  type NoteDto,
  type PackagePreview,
  type TimelineEvent,
  type UpdateFactsBody,
  type DecideBody,
  type GuruResponseType,
  type NoteKind,
} from '@iskcon/contracts';
import { z } from 'zod';
import { apiUrl, request, requestFile, type DownloadedFile } from './request';

const detail = { schema: applicationDetail } as const;

export const applicationsApi = {
  myPath: (): Promise<ApplicationDetail> => request('/me/path', detail),
  get: (id: string): Promise<ApplicationDetail> => request(`/applications/${id}`, detail),
  timeline: (id: string): Promise<TimelineEvent[]> => request(`/applications/${id}/timeline`, { schema: z.array(timelineEvent) }),

  updateFacts: (id: string, facts: UpdateFactsBody): Promise<ApplicationDetail> =>
    request(`/applications/${id}/facts`, { method: 'PATCH', body: facts, ...detail }),
  changeGuru: (id: string, guruId: string | null): Promise<ApplicationDetail> =>
    request(`/applications/${id}/guru`, { method: 'PATCH', body: { guruId }, ...detail }),
  advance: (id: string, body: { to: 'SHELTER' | 'PREPARING'; shelterDate?: string; reason?: string }): Promise<ApplicationDetail> =>
    request(`/applications/${id}/advance`, { method: 'POST', body, ...detail }),
  submit: (id: string, readinessNote: string): Promise<ApplicationDetail> =>
    request(`/applications/${id}/submit`, { method: 'POST', body: { readinessNote }, ...detail }),

  notes: (id: string): Promise<NoteDto[]> => request(`/applications/${id}/notes`, { schema: z.array(noteDto) }),
  addNote: (id: string, kind: Extract<NoteKind, 'MONTHLY' | 'MESSAGE'>, body: string): Promise<NoteDto> =>
    request(`/applications/${id}/notes`, { method: 'POST', body: { kind, body }, schema: noteDto }),

  documents: (id: string): Promise<DocumentDto[]> => request(`/applications/${id}/documents`, { schema: z.array(documentDto) }),
  upload: (id: string, type: string, file: File): Promise<DocumentDto> => {
    const form = new FormData();
    form.set('type', type);
    form.set('file', file);
    return request(`/applications/${id}/documents`, { method: 'POST', form, schema: documentDto });
  },
  deleteDocument: (documentId: string) => request<void>(`/documents/${documentId}`, { method: 'DELETE' }),
  documentUrl: (documentId: string) => apiUrl(`/documents/${documentId}/content`),

  recordException: (id: string, ruleId: string, reason: string): Promise<ExceptionDto> =>
    request(`/applications/${id}/exceptions`, { method: 'POST', body: { ruleId, reason }, schema: exceptionDto }),
  removeException: (id: string, ruleId: string) => request<void>(`/applications/${id}/exceptions/${ruleId}`, { method: 'DELETE' }),

  /**
   * The API answers a decision with a small receipt, not an ApplicationDetail (apps/api REQUESTS.md),
   * so the file is re-read afterwards. Works unchanged if the API later returns the detail itself.
   */
  decide: async (id: string, body: DecideBody): Promise<ApplicationDetail> => {
    await request<unknown>(`/applications/${id}/recommendation`, { method: 'POST', body });
    return applicationsApi.get(id);
  },
  letterUrl: (id: string) => apiUrl(`/applications/${id}/recommendation/letter`),
  recordGuruResponse: async (id: string, response: GuruResponseType, reason?: string): Promise<ApplicationDetail> => {
    await request<unknown>(`/applications/${id}/guru-response`, { method: 'POST', body: { response, reason } });
    return applicationsApi.get(id);
  },

  packagePreview: (id: string): Promise<PackagePreview> => request(`/applications/${id}/package/preview`, { schema: packagePreview }),
  downloadPackage: (id: string): Promise<DownloadedFile> => requestFile(`/applications/${id}/package`, { method: 'POST' }),
};
