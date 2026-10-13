import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { attachAttendeeBody, completeCeremonyBody, createCeremonyBody, type CeremonyDto } from '@iskcon/contracts';
import { RequirePermission } from '../../../platform/access/decorators';
import { zod } from '../../../common/zod.pipe';
import { UnitOfWork } from '../../../database/database.module';
import { AttendanceService } from '../application/attendance.service';
import { CeremoniesQueryService } from '../application/ceremonies-query.service';
import { CeremonyCompletionService } from '../application/ceremony-completion.service';
import { CeremonyPlanningService } from '../application/ceremony-planning.service';
import { markAttendanceRequest, type MarkAttendanceRequest } from './ceremony.schemas';

@Controller('ceremonies')
export class CeremoniesController {
  constructor(
    private readonly queries: CeremoniesQueryService,
    private readonly planning: CeremonyPlanningService,
    private readonly attendance: AttendanceService,
    private readonly completion: CeremonyCompletionService,
    private readonly uow: UnitOfWork,
  ) {}

  @Get()
  @RequirePermission('ceremony:read')
  list(): Promise<CeremonyDto[]> {
    return this.uow.run(() => this.queries.list());
  }

  @Post()
  @RequirePermission('ceremony:manage')
  create(@Body(zod(createCeremonyBody)) body: ReturnType<typeof createCeremonyBody.parse>): Promise<CeremonyDto> {
    return this.uow.run(() => this.planning.create(body));
  }

  @Get(':id')
  @RequirePermission('ceremony:read')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<CeremonyDto> {
    return this.uow.run(() => this.queries.get(id));
  }

  @Get(':id/eligible')
  @RequirePermission('ceremony:manage')
  eligible(@Param('id', ParseUUIDPipe) id: string): Promise<Array<{ applicationId: string; candidateName: string }>> {
    return this.uow.run(() => this.queries.eligible(id));
  }

  @Post(':id/attendees')
  @RequirePermission('ceremony:manage')
  attach(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(attachAttendeeBody)) body: ReturnType<typeof attachAttendeeBody.parse>,
  ): Promise<CeremonyDto> {
    return this.uow.run(() => this.attendance.attach(id, body.applicationId));
  }

  @Delete(':id/attendees/:applicationId')
  @RequirePermission('ceremony:manage')
  detach(@Param('id', ParseUUIDPipe) id: string, @Param('applicationId', ParseUUIDPipe) applicationId: string): Promise<CeremonyDto> {
    return this.uow.run(() => this.attendance.detach(id, applicationId));
  }

  @Patch(':id/attendees/:applicationId')
  @RequirePermission('ceremony:manage')
  markAttendance(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
    @Body(zod(markAttendanceRequest)) body: MarkAttendanceRequest,
  ): Promise<CeremonyDto> {
    return this.uow.run(() => this.attendance.markAttendance(id, applicationId, body));
  }

  @Post(':id/complete')
  @RequirePermission('ceremony:manage')
  complete(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(completeCeremonyBody)) body: ReturnType<typeof completeCeremonyBody.parse>,
  ): Promise<CeremonyDto> {
    return this.uow.run(() => this.completion.complete(id, body));
  }

  @Post(':id/cancel')
  @RequirePermission('ceremony:manage')
  cancel(@Param('id', ParseUUIDPipe) id: string): Promise<CeremonyDto> {
    return this.uow.run(() => this.planning.cancel(id));
  }
}
