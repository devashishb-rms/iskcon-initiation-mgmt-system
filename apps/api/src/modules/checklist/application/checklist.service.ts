import { Injectable } from '@nestjs/common';
import { evaluate, nextStep, type NextStep } from '@iskcon/rules-engine';
import type { EvaluationDto, RuleVersionRef } from '@iskcon/contracts';
import type { RuleParams } from '@iskcon/rules-engine';
import { Clock } from '../../../platform/clock/clock';
import { FacetRegistry } from '../../../platform/facets/facets';
import { ApplicationWithCandidate, isApprovedStage, toFacts } from '../../candidates';
import { RuleSetsService } from '../../rules';

export interface ChecklistResult {
  evaluation: EvaluationDto;
  nextStep: NextStep;
  ruleVersion: RuleVersionRef;
  params: RuleParams;
}

/**
 * Runs the rules engine for applications. It is the only place that gathers the engine's inputs:
 * facts from candidates, documents and exceptions from whichever modules contribute evidence, and
 * the rule version in force for the application's guru. The engine itself stays pure.
 */
@Injectable()
export class ChecklistService {
  constructor(
    private readonly rules: RuleSetsService,
    private readonly facets: FacetRegistry,
    private readonly clock: Clock,
  ) {}

  async evaluateMany(apps: ApplicationWithCandidate[]): Promise<Map<string, ChecklistResult>> {
    const out = new Map<string, ChecklistResult>();
    if (!apps.length) return out;
    const evidence = await this.facets.evidence(apps.map((a) => a.id));
    const resolved = new Map<string, Awaited<ReturnType<RuleSetsService['resolveFor']>>>();
    for (const guruId of new Set(apps.map((a) => a.guruId))) resolved.set(guruId ?? '', await this.rules.resolveFor(guruId));
    const today = this.clock.today();

    for (const a of apps) {
      const { ref, params } = resolved.get(a.guruId ?? '')!;
      const evaluation = evaluate(toFacts(a), params, {
        documents: evidence.documents.get(a.id) ?? [],
        exceptions: evidence.exceptions.get(a.id) ?? [],
        approved: isApprovedStage(a.stage),
        today,
      });
      out.set(a.id, { evaluation, nextStep: nextStep(evaluation), ruleVersion: ref, params });
    }
    return out;
  }

  async evaluateOne(app: ApplicationWithCandidate): Promise<ChecklistResult> {
    return (await this.evaluateMany([app])).get(app.id)!;
  }
}
