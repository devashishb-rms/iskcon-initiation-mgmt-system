/** The advisory-lock name of one scheduled job in one tenant. */
export const jobLockName = (job: string, tenantId: string): string => `job:${job}:${tenantId}`;
