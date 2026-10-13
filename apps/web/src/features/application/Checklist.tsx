'use client';

import type { EvaluationDto } from '@iskcon/contracts';
import { StatusBadge, StatusDot } from '@/components/ui';
import { useT } from '@/i18n/provider';

export interface ChecklistProps {
  evaluation: EvaluationDto;
  /** Staff screens show the rule id (R-1) and where the answer came from. */
  detailed?: boolean;
}

export function Checklist({ evaluation, detailed }: ChecklistProps) {
  const { t, tc, msg } = useT();
  return (
    <div className="checklist">
      <ul className="items">
        {evaluation.items.map((item) => (
          <li key={item.id} className="item" data-rule={item.id} data-status={item.status}>
            <StatusDot status={item.status} />
            <div className="m">
              <div className="item-label">
                {detailed ? <span className="rule-id">{item.id}</span> : null}
                {msg(item.label)}
              </div>
              <div className="sub">
                {msg(item.detail)}
                {detailed && item.source ? ` · ${tc(`source.${item.source}`)}` : ''}
                {item.originalStatus ? ` · ${t('checklist.wasStatus', { status: t(`status.${item.originalStatus}`) })}` : ''}
              </div>
            </div>
            <StatusBadge status={item.status} />
          </li>
        ))}
      </ul>
      <p className="sub">{t('checklist.unknownNote')}</p>
    </div>
  );
}

/** "3 of 4 met · 1 needs confirming" for lists and headers. */
export function ChecklistSummary({ met, total, worst }: { met: number; total: number; worst: 'MET' | 'UNKNOWN' | 'NOT_MET' }) {
  const { t } = useT();
  return (
    <span className={`chip ${worst === 'MET' ? 'met' : worst === 'UNKNOWN' ? 'unknown' : 'not_met'}`}>
      <i aria-hidden="true" />
      {t('checklist.summary', { met, total })} · {t(worst === 'MET' ? 'status.MET' : worst === 'UNKNOWN' ? 'checklist.worstUnknown' : 'checklist.worstNotMet')}
    </span>
  );
}
