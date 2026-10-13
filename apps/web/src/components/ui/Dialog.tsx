'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { useT } from '@/i18n/provider';
import { Button } from './Button';
import { FormError } from './FormError';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}

/** A modal built on the native <dialog>: focus is trapped, Esc closes, focus returns to the opener. */
export function Dialog({ open, onClose, title, children, footer, wide }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const { t } = useT();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      if (typeof el.showModal === 'function') el.showModal();
      else el.setAttribute('open', '');
    } else if (!open && el.open) {
      if (typeof el.close === 'function') el.close();
      else el.removeAttribute('open');
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={wide ? 'dialog wide' : 'dialog'}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      {open ? (
        <div className="dialog-body">
          <div className="dialog-head">
            <h2 id={titleId}>{title}</h2>
            <button type="button" className="icon-btn" onClick={onClose} aria-label={t('common.close')}>
              <span aria-hidden="true">×</span>
            </button>
          </div>
          <div className="dialog-content">{children}</div>
          {footer ? <div className="dialog-foot">{footer}</div> : null}
        </div>
      ) : null}
    </dialog>
  );
}

export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  error?: unknown;
}

export function ConfirmDialog({ open, onClose, onConfirm, title, children, confirmLabel, danger, busy, error }: ConfirmDialogProps) {
  const { t } = useT();
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="stack">
        {children}
        <FormError error={error} />
      </div>
    </Dialog>
  );
}
