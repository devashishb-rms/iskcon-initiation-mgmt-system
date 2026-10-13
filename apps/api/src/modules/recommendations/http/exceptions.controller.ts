import { Body, Controller, Delete, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { recordExceptionBody, ruleId, type ExceptionDto } from '@iskcon/contracts';
import { zod } from '../../../common/zod.pipe';
import { UnitOfWork } from '../../../database/database.module';
import { RequirePermission } from '../../../platform/access/decorators';
import { ExceptionsService } from '../application/exceptions.service';

@Controller('applications/:id/exceptions')
export class ExceptionsController {
  constructor(
    private readonly exceptions: ExceptionsService,
    private readonly uow: UnitOfWork,
  ) {}

  @Post()
  @RequirePermission('exception:record')
  record(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(recordExceptionBody)) body: ReturnType<typeof recordExceptionBody.parse>,
  ): Promise<ExceptionDto> {
    return this.uow.run(() => this.exceptions.record(id, body.ruleId, body.reason));
  }

  @Delete(':ruleId')
  @HttpCode(204)
  @RequirePermission('exception:record')
  async remove(@Param('id', ParseUUIDPipe) id: string, @Param('ruleId', zod(ruleId)) rule: ReturnType<typeof ruleId.parse>): Promise<void> {
    await this.uow.run(() => this.exceptions.remove(id, rule));
  }
}
