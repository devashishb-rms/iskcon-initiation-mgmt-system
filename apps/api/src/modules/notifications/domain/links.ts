/** Routes of the web app that notifications point to. */
export const links = {
  application: (applicationId: string): string => `/applications/${applicationId}`,
  /** A candidate's own path. */
  myPath: '/path',
  reviewQueue: '/queue',
  candidates: '/candidates',
} as const;
