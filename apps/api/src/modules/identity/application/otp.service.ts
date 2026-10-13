import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { ENV } from '../../../config/config.module';
import type { Env } from '../../../config/env';
import { AppError } from '../../../common/errors';
import { Clock } from '../../../platform/clock/clock';
import { EmailGateway, SmsGateway } from '../../../platform/delivery/gateways';
import { Sealer } from '../../../platform/security/sealer';
import { RequestContextService } from '../../../platform/tenancy/request-context';
import { normalizeIdentifier } from '../domain/identifier';
import { OtpRepository } from '../infrastructure/otp.repository';
import { UsersRepository, type UserWithRoles } from '../infrastructure/users.repository';

const MESSAGE = (code: string, minutes: number) =>
  `${code} is your sign-in code for the Initiation Office. It works for ${minutes} minutes. Do not share it.`;

@Injectable()
export class OtpService {
  private readonly log = new Logger(OtpService.name);

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly otps: OtpRepository,
    private readonly users: UsersRepository,
    private readonly sealer: Sealer,
    private readonly clock: Clock,
    private readonly ctx: RequestContextService,
    private readonly email: EmailGateway,
    private readonly sms: SmsGateway,
  ) {}

  /**
   * Sends a code if the identifier belongs to an active person. Says nothing about whether it did,
   * so the endpoint cannot be used to find out who has an account.
   */
  async request(rawIdentifier: string): Promise<void> {
    const id = normalizeIdentifier(rawIdentifier);
    if (!id) return;
    const tenantId = this.ctx.tenantId;
    const user = await this.users.findByContact(tenantId, id.kind, id.value);
    if (!user || !user.active) return;

    const now = this.clock.now();
    const recent = await this.otps.countSince(tenantId, user.id, new Date(now.getTime() - 3_600_000));
    if (recent >= this.env.OTP_MAX_PER_HOUR) {
      this.log.warn({ userId: user.id }, 'OTP request limit reached; no code sent');
      return;
    }

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.otps.consumeAllOpen(tenantId, user.id, now);
    await this.otps.insert({
      tenantId,
      userId: user.id,
      channel: id.kind === 'email' ? 'EMAIL' : 'SMS',
      destination: id.value,
      codeHash: this.sealer.mac(`${user.id}:${code}`),
      expiresAt: new Date(now.getTime() + this.env.OTP_TTL_MINUTES * 60_000),
    });

    const text = MESSAGE(code, this.env.OTP_TTL_MINUTES);
    if (id.kind === 'email') await this.email.send({ to: id.value, subject: 'Your sign-in code', text });
    else await this.sms.send({ to: id.value, text });
  }

  /** Checks a code. Returns the person on success; throws OTP_INVALID or OTP_EXPIRED. */
  async verify(rawIdentifier: string, code: string): Promise<UserWithRoles> {
    const id = normalizeIdentifier(rawIdentifier);
    const invalid = new AppError('OTP_INVALID', 401, 'The code is not correct');
    if (!id) throw invalid;
    const tenantId = this.ctx.tenantId;
    const user = await this.users.findByContact(tenantId, id.kind, id.value);
    if (!user || !user.active) throw invalid;

    const challenge = await this.otps.latestOpen(tenantId, user.id);
    if (!challenge) throw invalid;
    const now = this.clock.now();
    if (challenge.expiresAt <= now) {
      await this.otps.consume(challenge.id, now);
      throw new AppError('OTP_EXPIRED', 401, 'The code has expired');
    }
    if (challenge.attempts >= this.env.OTP_MAX_ATTEMPTS) {
      await this.otps.consume(challenge.id, now);
      throw invalid;
    }
    const ok = this.sealer.safeEqual(challenge.codeHash, this.sealer.mac(`${user.id}:${code}`));
    if (!ok) {
      await this.otps.bumpAttempts(challenge.id);
      throw invalid;
    }
    await this.otps.consume(challenge.id, now);
    return user;
  }
}
