'use client';

import type { ReactNode } from 'react';
import type { MessageKey } from '@/i18n/core';
import { useT } from '@/i18n/provider';

export type CheckStatusValue = 'MET' | 'UNKNOWN' | 'NOT_MET' | 'LATER' | 'EXCEPTION';

const CLASS: Record<CheckStatusValue, string> = {
  MET: 'met',
  UNKNOWN: 'unknown',
  NOT_MET: 'not_met',
  LATER: 'later',
  EXCEPTION: 'exception',
};

export const STATUS_KEY: Record<CheckStatusValue, MessageKey> = {
  MET: 'status.MET',
  UNKNOWN: 'status.UNKNOWN',
  NOT_MET: 'status.NOT_MET',
  LATER: 'status.LATER',
  EXCEPTION: 'status.EXCEPTION',
};

/** Shape marker that differs per status, so colour is never the only signal. */
export function StatusDot({ status }: { status: CheckStatusValue }) {
  return <span className={`dot ${CLASS[status]}`} aria-hidden="true" />;
}

/** Word + shape + colour. "Needs confirming" is deliberately different from "Not met". */
export function StatusBadge({ status, label }: { status: CheckStatusValue; label?: string }) {
  const { t } = useT();
  return (
    <span className={`chip ${CLASS[status]}`} data-status={status}>
      <i aria-hidden="true" />
      {label ?? t(STATUS_KEY[status])}
    </span>
  );
}

/** Neutral or amber informational chip (text carries the meaning). */
export function Chip({ tone = 'plain', children }: { tone?: 'plain' | 'amber' | 'teal'; children: ReactNode }) {
  return <span className={`chip ${tone}`}>{children}</span>;
}
