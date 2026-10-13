'use client';

import type { ApplicationDetail, DocumentDto } from '@iskcon/contracts';
import { documentType } from '@iskcon/contracts';
import { useMutation } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Button, ConfirmDialog, FileLink, FormError, SelectField, StatusBadge, useToast } from '@/components/ui';
import { useSession } from '@/features/auth/session';
import { useT } from '@/i18n/provider';
import { applicationsApi } from '@/lib/api';
import { DOCUMENT_TYPES } from '@/lib/enums';

type DocType = (typeof DOCUMENT_TYPES)[number];

export interface DocumentsPanelProps {
  detail: ApplicationDetail;
  onChanged: () => void;
  /** Phone layout: bigger buttons and the camera shortcut first. */
  phone?: boolean;
}

/** On file / missing for each document, plus upload (file picker or camera) with API error codes translated. */
export function DocumentsPanel({ detail, onChanged, phone }: DocumentsPanelProps) {
  const { t, tc, dateTime } = useT();
  const toast = useToast();
  const session = useSession();
  const canUpload = detail.actions.canUpload;
  const [type, setType] = useState<DocType>('OTHER');
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const pendingType = useRef<DocType>('OTHER');
  const [removing, setRemoving] = useState<DocumentDto | null>(null);

  const upload = useMutation({
    mutationFn: ({ docType, file }: { docType: DocType; file: File }) => applicationsApi.upload(detail.applicationId, docType, file),
    onSuccess: () => {
      toast.success(t('documents.uploaded'));
      onChanged();
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => applicationsApi.deleteDocument(id),
    onSuccess: () => {
      setRemoving(null);
      toast.success(t('documents.removed'));
      onChanged();
    },
  });

  const missing = detail.evaluation.missingDocuments;
  const byType = new Map<string, DocumentDto[]>();
  for (const d of detail.documents) byType.set(d.type, [...(byType.get(d.type) ?? []), d]);
  // Course certificate is always worth asking for when rule R-4 waits on it.
  const wantsCertificate = detail.nextStep.code === 'UPLOAD_COURSE_CERTIFICATE' && !byType.has('COURSE_CERTIFICATE');
  const requiredMissing = new Set<string>(missing);
  if (wantsCertificate) requiredMissing.add('COURSE_CERTIFICATE');

  const pick = (docType: DocType, camera = false) => {
    pendingType.current = docType;
    (camera ? cameraRef : fileRef).current?.click();
  };
  const onFile = (file: File | undefined) => {
    if (file) upload.mutate({ docType: pendingType.current, file });
    if (fileRef.current) fileRef.current.value = '';
    if (cameraRef.current) cameraRef.current.value = '';
  };

  return (
    <div className="stack">
      <ul className="items">
        {[...requiredMissing].map((tp) => (
          <li key={`missing-${tp}`} className="item" data-doc={tp} data-state="missing">
            <div className="m">
              <div className="item-label">{tc(`docType.${tp}`)}</div>
              <div className="sub">{t('documents.required')}</div>
            </div>
            <StatusBadge status="NOT_MET" label={t('documents.missing')} />
            {canUpload ? (
              <Button small onClick={() => pick(tp as DocType)} className={phone ? 'wide-on-phone' : ''}>
                {t('documents.upload')}
              </Button>
            ) : null}
          </li>
        ))}
        {detail.documents.map((d) => (
          <li key={d.id} className="item" data-doc={d.type} data-state="onfile">
            <div className="m">
              <div className="item-label">{tc(`docType.${d.type}`)}</div>
              <div className="sub">
                {d.filename} · {t('documents.sizeKb', { kb: Math.max(1, Math.round(d.sizeBytes / 1024)) })} · {dateTime(d.uploadedAt)} · {d.uploadedBy}
              </div>
            </div>
            <StatusBadge status="MET" label={t('documents.onFile')} />
            <FileLink small href={applicationsApi.documentUrl(d.id)} target="_blank" rel="noopener noreferrer">
              {t('documents.view')}
              <span className="sr"> {d.filename}</span>
            </FileLink>
            {canUpload && (d.uploadedBy === session.user.name || session.roles.includes('ADMIN')) ? (
              <Button small variant="danger" onClick={() => setRemoving(d)}>
                {t('documents.remove')}
                <span className="sr"> {d.filename}</span>
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      {detail.documents.length === 0 && requiredMissing.size === 0 ? <p className="muted">{t('documents.none')}</p> : null}

      {canUpload ? (
        <div className="panel plain">
          <h3>{t('documents.addTitle')}</h3>
          <SelectField label={t('documents.type')} value={type} onChange={(e) => {
              const next = documentType.parse(e.target.value);
              setType(next);
              pendingType.current = next;
            }}>
            {DOCUMENT_TYPES.map((tp) => (
              <option key={tp} value={tp}>
                {tc(`docType.${tp}`)}
              </option>
            ))}
          </SelectField>
          <div className="row">
            <Button variant="primary" onClick={() => pick(type, true)} loading={upload.isPending}>
              {t('documents.takePhoto')}
            </Button>
            <Button onClick={() => pick(type)} disabled={upload.isPending}>
              {t('documents.chooseFile')}
            </Button>
          </div>
          <p className="sub">{t('documents.privacy')}</p>
          <FormError error={upload.error ?? remove.error} />
          {/* Hidden inputs are driven by the buttons above, so both stay keyboard reachable. */}
          <input ref={fileRef} type="file" className="sr-input" tabIndex={-1} aria-hidden="true" accept="application/pdf,image/*" onChange={(e) => onFile(e.target.files?.[0])} data-testid="file-input" />
          <input ref={cameraRef} type="file" className="sr-input" tabIndex={-1} aria-hidden="true" accept="image/*" capture="environment" onChange={(e) => onFile(e.target.files?.[0])} />
        </div>
      ) : null}
      {!canUpload && detail.documents.length > 0 ? <p className="sub">{t('documents.privacy')}</p> : null}

      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        onConfirm={() => removing && remove.mutate(removing.id)}
        title={t('documents.removeTitle')}
        confirmLabel={t('documents.remove')}
        danger
        busy={remove.isPending}
        error={remove.error}
      >
        <p>{removing ? t('documents.removeBody', { name: removing.filename, date: dateTime(removing.uploadedAt) }) : ''}</p>
      </ConfirmDialog>
    </div>
  );
}
