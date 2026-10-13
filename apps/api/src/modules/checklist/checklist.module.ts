import { Module } from '@nestjs/common';
import { RulesModule } from '../rules';
import { ChecklistService } from './application/checklist.service';

@Module({ imports: [RulesModule], providers: [ChecklistService], exports: [ChecklistService] })
export class ChecklistModule {}
