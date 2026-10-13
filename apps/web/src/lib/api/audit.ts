import { auditEntryDto, pageOf, type AuditEntryDto, type Page } from '@iskcon/contracts';
import { request } from './request';

export interface AuditFilters {
  applicationId?: string;
  action?: string;
  page?: number;
  pageSize?: number;
}

export const auditApi = {
  list: (q: AuditFilters): Promise<Page<AuditEntryDto>> => request('/audit', { query: { ...q }, schema: pageOf(auditEntryDto) }),
};
