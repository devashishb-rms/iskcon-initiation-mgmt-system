import { markAttendanceBody } from '@iskcon/contracts';

/** Marking attendance. The contract already carries the optional spiritual name. */
export const markAttendanceRequest = markAttendanceBody;
export type MarkAttendanceRequest = ReturnType<typeof markAttendanceRequest.parse>;
