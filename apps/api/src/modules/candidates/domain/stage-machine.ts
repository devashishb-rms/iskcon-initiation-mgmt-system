import type { Stage, Track } from '@iskcon/contracts';

/**
 * The life of an application, as data. Moving between stages is only possible along these edges;
 * which person may trigger an edge is decided by the service, not here.
 *
 *   ASPIRING -> SHELTER -> PREPARING -> APPLIED -> RECOMMENDED -> INITIATED
 *                              ^           |            |
 *                              +-----------+------------+   (sent back, or the guru says wait)
 *
 * A second-initiation application starts at PREPARING: the earlier stages were done the first time.
 */
const EDGES: Record<Stage, readonly Stage[]> = {
  ASPIRING: ['SHELTER'],
  SHELTER: ['PREPARING'],
  PREPARING: ['APPLIED'],
  APPLIED: ['RECOMMENDED', 'PREPARING'],
  RECOMMENDED: ['INITIATED', 'PREPARING'],
  INITIATED: [],
};

export const initialStage = (track: Track): Stage => (track === 'SECOND' ? 'PREPARING' : 'ASPIRING');

export const canMove = (from: Stage, to: Stage): boolean => EDGES[from].includes(to);

/** From APPLIED on, the president and the guru's office have the file; facts and guru are frozen. */
export const isLocked = (stage: Stage): boolean => stage === 'APPLIED' || stage === 'RECOMMENDED' || stage === 'INITIATED';

/** The president's approval has been given (the letter exists), so rule R-5 is met. */
export const isApprovedStage = (stage: Stage): boolean => stage === 'RECOMMENDED' || stage === 'INITIATED';
