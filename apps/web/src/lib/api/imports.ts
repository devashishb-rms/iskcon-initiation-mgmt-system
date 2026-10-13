import { importCommitResult, importPreview, type ImportPreview } from '@iskcon/contracts';
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
  commit: (id: string): Promise<ImportCommitResult> => request(`/imports/${id}/commit`, { method: 'POST', schema: importCommitResult }),
};
