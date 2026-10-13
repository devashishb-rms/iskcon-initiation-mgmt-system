import { Injectable } from '@nestjs/common';
import { Conflict, NotFound } from '../../../common/errors';
import { Clock } from '../../../platform/clock/clock';
import { RequestContextService } from '../../../platform/tenancy/request-context';
import { TenantDirectory } from '../../../platform/tenancy/tenancy.module';
import { ApplicationAccess } from '../../../shared/application-ports';
import { AuditService } from '../../audit';
import { isApprovedStage } from '../../candidates';
import { UsersService } from '../../identity';
import { RuleSetsService } from '../../rules';
import { longDate } from '../domain/format';
import { readSnapshot } from '../domain/snapshot';
import { DecisionsRepository } from '../infrastructure/decisions.repository';
import { LetterRenderer } from '../infrastructure/letter.renderer';

export interface PdfFile {
  filename: string;
  content: Buffer;
}

/**
 * The president's recommendation letter. It is produced only for a file the president has approved,
 * and says what was true on the day: the rule set version and the checklist come from the snapshot
 * stored with the decision, never from today's rules.
 */
@Injectable()
export class LetterService {
  constructor(
    private readonly access: ApplicationAccess,
    private readonly repo: DecisionsRepository,
    private readonly rules: RuleSetsService,
    private readonly users: UsersService,
    private readonly tenants: TenantDirectory,
    private readonly renderer: LetterRenderer,
    private readonly audit: AuditService,
    private readonly ctx: RequestContextService,
    private readonly clock: Clock,
  ) {}

  async letterFor(applicationId: string): Promise<PdfFile> {
    const app = await this.access.assertCanRead(applicationId);
    const tenantId = this.ctx.tenantId;
    const decision = await this.repo.latestRecommendation(tenantId, applicationId);
    if (!decision || decision.decision !== 'APPROVE' || !isApprovedStage(app.stage)) {
      throw new Conflict('CONFLICT', 'There is no approved recommendation for this file yet', { stage: app.stage });
    }
    const snapshot = readSnapshot(decision.evaluationSnapshot);
    if (!snapshot) throw new Conflict('CONFLICT', 'The stored checklist of this decision cannot be read');
    const [tenant, refs, people] = await Promise.all([
      this.tenants.byId(tenantId),
      this.rules.refsFor([decision.ruleSetVersionId]),
      this.users.findMany([decision.decidedById]),
    ]);
    const ruleVersion = refs.get(decision.ruleSetVersionId);
    if (!tenant || !ruleVersion) throw new NotFound('Rule version');

    const content = await this.renderer.render({
      templeName: tenant.name,
      candidateName: app.candidateName,
      guruName: snapshot.guru?.name ?? 'the spiritual master chosen by the candidate',
      track: app.track,
      recommendedOn: longDate(decision.createdAt, tenant.timezone),
      ruleSet: { name: ruleVersion.ruleSetName, version: ruleVersion.version },
      evaluation: snapshot.evaluation,
      decidedBy: people[0]?.name ?? 'the president',
      reference: decision.id,
    });
    await this.audit.record({
      action: 'recommendation.letter-generated',
      entityType: 'recommendation',
      entityId: decision.id,
      applicationId,
      detail: { at: this.clock.now().toISOString() },
    });
    return { filename: `recommendation-letter-${applicationId.slice(0, 8)}.pdf`, content };
  }
}
