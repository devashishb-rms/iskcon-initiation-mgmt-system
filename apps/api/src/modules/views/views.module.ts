import { Module } from '@nestjs/common';
import { CandidatesModule } from '../candidates';
import { ChecklistModule } from '../checklist';
import { GurusModule } from '../gurus';
import { ApplicationViewService } from './application/application-view.service';
import { ApplicationsController } from './http/applications.controller';

/**
 * Read models and the screens' endpoints. It sits at the top of the module graph: it may depend on
 * the modules below it; nothing depends on it.
 */
@Module({
  imports: [CandidatesModule, ChecklistModule, GurusModule],
  controllers: [ApplicationsController],
  providers: [ApplicationViewService],
})
export class ViewsModule {}
