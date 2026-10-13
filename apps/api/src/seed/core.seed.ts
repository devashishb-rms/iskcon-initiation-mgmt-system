import type { Role } from '@iskcon/contracts';
import { CONSENT_VERSION } from '@iskcon/contracts';
import { GurusService } from '../modules/gurus';
import { UsersService } from '../modules/identity';
import { ApplicationsQueryService, CandidatesService } from '../modules/candidates';
import { RuleSetsService } from '../modules/rules';
import type { SeedStep } from './seed-kit';

/**
 * Everything below is INVENTED sample data for demonstrations and tests. The four gurus' names are
 * the ones the temple asked for; the rule values shown for each office are illustrative, not their
 * real requirements. The temple must enter the real ones (docs/operations.md).
 */
const PEOPLE: Array<{ key: string; name: string; email: string; roles: Role[] }> = [
  { key: 'president', name: 'Temple President', email: 'president@example.org', roles: ['PRESIDENT'] },
  { key: 'admin', name: 'Administrator', email: 'admin@example.org', roles: ['ADMIN'] },
  { key: 'committee', name: 'Committee Member', email: 'committee@example.org', roles: ['COMMITTEE'] },
  { key: 'mohan', name: 'Mohan Biswas', email: 'mohan@example.org', roles: ['MENTOR'] },
  { key: 'kalyan', name: 'Kalyan Dutta', email: 'kalyan@example.org', roles: ['MENTOR'] },
];

const GURUS = [
  'HH Radhanath Swami Maharaj',
  'HH Lokanath Swami Maharaj',
  'HH Bhakti Ashray Vaishnav Swami Maharaj',
  'HH Jayapataka Swami Maharaj',
];

const consent = { accepted: true as const, version: CONSENT_VERSION };

