import type { ApplicationDetail, EvaluationDto } from '@iskcon/contracts';

const ID = '11111111-1111-4111-8111-111111111111';
const NOW = '2026-10-01T10:00:00.000Z';

export const noActions: ApplicationDetail['actions'] = {
  canSetPractice: false,
  canSetTempleFacts: false,
  canAdvance: false,
  canSubmit: false,
  canChangeGuru: false,
  canRecordException: false,
  canDecide: false,
  canRecordGuruResponse: false,
  canExportPackage: false,
  canUpload: false,
  canAddMonthlyNote: false,
  canMessage: false,
  approveBlockedBy: [],
};

export const evaluation = (over: Partial<EvaluationDto> = {}): EvaluationDto => ({
  items: [
    { id: 'R-1', label: { code: 'rule.R-1.label.first', params: { months: 12 } }, status: 'MET', detail: { code: 'rule.R-1.detail.met', params: { since: '2024-01-01', months: 12, dueOn: '2025-01-01' } }, source: 'MENTOR_CONFIRMATION', dueOn: '2025-01-01' },
    { id: 'R-2', label: { code: 'rule.R-2.label', params: { months: 6 } }, status: 'UNKNOWN', detail: { code: 'rule.R-2.detail.unknown' }, source: null, dueOn: null },
    { id: 'R-3', label: { code: 'rule.R-3.label' }, status: 'NOT_MET', detail: { code: 'rule.R-3.detail.notTaken' }, source: null, dueOn: null },
    { id: 'R-5', label: { code: 'rule.R-5.label' }, status: 'LATER', detail: { code: 'rule.R-5.detail.later' }, source: null, dueOn: null },
    { id: 'R-4', label: { code: 'rule.R-4.label' }, status: 'EXCEPTION', originalStatus: 'UNKNOWN', detail: { code: 'common.exceptionRecorded', params: { reason: 'Certificate lost in the flood' } }, source: 'COMMITTEE_EXCEPTION', dueOn: null },
  ],
  blockers: ['R-2', 'R-3'],
  canApprove: false,
  missingDocuments: [],
  counts: { MET: 1, UNKNOWN: 1, NOT_MET: 1, LATER: 1, EXCEPTION: 1 },
  worst: 'NOT_MET',
  summary: { met: 1, total: 5 },
  ...over,
});

export const detail = (over: Partial<ApplicationDetail> = {}, actions: Partial<ApplicationDetail['actions']> = {}): ApplicationDetail => ({
  applicationId: ID,
  candidate: { id: '22222222-2222-4222-8222-222222222222', name: 'Ananya Das', phone: null, email: null, groupName: 'Salt Lake sanga', consentAt: NOW, otherApplications: [] },
  track: 'FIRST',
  stage: 'APPLIED',
  stageSince: NOW,
  status: 'OPEN',
  mentor: { id: '33333333-3333-4333-8333-333333333333', name: 'Mohan Das' },
  guru: { id: '44444444-4444-4444-8444-444444444444', name: 'HH Example Swami' },
  facts: { practiceSince: '2024-01-01', shelterDate: null, examStatus: 'NOT_TAKEN', courseComplete: null, firstInitiationDate: null, guruChangedOn: null, returnedOn: null },
  evaluation: evaluation(),
  nextStep: { code: 'PASS_EXAM', ruleId: 'R-3', dueOn: null },
  ruleVersion: { id: '55555555-5555-4555-8555-555555555555', ruleSetId: '66666666-6666-4666-8666-666666666666', ruleSetName: 'Baseline', version: 1 },
  documents: [],
  exceptions: [],
  latestRecommendation: null,
  latestGuruResponse: null,
  actions: { ...noActions, ...actions },
  ...over,
});
