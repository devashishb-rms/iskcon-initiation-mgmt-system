import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { createGuruBody, updateGuruBody, type GuruDto } from '@iskcon/contracts';
import { Authenticated, RequirePermission } from '../../../platform/access/decorators';
import { zod } from '../../../common/zod.pipe';
import { UnitOfWork } from '../../../database/database.module';
import { GurusService } from '../application/gurus.service';

@Controller('gurus')
export class GurusController {
  constructor(
    private readonly gurus: GurusService,
    private readonly uow: UnitOfWork,
  ) {}

  @Get()
  @Authenticated()
  list(): Promise<GuruDto[]> {
    return this.gurus.list();
  }

  @Post()
  @RequirePermission('people:manage')
  create(@Body(zod(createGuruBody)) body: ReturnType<typeof createGuruBody.parse>): Promise<GuruDto> {
    return this.uow.run(() => this.gurus.create(body.name));
  }

  @Patch(':id')
  @RequirePermission('people:manage')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(updateGuruBody)) body: ReturnType<typeof updateGuruBody.parse>,
  ): Promise<GuruDto> {
    return this.uow.run(() => this.gurus.update(id, body));
  }
}
