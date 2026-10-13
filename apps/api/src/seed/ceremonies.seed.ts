import { addMonths } from '@iskcon/rules-engine';
import { CeremoniesQueryService, CeremonyPlanningService } from '../modules/ceremonies';
import type { SeedStep } from './seed-kit';

/**
 * One planned first-initiation ceremony with the Lokanath guru, a month from today, so the
 * ceremonies screen has something to show. INVENTED sample data (the venue and date are illustrative).
 * Safe to run again: it does nothing if that guru already has a planned first-track ceremony.
 */
const step: SeedStep = {
  name: 'ceremonies',
  order: 50,
  async run(ctx) {
    const guruId = ctx.shared.guruLokanath;
    const admin = ctx.people.admin;
    if (!guruId || !admin) throw new Error('The ceremonies step needs the core step (guru and administrator) to run first');
    const queries = ctx.get(CeremoniesQueryService);
    const planning = ctx.get(CeremonyPlanningService);

    const existing = await ctx.as(admin, () => queries.list());
    if (existing.some((c) => c.guru.id === guruId && c.track === 'FIRST' && c.status === 'PLANNED')) return;

    await ctx.as(admin, () =>
      planning.create({ guruId, track: 'FIRST', venue: 'ISKCON Newtown temple hall (sample)', date: addMonths(ctx.today, 1) }),
    );
  },
};

export default step;
