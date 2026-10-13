import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Patch, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import {
  advanceBody,
  candidateListQuery,
  changeGuruBody,
  pageQuery,
  submitApplicationBody,
  updateFactsBody,
  type ApplicationDetail,
  type CandidateListItem,
  type Page,
  type ReviewQueueItem,
  type TimelineEvent,
} from '@iskcon/contracts';
import { Authenticated, RequirePermission } from '../../../platform/access/decorators';
import { toCsv } from '../../../common/csv';
import { zod } from '../../../common/zod.pipe';
import { UnitOfWork } from '../../../database/database.module';
import { CandidatesService } from '../../candidates';
import { ApplicationViewService } from '../application/application-view.service';

const READ_ANY_SCOPE = ['candidate:read:any', 'candidate:read:assigned', 'candidate:read:own'] as const;

/**
 * The screens' endpoints. Reads compose several modules; each change calls the module that owns the
 * data inside one transaction, then answers with the refreshed application so the screen redraws
 * from one source of truth.
 */
@Controller()
export class ApplicationsController {
  constructor(
    private readonly view: ApplicationViewService,
    private readonly candidates: CandidatesService,
    private readonly uow: UnitOfWork,
  ) {}

  @Get('candidates')
  @RequirePermission(...READ_ANY_SCOPE)
  list(@Query(zod(candidateListQuery)) query: ReturnType<typeof candidateListQuery.parse>): Promise<Page<CandidateListItem>> {
    return this.uow.run(() => this.view.list(query));
  }

  @Get('candidates/export.csv')
  @RequirePermission('candidate:export')
  @Header('Cache-Control', 'no-store')
  async exportCsv(
    @Query(zod(candidateListQuery)) query: ReturnType<typeof candidateListQuery.parse>,
    @Res() res: Response,
  ): Promise<void> {
    const page = await this.uow.run(() => this.view.list({ ...query, page: 1, pageSize: 200 }));
    const csv = toCsv(
      ['Name', 'Group', 'Track', 'Stage', 'Status', 'Mentor', 'Guru', 'Checklist met', 'Checklist total'],
      page.items.map((i) => [i.name, i.groupName, i.track, i.stage, i.status, i.mentor?.name, i.guru?.name, i.checklist.met, i.checklist.total]),
    );
    res.type('text/csv; charset=utf-8').attachment('candidates.csv').send(csv);
  }

  @Get('review-queue')
  @RequirePermission('recommendation:decide')
  reviewQueue(@Query(zod(pageQuery)) q: ReturnType<typeof pageQuery.parse>): Promise<Page<ReviewQueueItem>> {
    return this.uow.run(() => this.view.reviewQueue(q.page, q.pageSize));
  }

  @Get('me/path')
  @RequirePermission('candidate:read:own')
  mine(): Promise<ApplicationDetail> {
    return this.uow.run(() => this.view.mine());
  }

  @Get('applications/:id')
  @RequirePermission(...READ_ANY_SCOPE)
  detail(@Param('id', ParseUUIDPipe) id: string): Promise<ApplicationDetail> {
    return this.uow.run(() => this.view.detail(id));
  }

  @Get('applications/:id/timeline')
  @RequirePermission(...READ_ANY_SCOPE)
  timeline(@Param('id', ParseUUIDPipe) id: string): Promise<TimelineEvent[]> {
    return this.uow.run(() => this.view.timeline(id));
  }

  /** Each field is checked against its own permission inside the service. */
  @Patch('applications/:id/facts')
  @Authenticated()
  updateFacts(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(updateFactsBody)) body: ReturnType<typeof updateFactsBody.parse>,
  ): Promise<ApplicationDetail> {
    return this.uow.run(async () => {
      await this.candidates.updateFacts(id, body);
      return this.view.detail(id);
    });
  }

  @Patch('applications/:id/guru')
  @RequirePermission('application:change-guru')
  changeGuru(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(changeGuruBody)) body: ReturnType<typeof changeGuruBody.parse>,
  ): Promise<ApplicationDetail> {
    return this.uow.run(async () => {
      await this.candidates.changeGuru(id, body.guruId);
      return this.view.detail(id);
    });
  }

  @Post('applications/:id/advance')
  @RequirePermission('application:advance')
  advance(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(advanceBody)) body: ReturnType<typeof advanceBody.parse>,
  ): Promise<ApplicationDetail> {
    return this.uow.run(async () => {
      await this.candidates.advance(id, body.to, body.shelterDate, body.reason);
      return this.view.detail(id);
    });
  }

  @Post('applications/:id/submit')
  @RequirePermission('application:submit')
  submit(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(submitApplicationBody)) body: ReturnType<typeof submitApplicationBody.parse>,
  ): Promise<ApplicationDetail> {
    return this.uow.run(async () => {
      await this.candidates.submit(id, body.readinessNote);
      return this.view.detail(id);
    });
  }
}
