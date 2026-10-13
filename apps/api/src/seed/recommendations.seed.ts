import { CONSENT_VERSION } from '@iskcon/contracts';
import { ApplicationsQueryService, CandidatesService } from '../modules/candidates';
import { ExceptionsService, GuruResponseService, RecommendationService } from '../modules/recommendations';
import type { SeedStep } from './seed-kit';

/**
 * Leaves the earlier sample files as they are: Debashis Lahiri stays blocked by his guru's longer
 * shelter period (NO exception is recorded for him) and Sunita Roy stays waiting for the president.
 *
 * Adds one more INVENTED person who has been through the whole path, so the president's decision,
 * a committee exception, the guru's answer and the ceremony list all have something to show:
 * Radha Mondal, mentor Kalyan Dutta, guru HH Lokanath Swami Maharaj. Her course certificate is still
 * with the Course office, which the committee covered with a written exception; the president
 * recommended her and the guru's office accepted. Safe to run again: it resumes from wherever her
 * file stands.
 */
const NAME = 'Radha Mondal';

const step: SeedStep = {
  name: 'recommendations',
  order: 40,
  async run(ctx) {
    const { president, committee, kalyan } = ctx.people;
    const guruId = ctx.shared.guruLokanath;
    if (!president || !committee || !kalyan || !guruId) throw new Error('The recommendations step needs the core step to run first');
    const candidates = ctx.get(CandidatesService);
    const queries = ctx.get(ApplicationsQueryService);
    const exceptions = ctx.get(ExceptionsService);
    const decisions = ctx.get(RecommendationService);
    const guruResponses = ctx.get(GuruResponseService);

    const existing = await ctx.as(committee, () => queries.list({ q: NAME, page: 1, pageSize: 5 }));
    let applicationId = existing.items[0]?.id;
    if (!applicationId) {
      const created = await ctx.as(committee, () =>
        candidates.createCandidate({
          name: NAME,
          email: 'radha@example.org',
          mentorId: kalyan.id,
          track: 'FIRST',
          createLogin: true,
          groupName: 'Rajarhat Sanga',
          consent: { accepted: true, version: CONSENT_VERSION },
        }),
      );
      applicationId = created.applicationId;
    }
    ctx.shared.radha = applicationId;
    const id = applicationId;

    // Walk the file forward from wherever it stands.
    for (let guard = 0; guard < 8; guard++) {
      const app = await ctx.as(committee, () => queries.get(id));
      if (app.status !== 'OPEN') return;
      if (app.stage === 'ASPIRING') {
        await ctx.as(kalyan, () => candidates.updateFacts(id, { practiceSince: ctx.monthsAgo(28) }));
        await ctx.as(committee, () => candidates.advance(id, 'SHELTER', ctx.monthsAgo(15)));
      } else if (app.stage === 'SHELTER') {
        await ctx.as(committee, () => candidates.advance(id, 'PREPARING'));
      } else if (app.stage === 'PREPARING') {
        await ctx.as(committee, () => candidates.updateFacts(id, { examStatus: 'PASSED', courseComplete: true }));
        await ctx.as(committee, () => candidates.changeGuru(id, guruId));
        await ctx.as(kalyan, () => candidates.submit(id, 'Chants 16 rounds daily and attends the morning programme.'));
      } else if (app.stage === 'APPLIED') {
        const covered = await ctx.as(committee, () => exceptions.list(id));
        if (!covered.some((e) => e.ruleId === 'R-4')) {
          await ctx.as(committee, () => exceptions.record(id, 'R-4', 'The certificate has been issued; the signed copy is with the Course office (sample).'));
        }
        await ctx.as(president, () => decisions.decide(id, { decision: 'APPROVE' }));
      } else if (app.stage === 'RECOMMENDED') {
        const answered = await ctx.as(committee, () => guruResponses.latest(app));
        if (!answered) await ctx.as(committee, () => guruResponses.record(id, { response: 'ACCEPTED' }));
        return;
      } else {
        return;
      }
    }
  },
};

export default step;
