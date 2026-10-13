import type { Stage } from '@iskcon/contracts';

interface Checklist {
  items: ReadonlyArray<{ id: string; status: string }>;
}

/**
 * "Waiting on the mentor": the mentor has not yet confirmed when practice began (a fact only the
 * mentor can give), or the file is otherwise ready and only the mentor's readiness note is missing.
 */
export const isWaitingOnMentor = (stage: Stage, evaluation: Checklist, step: { code: string }): boolean =>
  evaluation.items.some((i) => i.id === 'R-1' && i.status === 'UNKNOWN') ||
  (stage === 'PREPARING' && step.code === 'READY_FOR_REVIEW');
