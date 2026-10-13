import { ruleFloorResponse, ruleSetDto, type RuleFloorResponse, type RuleParamsDto, type RuleSetDto } from '@iskcon/contracts';
import { z } from 'zod';
import { request } from './request';

export const ruleSetsApi = {
  list: (): Promise<RuleSetDto[]> => request('/rule-sets', { schema: z.array(ruleSetDto) }),
  floor: (): Promise<RuleFloorResponse> => request('/rule-sets/floor', { schema: ruleFloorResponse }),
  create: (guruId: string): Promise<RuleSetDto> => request('/rule-sets', { method: 'POST', body: { guruId }, schema: ruleSetDto }),
  saveDraft: (id: string, params: RuleParamsDto, note?: string): Promise<RuleSetDto> =>
    request(`/rule-sets/${id}/draft`, { method: 'PUT', body: { params, note: note || undefined }, schema: ruleSetDto }),
  publish: (id: string): Promise<RuleSetDto> => request(`/rule-sets/${id}/publish`, { method: 'POST', schema: ruleSetDto }),
  discardDraft: (id: string) => request<void>(`/rule-sets/${id}/draft`, { method: 'DELETE' }),
};
