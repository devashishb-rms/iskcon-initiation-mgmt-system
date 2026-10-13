'use client';

import type { NextStepDto } from '@iskcon/contracts';
import type { ReactNode } from 'react';
import { useT } from '@/i18n/provider';

/** The one thing to do next, in plain words. `action` is an optional button (e.g. upload the certificate). */
export function NextStepCard({ nextStep, action, heading }: { nextStep: NextStepDto; action?: ReactNode; heading?: string }) {
  const { t, tc, date } = useT();
  const params = { dueOn: nextStep.dueOn ? date(nextStep.dueOn) : '–' };
  return (
    <section className="next" aria-labelledby="next-step-h">
      <div className="k" id="next-step-h">
        {heading ?? t('nextStep.heading')}
      </div>
      <p className="t" data-testid="next-step">
        {tc(`nextStep.${nextStep.code}`, params)}
      </p>
      {action}
    </section>
  );
}
