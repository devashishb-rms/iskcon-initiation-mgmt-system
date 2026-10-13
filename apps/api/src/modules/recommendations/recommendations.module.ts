import { Module } from '@nestjs/common';
import { CandidatesModule } from '../candidates';
import { ChecklistModule } from '../checklist';
import { DocumentsModule } from '../documents';
import { GurusModule } from '../gurus';
import { RulesModule } from '../rules';
import { ExceptionsService } from './application/exceptions.service';
import { GuruResponseService } from './application/guru-response.service';
import { LetterService } from './application/letter.service';
import { PackageService } from './application/package.service';
import { RecommendationService } from './application/recommendation.service';
import { RecommendationsFacet } from './application/recommendations.facet';
import { ExceptionsController } from './http/exceptions.controller';
import { GuruResponseController } from './http/guru-response.controller';
import { PackageController } from './http/package.controller';
import { RecommendationController } from './http/recommendation.controller';
import { DecisionsRepository } from './infrastructure/decisions.repository';
import { ExceptionsRepository } from './infrastructure/exceptions.repository';
import { LetterRenderer } from './infrastructure/letter.renderer';
import { PackageArchive } from './infrastructure/package-archive';
import { PackageCoverRenderer } from './infrastructure/package-cover.renderer';
import { PackageExportsRepository } from './infrastructure/package-exports.repository';

/**
 * Committee exceptions, the president's decision, the guru's office's answer, the recommendation
 * letter and the hand-over package. One service per use case; `RecommendationsFacet` contributes
 * to the checklist, the detail screen and the timeline. See docs/architecture.md.
 */
@Module({
  imports: [CandidatesModule, ChecklistModule, DocumentsModule, GurusModule, RulesModule],
  controllers: [ExceptionsController, RecommendationController, GuruResponseController, PackageController],
  providers: [
    ExceptionsRepository,
    DecisionsRepository,
    PackageExportsRepository,
    LetterRenderer,
    PackageCoverRenderer,
    PackageArchive,
    ExceptionsService,
    RecommendationService,
    GuruResponseService,
    LetterService,
    PackageService,
    RecommendationsFacet,
  ],
  exports: [ExceptionsService, RecommendationService, GuruResponseService],
})
export class RecommendationsModule {}
