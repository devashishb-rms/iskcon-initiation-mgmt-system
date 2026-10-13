/**
 * Domain events that cross module boundaries. Publishers write them to the outbox in their own
 * transaction (`EventBus.publish`); subscribers use `@OnDomainEvent`. The names and payloads are
 * the contract between modules, so change them like an API.
 */
export const EVENTS = {
  candidateCreated: 'candidate.created',
  documentUploaded: 'document.uploaded',
  applicationSubmitted: 'application.submitted',
  applicationSentBack: 'application.sent-back',
  applicationApproved: 'application.approved',
  applicationDeclined: 'application.declined',
  guruResponded: 'guru.responded',
  ceremonyCompleted: 'ceremony.completed',
} as const;

export interface CandidateCreatedPayload extends Record<string, unknown> {
  candidateId: string;
  applicationId: string;
}
export interface DocumentUploadedPayload extends Record<string, unknown> {
  applicationId: string;
  documentId: string;
  type: string;
}
export interface ApplicationSubmittedPayload extends Record<string, unknown> {
  applicationId: string;
}
export interface ApplicationSentBackPayload extends Record<string, unknown> {
  applicationId: string;
  reason: string;
}
export interface ApplicationApprovedPayload extends Record<string, unknown> {
  applicationId: string;
}
export interface ApplicationDeclinedPayload extends Record<string, unknown> {
  applicationId: string;
  by: 'PRESIDENT' | 'GURU';
  reason: string;
}
export interface GuruRespondedPayload extends Record<string, unknown> {
  applicationId: string;
  response: 'ACCEPTED' | 'WAIT' | 'DECLINED';
}
export interface CeremonyCompletedPayload extends Record<string, unknown> {
  ceremonyId: string;
  applicationIds: string[];
  date: string;
}
