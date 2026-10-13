'use client';

import type { ApplicationDetail, NoteDto } from '@iskcon/contracts';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Button, Chip, FormError, SelectField, Spinner, TextAreaField, useToast } from '@/components/ui';
import { useSession } from '@/features/auth/session';
import { useT } from '@/i18n/provider';
import { applicationsApi } from '@/lib/api';

export const notesKey = (id: string) => ['notes', id] as const;

export function useNotes(applicationId: string) {
  return useQuery({ queryKey: notesKey(applicationId), queryFn: () => applicationsApi.notes(applicationId), enabled: applicationId !== '' });
}

/** Newest send-back that has not been answered by a later readiness note (shown to the mentor and the candidate). */
export function latestOpenSendBack(notes: NoteDto[]): NoteDto | null {
  const sorted = [...notes].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const lastBack = [...sorted].reverse().find((n) => n.kind === 'SEND_BACK');
  if (!lastBack) return null;
  const answered = sorted.some((n) => n.kind === 'READINESS' && n.createdAt > lastBack.createdAt);
  return answered ? null : lastBack;
}

export function NotesThread({ detail, onChanged }: { detail: ApplicationDetail; onChanged: () => void }) {
  const { t, dateTime } = useT();
  const toast = useToast();
  const session = useSession();
  const notes = useNotes(detail.applicationId);
  const [body, setBody] = useState('');
  const [kind, setKind] = useState<'MESSAGE' | 'MONTHLY'>('MESSAGE');
  const { canMessage, canAddMonthlyNote } = detail.actions;

  const send = useMutation({
    mutationFn: () => applicationsApi.addNote(detail.applicationId, canAddMonthlyNote ? kind : 'MESSAGE', body.trim()),
    onSuccess: () => {
      setBody('');
      toast.success(t('notes.sent'));
      onChanged();
    },
  });

  if (notes.isPending) return <Spinner />;
  const list = [...(notes.data ?? [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return (
    <div className="stack">
      <FormError error={notes.error} />
      {list.length === 0 ? <p className="muted">{t('notes.none')}</p> : null}
      <ol className="thread">
        {list.map((n) => (
          <li key={n.id} className={n.author.id === session.user.id ? 'msg mine' : 'msg'} data-kind={n.kind}>
            <div className="sub">
              {n.author.name} · {dateTime(n.createdAt)} · <Chip tone={n.kind === 'SEND_BACK' ? 'amber' : 'plain'}>{t(`notes.kind.${n.kind}`)}</Chip>
            </div>
            <p className="msg-body">{n.body}</p>
          </li>
        ))}
      </ol>
      {canMessage || canAddMonthlyNote ? (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            if (body.trim()) send.mutate();
          }}
        >
          {canAddMonthlyNote ? (
            <SelectField label={t('notes.kindLabel')} value={kind} onChange={(e) => setKind(e.target.value === 'MONTHLY' ? 'MONTHLY' : 'MESSAGE')}>
              <option value="MESSAGE">{t('notes.kind.MESSAGE')}</option>
              <option value="MONTHLY">{t('notes.kind.MONTHLY')}</option>
            </SelectField>
          ) : null}
          <TextAreaField
            label={kind === 'MONTHLY' && canAddMonthlyNote ? t('notes.monthlyLabel') : t('notes.writeLabel')}
            hint={kind === 'MONTHLY' && canAddMonthlyNote ? t('notes.monthlyHint') : undefined}
            value={body}
            maxLength={4000}
            onChange={(e) => setBody(e.target.value)}
          />
          <FormError error={send.error} />
          <div>
            <Button type="submit" variant="primary" loading={send.isPending} disabled={!body.trim()}>
              {t('notes.send')}
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
