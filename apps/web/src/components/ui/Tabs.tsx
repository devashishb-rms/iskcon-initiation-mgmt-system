'use client';

import { useRef, type KeyboardEvent, type ReactNode } from 'react';

export interface TabDef {
  id: string;
  label: ReactNode;
}

export interface TabsProps {
  tabs: TabDef[];
  active: string;
  onChange: (id: string) => void;
  label: string;
  /** Prefix for ids so panels can reference `aria-labelledby`. */
  idBase: string;
  className?: string;
}

/** WAI-ARIA tabs with arrow-key navigation. The caller renders the panel with role="tabpanel". */
export function Tabs({ tabs, active, onChange, label, idBase, className }: TabsProps) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const move = (e: KeyboardEvent, index: number) => {
    let next = index;
    if (e.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabs.length - 1;
    else return;
    e.preventDefault();
    const t = tabs[next];
    if (t) {
      onChange(t.id);
      refs.current[t.id]?.focus();
    }
  };
  return (
    <div className={['tabs', className ?? ''].join(' ')} role="tablist" aria-label={label}>
      {tabs.map((t, i) => (
        <button
          key={t.id}
          ref={(el) => {
            refs.current[t.id] = el;
          }}
          type="button"
          role="tab"
          id={`${idBase}-tab-${t.id}`}
          aria-selected={active === t.id}
          aria-controls={`${idBase}-panel-${t.id}`}
          tabIndex={active === t.id ? 0 : -1}
          className={active === t.id ? 'on' : ''}
          onClick={() => onChange(t.id)}
          onKeyDown={(e) => move(e, i)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export const panelProps = (idBase: string, id: string) =>
  ({ role: 'tabpanel', id: `${idBase}-panel-${id}`, 'aria-labelledby': `${idBase}-tab-${id}`, tabIndex: 0 }) as const;
