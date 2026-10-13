'use client';

import { STAGES, type Stage, type Track } from '@iskcon/contracts';
import { useT } from '@/i18n/provider';

export interface StageStepperProps {
  stage: Stage;
  track: Track;
  /** Candidate screen: larger labels and a "Stage 3 of 6" caption. */
  caption?: boolean;
}

type StepState = 'done' | 'now' | 'todo' | 'earlier';

/** The six stages. A second-initiation file starts at Preparing; the first two are marked as done earlier. */
export function stepStates(stage: Stage, track: Track): { stage: Stage; state: StepState }[] {
  const idx = STAGES.indexOf(stage);
  return STAGES.map((s, i) => {
    let state: StepState = i < idx ? 'done' : i === idx ? 'now' : 'todo';
    if (stage === 'INITIATED' && i === idx) state = 'done';
    if (track === 'SECOND' && (s === 'ASPIRING' || s === 'SHELTER')) state = 'earlier';
    return { stage: s, state };
  });
}

export function StageStepper({ stage, track, caption }: StageStepperProps) {
  const { t } = useT();
  const steps = stepStates(stage, track);
  const idx = STAGES.indexOf(stage) + 1;
  return (
    <div className="stepper">
      {caption ? (
        <div className="row between">
          <b>{t('stage.caption', { n: idx, total: STAGES.length, stage: t(`stage.${stage}`) })}</b>
        </div>
      ) : null}
      <ol className="stagebar" aria-label={t('stage.label')}>
        {steps.map(({ stage: s, state }) => (
          <li key={s} className={state} aria-current={state === 'now' ? 'step' : undefined}>
            <i aria-hidden="true" />
            <span className="stage-name">{t(`stage.${s}`)}</span>
            <span className="sr">
              {state === 'done' ? t('stage.done') : state === 'now' ? t('stage.current') : state === 'earlier' ? t('stage.earlier') : t('stage.upcoming')}
            </span>
            {state === 'earlier' ? <span className="stage-sub" aria-hidden="true">{t('stage.earlierShort')}</span> : null}
          </li>
        ))}
      </ol>
    </div>
  );
}
