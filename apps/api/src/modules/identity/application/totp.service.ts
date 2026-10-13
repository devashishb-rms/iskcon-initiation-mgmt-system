import { Injectable } from '@nestjs/common';
import { authenticator } from 'otplib';
import { AppError, Conflict } from '../../../common/errors';
import { Sealer } from '../../../platform/security/sealer';
import { RequestContextService } from '../../../platform/tenancy/request-context';
import { Clock } from '../../../platform/clock/clock';
import { UsersRepository } from '../infrastructure/users.repository';

authenticator.options = { window: 1, step: 30, digits: 6 };

/** Second factor for the president and administrators (NFR-5). */
@Injectable()
export class TotpService {
  constructor(
    private readonly users: UsersRepository,
    private readonly sealer: Sealer,
    private readonly ctx: RequestContextService,
    private readonly clock: Clock,
  ) {}

  /** Starts enrolment. The secret is not active until the person proves they can generate a code. */
  async beginEnrolment(userId: string): Promise<{ secret: string; otpauthUrl: string }> {
    const user = await this.users.findById(this.ctx.tenantId, userId);
    if (!user) throw new AppError('NOT_FOUND', 404);
    if (user.totpEnabledAt) throw new Conflict('CONFLICT', 'A second factor is already set up');
    const secret = authenticator.generateSecret(20);
    await this.users.update(this.ctx.tenantId, userId, { totpSecretSealed: this.sealer.seal(secret) });
    const label = user.email ?? user.phone ?? user.name;
    return { secret, otpauthUrl: authenticator.keyuri(label, 'ISKCON Initiation Office', secret) };
  }

  async confirmEnrolment(userId: string, code: string): Promise<void> {
    const user = await this.users.findById(this.ctx.tenantId, userId);
    if (!user?.totpSecretSealed || user.totpEnabledAt) throw new AppError('OTP_INVALID', 401);
    if (!authenticator.check(code, this.sealer.open(user.totpSecretSealed))) throw new AppError('OTP_INVALID', 401);
    await this.users.update(this.ctx.tenantId, userId, { totpEnabledAt: this.clock.now() });
  }

  async verify(userId: string, code: string): Promise<void> {
    const user = await this.users.findById(this.ctx.tenantId, userId);
    if (!user?.totpSecretSealed || !user.totpEnabledAt) throw new AppError('OTP_INVALID', 401);
    if (!authenticator.check(code, this.sealer.open(user.totpSecretSealed))) throw new AppError('OTP_INVALID', 401);
  }
}
