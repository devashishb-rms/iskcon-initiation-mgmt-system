import { Module } from '@nestjs/common';
import { GurusModule } from '../gurus';
import { RuleSetsService } from './application/rule-sets.service';
import { RuleSetsController } from './http/rule-sets.controller';
import { RuleSetsRepository } from './infrastructure/rule-sets.repository';

@Module({
  imports: [GurusModule],
  controllers: [RuleSetsController],
  providers: [RuleSetsService, RuleSetsRepository],
  exports: [RuleSetsService],
})
export class RulesModule {}
