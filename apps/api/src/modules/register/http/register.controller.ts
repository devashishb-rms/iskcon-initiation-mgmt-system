import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Patch, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { correctRegisterBody, type Page, type RegisterEntryDto } from '@iskcon/contracts';
import { RequirePermission } from '../../../platform/access/decorators';
import { zod } from '../../../common/zod.pipe';
import { UnitOfWork } from '../../../database/database.module';
import { RegisterCorrectionService } from '../application/register-correction.service';
import { RegisterExportService } from '../application/register-export.service';
import { RegisterQueryService } from '../application/register-query.service';
import { registerListQuery, type RegisterListQuery } from './register.query';

/** Filters only; paging is for the list. */
const filterOf = ({ q, guruId, track, from, to }: RegisterListQuery) => ({ q, guruId, track, from, to });

@Controller('register')
export class RegisterController {
  constructor(
    private readonly query: RegisterQueryService,
    private readonly exports: RegisterExportService,
    private readonly corrections: RegisterCorrectionService,
    private readonly uow: UnitOfWork,
  ) {}

  @Get()
  @RequirePermission('register:read')
  list(@Query(zod(registerListQuery)) q: RegisterListQuery): Promise<Page<RegisterEntryDto>> {
    return this.uow.run(() => this.query.list(filterOf(q), q.page, q.pageSize));
  }

  @Get('export.csv')
  @RequirePermission('register:export')
  @Header('Cache-Control', 'no-store')
  async exportCsv(@Query(zod(registerListQuery)) q: RegisterListQuery, @Res() res: Response): Promise<void> {
    const csv = await this.uow.run(() => this.exports.csv(filterOf(q)));
    res.type('text/csv; charset=utf-8').attachment('register.csv').send(csv);
  }

  @Get('export.pdf')
  @RequirePermission('register:export')
  @Header('Cache-Control', 'no-store')
  async exportPdf(@Query(zod(registerListQuery)) q: RegisterListQuery, @Res() res: Response): Promise<void> {
    const pdf = await this.uow.run(() => this.exports.pdfFile(filterOf(q)));
    res.type('application/pdf').attachment('register.pdf').send(pdf);
  }

  @Patch(':id')
  @RequirePermission('register:correct')
  correct(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(correctRegisterBody)) body: ReturnType<typeof correctRegisterBody.parse>,
  ): Promise<RegisterEntryDto> {
    return this.uow.run(() => this.corrections.correct(id, body));
  }
}
