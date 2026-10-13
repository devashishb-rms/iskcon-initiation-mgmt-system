import { pgEnum } from 'drizzle-orm/pg-core';

export const roleEnum = pgEnum('role', ['CANDIDATE', 'MENTOR', 'PRESIDENT', 'COMMITTEE', 'ADMIN']);
export const trackEnum = pgEnum('track', ['FIRST', 'SECOND']);
export const stageEnum = pgEnum('stage', [
  'ASPIRING',
  'SHELTER',
  'PREPARING',
  'APPLIED',
  'RECOMMENDED',
  'INITIATED',
]);
export const applicationStatusEnum = pgEnum('application_status', [
  'OPEN',
  'DECLINED',
  'WITHDRAWN',
  'COMPLETED',
]);
export const examStatusEnum = pgEnum('exam_status', ['PASSED', 'FAILED', 'NOT_TAKEN']);
export const documentTypeEnum = pgEnum('document_type', [
  'SHELTER_ACCEPTANCE',
  'EXAM_RESULT',
  'COURSE_CERTIFICATE',
  'ESSAY',
  'OATH',
  'BIO_DATA',
  'OTHER',
]);
export const noteKindEnum = pgEnum('note_kind', ['MONTHLY', 'READINESS', 'MESSAGE', 'SEND_BACK']);
export const decisionEnum = pgEnum('recommendation_decision', ['APPROVE', 'SEND_BACK', 'DECLINE']);
export const guruResponseEnum = pgEnum('guru_response', ['ACCEPTED', 'WAIT', 'DECLINED']);
export const ceremonyStatusEnum = pgEnum('ceremony_status', ['PLANNED', 'COMPLETED', 'CANCELLED']);
export const ruleVersionStatusEnum = pgEnum('rule_version_status', ['DRAFT', 'PUBLISHED']);
export const channelEnum = pgEnum('delivery_channel', ['IN_APP', 'EMAIL', 'SMS']);
export const notificationStatusEnum = pgEnum('notification_status', [
  'PENDING',
  'SENT',
  'FAILED',
  'READ',
]);
export const importStatusEnum = pgEnum('import_status', ['PREVIEWED', 'COMMITTED', 'FAILED']);
export const outboxStatusEnum = pgEnum('outbox_status', ['PENDING', 'PROCESSED', 'DEAD']);
