import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import {
  createRuleSetBody,
  saveDraftBody,
  type RuleFloorResponse,
  type RuleSetDto,
} from '@iskcon/contracts';
import { RequirePermission } from '../../../platform/access/decorators';
import { zod } from '../../../common/zod.pipe';
import { UnitOfWork } from '../../../database/database.module';
import { RuleSetsService } from '../application/rule-sets.service';

@Controller('rule-sets')
export class RuleSetsController {
  constructor(
    private readonly rules: RuleSetsService,
    private readonly uow: UnitOfWork,
  ) {}

  @Get()
  @RequirePermission('ruleset:read')
  list(): Promise<RuleSetDto[]> {
    return this.uow.run(() => this.rules.list());
  }

  @Get('floor')
  @RequirePermission('ruleset:read')
  floor(): Promise<RuleFloorResponse> {
    return this.uow.run(() => this.rules.floor());
  }

  @Post()
  @RequirePermission('ruleset:edit')
  create(@Body(zod(createRuleSetBody)) body: ReturnType<typeof createRuleSetBody.parse>): Promise<RuleSetDto> {
    return this.uow.run(() => this.rules.createForGuru(body.guruId));
  }

  @Put(':id/draft')
  @RequirePermission('ruleset:edit')
  saveDraft(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(saveDraftBody)) body: ReturnType<typeof saveDraftBody.parse>,
  ): Promise<RuleSetDto> {
    return this.uow.run(() => this.rules.saveDraft(id, body.params, body.note ?? null));
  }

  @Post(':id/publish')
  @HttpCode(200)
  @RequirePermission('ruleset:edit')
  publish(@Param('id', ParseUUIDPipe) id: string): Promise<RuleSetDto> {
    return this.uow.run(() => this.rules.publish(id));
  }

  @Delete(':id/draft')
  @HttpCode(204)
  @RequirePermission('ruleset:edit')
  async discard(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.uow.run(() => this.rules.discardDraft(id));
  }
}
