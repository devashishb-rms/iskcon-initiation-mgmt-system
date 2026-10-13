import type { ApplicationStatus, Stage } from '@iskcon/contracts';

/**
 * Which actions of this module are possible on an application in a given state. One place, used by the
 * services (to refuse) and by the facet (to offer), so a button is never shown for something the
 * server would refuse. Who may act (permissions) is decided elsewhere.
 */
export interface FileState {
  stage: Stage;
  status: ApplicationStatus;
}

const open = (a: FileState): boolean => a.status === 'OPEN';

/** A committee exception covers a rule while the file is with the president for review. */
export const canRecordException = (a: FileState): boolean => open(a) && a.stage === 'APPLIED';

/** The president decides on files that were submitted. */
export const canDecide = (a: FileState): boolean => open(a) && a.stage === 'APPLIED';

/** The guru's office answers about a file the president recommended. */
export const canRecordGuruResponse = (a: FileState): boolean => open(a) && a.stage === 'RECOMMENDED';

/** The hand-over package makes sense from the moment the file is submitted. */
export const canExportPackage = (a: FileState): boolean => open(a) && (a.stage === 'APPLIED' || a.stage === 'RECOMMENDED' || a.stage === 'INITIATED');

/** A rule the committee cannot waive: R-5 is the president's own recommendation, which the approval itself produces. */
export const UNEXCEPTABLE_RULES: readonly string[] = ['R-5'];
export const isExceptable = (ruleId: string): boolean => !UNEXCEPTABLE_RULES.includes(ruleId);
