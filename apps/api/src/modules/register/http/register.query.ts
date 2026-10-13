import { registerQuery } from '@iskcon/contracts';

/** The register list query: the contract's filters, plus a check that the date range is the right way round. */
export const registerListQuery = registerQuery.refine((v) => !v.from || !v.to || v.from <= v.to, {
  message: 'DATE_RANGE_INVALID',
  path: ['to'],
});
export type RegisterListQuery = ReturnType<typeof registerListQuery.parse>;
