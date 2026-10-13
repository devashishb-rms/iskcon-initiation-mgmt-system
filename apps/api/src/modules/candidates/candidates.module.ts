import { Module } from '@nestjs/common';
import { ApplicationAccess, ApplicationWorkflow } from '../../shared/application-ports';
import { GurusModule } from '../gurus';
import { ApplicationAccessService } from './application/application-access.service';
import { ApplicationWorkflowService } from './application/application-workflow.service';
import { ApplicationsQueryService } from './application/applications-query.service';
import { CandidatesFacet } from './application/candidates.facet';
import { CandidatesService } from './application/candidates.service';
import { CandidatesController } from './http/candidates.controller';
import { CandidatesRepository } from './infrastructure/candidates.repository';

/**
 * Owns people who are becoming devotees and their applications. Other modules see it through two
 * ports (`ApplicationAccess`, `ApplicationWorkflow`) and the query service; see docs/architecture.md.
 */
@Module({
  imports: [GurusModule],
  controllers: [CandidatesController],
  providers: [
    CandidatesRepository,
    ApplicationAccessService,
    ApplicationWorkflowService,
    ApplicationsQueryService,
    CandidatesService,
    CandidatesFacet,
    { provide: ApplicationAccess, useExisting: ApplicationAccessService },
    { provide: ApplicationWorkflow, useExisting: ApplicationWorkflowService },
  ],
  exports: [ApplicationAccess, ApplicationWorkflow, ApplicationsQueryService, CandidatesService],
})
export class CandidatesModule {}
