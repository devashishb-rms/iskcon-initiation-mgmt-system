import { Body, Controller, Get, HttpCode, Post, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  confirmMfaEnrolBody,
  requestOtpBody,
  verifyMfaBody,
  verifyOtpBody,
  type SessionResponse,
} from '@iskcon/contracts';
import type { Response } from 'express';
import { Inject } from '@nestjs/common';
import { ENV } from '../../../config/config.module';
import type { Env } from '../../../config/env';
import { zod } from '../../../common/zod.pipe';
import { AllowWithoutMfa, Authenticated, CurrentUser, Public } from '../../../platform/access/decorators';
import type { AuthUser } from '../../../platform/tenancy/request-context';
import { AuthService } from '../application/auth.service';
import { SESSION_COOKIE } from './session.guard';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Always answers 202, whether or not the identifier belongs to anyone. */
  @Public()
  @Post('otp/request')
  @HttpCode(202)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async requestOtp(@Body(zod(requestOtpBody)) body: ReturnType<typeof requestOtpBody.parse>): Promise<{ accepted: true }> {
    await this.auth.requestCode(body.identifier);
    return { accepted: true };
  }

  @Public()
  @Post('otp/verify')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async verifyOtp(
    @Body(zod(verifyOtpBody)) body: ReturnType<typeof verifyOtpBody.parse>,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionResponse> {
    const { token, session } = await this.auth.signIn(body.identifier, body.code);
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.env.COOKIE_SECURE,
      domain: this.env.COOKIE_DOMAIN,
      path: '/',
      maxAge: this.env.SESSION_TTL_HOURS * 3_600_000,
    });
    return session;
  }

  @Authenticated()
  @AllowWithoutMfa()
  @Get('session')
  session(@CurrentUser() user: AuthUser): Promise<SessionResponse> {
    return this.auth.describe(user);
  }

  @Authenticated()
  @AllowWithoutMfa()
  @Post('logout')
  @HttpCode(204)
  async logout(@CurrentUser() user: AuthUser, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.auth.signOut(user);
    res.clearCookie(SESSION_COOKIE, { path: '/', domain: this.env.COOKIE_DOMAIN });
  }

  @Authenticated()
  @AllowWithoutMfa()
  @Post('mfa/enrol')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  enrol(@CurrentUser() user: AuthUser) {
    return this.auth.enrolMfa(user);
  }

  @Authenticated()
  @AllowWithoutMfa()
  @Post('mfa/enrol/confirm')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async confirmEnrol(@CurrentUser() user: AuthUser, @Body(zod(confirmMfaEnrolBody)) body: ReturnType<typeof confirmMfaEnrolBody.parse>): Promise<SessionResponse> {
    await this.auth.confirmMfaEnrolment(user, body.code);
    return this.auth.describe({ ...user, mfaVerified: true, mfaEnrolled: true });
  }

  @Authenticated()
  @AllowWithoutMfa()
  @Post('mfa/verify')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async verifyMfa(@CurrentUser() user: AuthUser, @Body(zod(verifyMfaBody)) body: ReturnType<typeof verifyMfaBody.parse>): Promise<SessionResponse> {
    await this.auth.verifyMfa(user, body.code);
    return this.auth.describe({ ...user, mfaVerified: true });
  }
}
