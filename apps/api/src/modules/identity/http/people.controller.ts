import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import {
  createPersonBody,
  mentorOption,
  updatePersonBody,
  type MentorOption,
  type PersonDto,
} from '@iskcon/contracts';
import { Authenticated, RequirePermission } from '../../../platform/access/decorators';
import { zod } from '../../../common/zod.pipe';
import { UnitOfWork } from '../../../database/database.module';
import { UsersService } from '../application/users.service';
import { SessionService } from '../application/session.service';
import type { UserWithRoles } from '../infrastructure/users.repository';

const toDto = (u: UserWithRoles): PersonDto => ({
  id: u.id,
  name: u.name,
  email: u.email,
  phone: u.phone,
  roles: u.roles,
  locale: u.locale as PersonDto['locale'],
  active: u.active,
  mfaEnrolled: u.totpEnabledAt !== null,
});

@Controller()
export class PeopleController {
  constructor(
    private readonly users: UsersService,
    private readonly sessions: SessionService,
    private readonly uow: UnitOfWork,
  ) {}

  @Get('people')
  @RequirePermission('people:manage')
  async list(): Promise<PersonDto[]> {
    return (await this.users.listAll()).map(toDto);
  }

  @Post('people')
  @RequirePermission('people:manage')
  create(@Body(zod(createPersonBody)) body: ReturnType<typeof createPersonBody.parse>): Promise<PersonDto> {
    return this.uow.run(async () => toDto(await this.users.create(body)));
  }

  @Patch('people/:id')
  @RequirePermission('people:manage')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(updatePersonBody)) body: ReturnType<typeof updatePersonBody.parse>,
  ): Promise<PersonDto> {
    return this.uow.run(async () => {
      const updated = await this.users.update(id, body);
      // A deactivated person or a changed role set must not keep an old session.
      if (body.active === false || body.roles) await this.sessions.revokeAllFor(id);
      return toDto(updated);
    });
  }

  /** Pickers: who can be a mentor. Anyone who may see candidates may see the list of mentors. */
  @Get('mentors')
  @Authenticated()
  async mentors(): Promise<MentorOption[]> {
    return (await this.users.listByRole('MENTOR')).filter((u) => u.active).map((u) => mentorOption.parse({ id: u.id, name: u.name }));
  }
}
