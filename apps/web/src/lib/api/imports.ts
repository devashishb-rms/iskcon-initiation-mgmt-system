import { CONSENT_VERSION, importCommitResult, importPreview, type CommitImportBody, type ImportPreview } from '@iskcon/contracts';
import type { z } from 'zod';
import { apiUrl, request } from './request';

export type ImportCommitResult = z.infer<typeof importCommitResult>;

export const importsApi = {
  templateUrl: () => apiUrl('/imports/template.csv'),
  preview: (file: File): Promise<ImportPreview> => {
    const form = new FormData();
    form.set('file', file);
    return request('/imports', { method: 'POST', form, schema: importPreview });
  },
  /** The caller has ticked the consent box; the server records which version of the text they agreed to. */
  commit: (id: string): Promise<ImportCommitResult> => {
    const body: CommitImportBody = { consent: { accepted: true, version: CONSENT_VERSION } };
    return request(`/imports/${id}/commit`, { method: 'POST', body, schema: importCommitResult });
  },
};
