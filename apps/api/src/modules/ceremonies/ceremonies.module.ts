import { Module } from '@nestjs/common';
import { CandidatesModule } from '../candidates';
import { GurusModule } from '../gurus';
import { RegisterModule } from '../register';
import { AttendanceService } from './application/attendance.service';
import { CeremoniesQueryService } from './application/ceremonies-query.service';
import { CeremonyCompletionService } from './application/ceremony-completion.service';
import { CeremonyLookup } from './application/ceremony-lookup';
import { CeremonyPlanningService } from './application/ceremony-planning.service';
import { CeremonyPresenter } from './application/ceremony.presenter';
import { EligibilityService } from './application/eligibility.service';
import { FacetGuruResponseReader, GuruResponseReader } from './application/guru-response.reader';
import { CeremoniesController } from './http/ceremonies.controller';
import { CeremoniesRepository } from './infrastructure/ceremonies.repository';

/**
 * Plans ceremonies, keeps their attendee lists and completes them. Completion writes the register
 * (through `RegisterService`) and moves each application on (through the `ApplicationWorkflow` port),
 * all in one unit of work. `register` does not know this module exists.
 */
@Module({
  imports: [CandidatesModule, GurusModule, RegisterModule],
  controllers: [CeremoniesController],
  providers: [
    CeremoniesRepository,
    CeremonyLookup,
    CeremonyPresenter,
    EligibilityService,
    CeremoniesQueryService,
    CeremonyPlanningService,
    AttendanceService,
    CeremonyCompletionService,
    { provide: GuruResponseReader, useClass: FacetGuruResponseReader },
  ],
  exports: [CeremoniesQueryService, CeremonyPlanningService],
})
export class CeremoniesModule {}
