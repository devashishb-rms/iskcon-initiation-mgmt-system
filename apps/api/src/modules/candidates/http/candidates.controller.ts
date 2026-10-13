import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import {
  createCandidateBody,
  createNoteBody,
  createSecondApplicationBody,
  type CreateCandidateResponse,
  type NoteDto,
} from '@iskcon/contracts';
import { Authenticated, RequirePermission } from '../../../platform/access/decorators';
import { zod } from '../../../common/zod.pipe';
import { UnitOfWork } from '../../../database/database.module';
import { CandidatesService } from '../application/candidates.service';

@Controller()
export class CandidatesController {
  constructor(
    private readonly candidates: CandidatesService,
    private readonly uow: UnitOfWork,
  ) {}

  @Post('candidates')
  @RequirePermission('candidate:create')
  create(@Body(zod(createCandidateBody)) body: ReturnType<typeof createCandidateBody.parse>): Promise<CreateCandidateResponse> {
    return this.uow.run(() => this.candidates.createCandidate(body));
  }

  @Post('candidates/:candidateId/applications')
  @RequirePermission('candidate:create')
  createSecond(
    @Param('candidateId', ParseUUIDPipe) candidateId: string,
    @Body(zod(createSecondApplicationBody)) body: ReturnType<typeof createSecondApplicationBody.parse>,
  ): Promise<{ applicationId: string }> {
    return this.uow.run(() => this.candidates.createSecondApplication(candidateId, body.guruId));
  }

  @Get('applications/:id/notes')
  @Authenticated()
  listNotes(@Param('id', ParseUUIDPipe) id: string): Promise<NoteDto[]> {
    return this.uow.run(() => this.candidates.listNotes(id));
  }

  @Post('applications/:id/notes')
  @Authenticated()
  addNote(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(createNoteBody)) body: ReturnType<typeof createNoteBody.parse>,
  ): Promise<NoteDto> {
    return this.uow.run(() => this.candidates.addNote(id, body.kind, body.body));
  }
}
