import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthService } from './application/auth.service';
import { OtpService } from './application/otp.service';
import { SessionService } from './application/session.service';
import { TotpService } from './application/totp.service';
import { UsersService } from './application/users.service';
import { AuthController } from './http/auth.controller';
import { PeopleController } from './http/people.controller';
import { AccessGuard } from './http/session.guard';
import { OtpRepository } from './infrastructure/otp.repository';
import { SessionsRepository } from './infrastructure/sessions.repository';
import { UsersRepository } from './infrastructure/users.repository';

@Global()
@Module({
  controllers: [AuthController, PeopleController],
  providers: [
    UsersRepository,
    SessionsRepository,
    OtpRepository,
    UsersService,
    SessionService,
    OtpService,
    TotpService,
    AuthService,
    { provide: APP_GUARD, useClass: AccessGuard },
  ],
  exports: [UsersService, SessionService],
})
export class IdentityModule {}
