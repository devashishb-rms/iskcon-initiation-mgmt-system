import { Body, Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { recordGuruResponseBody } from '@iskcon/contracts';
import { zod } from '../../../common/zod.pipe';
import { UnitOfWork } from '../../../database/database.module';
import { RequirePermission } from '../../../platform/access/decorators';
import { GuruResponseService, type GuruResponseResult } from '../application/guru-response.service';

@Controller('applications/:id/guru-response')
export class GuruResponseController {
  constructor(
    private readonly responses: GuruResponseService,
    private readonly uow: UnitOfWork,
  ) {}

  @Post()
  @RequirePermission('guru-response:record')
  record(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(recordGuruResponseBody)) body: ReturnType<typeof recordGuruResponseBody.parse>,
  ): Promise<GuruResponseResult> {
    return this.uow.run(() => this.responses.record(id, body));
  }
}