const step: SeedStep = {
  name: 'core',
  order: 10,
  async run(ctx) {
    const users = ctx.get(UsersService);
    const gurus = ctx.get(GurusService);
    const rules = ctx.get(RuleSetsService);
    const candidates = ctx.get(CandidatesService);

    // People who work in the system.
    for (const p of PEOPLE) {
      const existing = await ctx.asSystem(() => users.findByContact('email', p.email));
      ctx.people[p.key] =
        existing ?? (await ctx.asSystem(() => users.create({ name: p.name, email: p.email, roles: p.roles })));
    }
    const admin = ctx.people.admin!;
    const committee = ctx.people.committee!;
    const mohan = ctx.people.mohan!;
    const kalyan = ctx.people.kalyan!;

    // Gurus and their (illustrative) rule sets.
    const guruIds: Record<string, string> = {};
    for (const name of GURUS) {
      const g = (await ctx.as(admin, () => gurus.findByName(name))) ?? (await ctx.as(admin, () => gurus.create(name)));
      guruIds[name] = g.id;
    }
    ctx.shared.guruRadhanath = guruIds[GURUS[0]!]!;
    ctx.shared.guruLokanath = guruIds[GURUS[1]!]!;
    ctx.shared.guruBhaktiAshray = guruIds[GURUS[2]!]!;
    ctx.shared.guruJayapataka = guruIds[GURUS[3]!]!;
    await ctx.as(admin, () => rules.ensureBaseline());
    // One office is shown with a longer shelter period only to demonstrate "a guru can raise the minimum".
    const sets = await ctx.as(admin, () => rules.list());
    if (!sets.some((s) => s.guru?.id === ctx.shared.guruBhaktiAshray)) {
      const created = await ctx.as(admin, () => rules.createForGuru(ctx.shared.guruBhaktiAshray!));
      const base = created.draft!.params;
      await ctx.as(admin, () => rules.saveDraft(created.id, { ...base, shelterMonths: 12 }, 'Illustrative: longer shelter period'));
      await ctx.as(admin, () => rules.publish(created.id));
    }

    const make = (name: string, email: string, mentor: typeof mohan, over: object = {}) =>
      ctx.as(committee, () =>
        candidates.createCandidate({
          name,
          email,
          mentorId: mentor.id,
          track: 'FIRST',
          createLogin: true,
          consent,
          ...over,
        }),
      );
    const facts = (appId: string, who: typeof mohan | typeof committee, patch: object) =>
      ctx.as(who, () => candidates.updateFacts(appId, patch));
    const advance = async (appId: string, to: 'SHELTER' | 'PREPARING', shelterDate?: string) =>
      ctx.as(committee, () => candidates.advance(appId, to, shelterDate));

    // Already loaded? Find the sample files again for the steps that follow, and stop.
    const queries = ctx.get(ApplicationsQueryService);
    const found = await ctx.as(committee, () => queries.list({ q: 'Rahul Das', page: 1, pageSize: 5 }));
    if (found.items.length) {
      for (const [key, name] of Object.entries({ rahul: 'Rahul Das', ananya: 'Ananya Sen', priya: 'Priya Ghosh', debashis: 'Debashis Lahiri', sunita: 'Sunita Roy' })) {
        const hit = await ctx.as(committee, () => queries.list({ q: name, page: 1, pageSize: 5 }));
        if (hit.items[0]) ctx.shared[key] = hit.items[0].id;
      }
      return;
    }

    // Rahul Das: just started.
    const rahul = await make('Rahul Das', 'rahul@example.org', kalyan, { groupName: 'Salt Lake Bhakti Vriksha' });
    ctx.shared.rahul = rahul.applicationId;

    // Ananya Sen: preparing, still needs her course certificate.
    const ananya = await make('Ananya Sen', 'ananya@example.org', mohan, { groupName: 'Newtown Sunday Sanga' });
    ctx.shared.ananya = ananya.applicationId;
    await facts(ananya.applicationId, mohan, { practiceSince: ctx.monthsAgo(20) });
    await advance(ananya.applicationId, 'SHELTER', ctx.monthsAgo(9));
    await advance(ananya.applicationId, 'PREPARING');
    await facts(ananya.applicationId, committee, { examStatus: 'PASSED' });
    await ctx.as(committee, () => candidates.changeGuru(ananya.applicationId, ctx.shared.guruRadhanath!));

    // Priya Ghosh: everything in order; the mentor can submit.
    const priya = await make('Priya Ghosh', 'priya@example.org', mohan, { groupName: 'Newtown Sunday Sanga' });
    ctx.shared.priya = priya.applicationId;
    await facts(priya.applicationId, mohan, { practiceSince: ctx.monthsAgo(30) });
    await advance(priya.applicationId, 'SHELTER', ctx.monthsAgo(14));
    await advance(priya.applicationId, 'PREPARING');
    await facts(priya.applicationId, committee, { examStatus: 'PASSED', courseComplete: true });
    await ctx.as(committee, () => candidates.changeGuru(priya.applicationId, ctx.shared.guruLokanath!));

    // Debashis Lahiri: already with the president, but too recent in shelter for his guru's office.
    const debashis = await make('Debashis Lahiri', 'debashis@example.org', kalyan, { groupName: 'Salt Lake Bhakti Vriksha' });
    ctx.shared.debashis = debashis.applicationId;
    await facts(debashis.applicationId, kalyan, { practiceSince: ctx.monthsAgo(26) });
    await advance(debashis.applicationId, 'SHELTER', ctx.monthsAgo(7));
    await advance(debashis.applicationId, 'PREPARING');
    await facts(debashis.applicationId, committee, { examStatus: 'PASSED', courseComplete: true });
    await ctx.as(committee, () => candidates.changeGuru(debashis.applicationId, ctx.shared.guruBhaktiAshray!));
    await ctx.as(kalyan, () => candidates.submit(debashis.applicationId, 'Chants 16 rounds, follows the principles, attends daily.'));

    // Sunita Roy: all rules met, waiting for the president's decision.
    const sunita = await make('Sunita Roy', 'sunita@example.org', mohan, { groupName: 'Rajarhat Sanga' });
    ctx.shared.sunita = sunita.applicationId;
    await facts(sunita.applicationId, mohan, { practiceSince: ctx.monthsAgo(40) });
    await advance(sunita.applicationId, 'SHELTER', ctx.monthsAgo(18));
    await advance(sunita.applicationId, 'PREPARING');
    await facts(sunita.applicationId, committee, { examStatus: 'PASSED', courseComplete: true });
    await ctx.as(committee, () => candidates.changeGuru(sunita.applicationId, ctx.shared.guruRadhanath!));
    await ctx.as(mohan, () => candidates.submit(sunita.applicationId, 'Steady for years; ready.'));
  },
};

export default step;
