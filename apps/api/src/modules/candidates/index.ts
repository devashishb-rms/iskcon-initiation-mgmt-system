// Public surface of the candidates module. Other modules import only from here.
export { CandidatesModule } from './candidates.module';
export { CandidatesService } from './application/candidates.service';
export { ApplicationsQueryService } from './application/applications-query.service';
export { toSummary } from './application/application-access.service';
export { toFacts, type ApplicationRecord, type ApplicationWithCandidate, type CandidateRecord } from './domain/application';
export { isApprovedStage, isLocked, canMove } from './domain/stage-machine';
