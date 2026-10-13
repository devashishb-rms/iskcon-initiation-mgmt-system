import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Post, StreamableFile } from '@nestjs/common';
import { decideBody } from '@iskcon/contracts';
import { zod } from '../../../common/zod.pipe';
import { UnitOfWork } from '../../../database/database.module';
import { RequirePermission } from '../../../platform/access/decorators';
import { LetterService } from '../application/letter.service';
import { RecommendationService, type DecisionResult } from '../application/recommendation.service';

@Controller('applications/:id/recommendation')
export class RecommendationController {
  constructor(
    private readonly recommendation: RecommendationService,
    private readonly letter: LetterService,
    private readonly uow: UnitOfWork,
  ) {}

  /** The president's decision. The service re-evaluates the checklist; nothing the client says about it is trusted. */
  @Post()
  @RequirePermission('recommendation:decide')
  decide(@Param('id', ParseUUIDPipe) id: string, @Body(zod(decideBody)) body: ReturnType<typeof decideBody.parse>): Promise<DecisionResult> {
    return this.uow.run(() => this.recommendation.decide(id, body));
  }

  @Get('letter')
  @RequirePermission('recommendation:letter')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  async letterPdf(@Param('id', ParseUUIDPipe) id: string): Promise<StreamableFile> {
    const file = await this.uow.run(() => this.letter.letterFor(id));
    return new StreamableFile(file.content, { type: 'application/pdf', length: file.content.length, disposition: `attachment; filename="${file.filename}"` });
  }
}
