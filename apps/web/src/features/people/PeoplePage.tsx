'use client';

import { LOCALES, ROLES, createPersonBody, type GuruDto, type Locale, type PersonDto, type Role } from '@iskcon/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { RequirePermission } from '@/components/layout/RequirePermission';
import { Button, CheckboxField, Chip, DataTable, Dialog, FormError, SelectField, Spinner, TextField, useToast } from '@/components/ui';
import { LOCALE_NAMES } from '@/i18n/core';
import { useT } from '@/i18n/provider';
import { isApiError, peopleApi } from '@/lib/api';
import { useFieldErrorText } from '@/lib/use-error-text';

const PEOPLE_KEY = ['people'] as const;

export function PeoplePage() {
  return (
    <RequirePermission any={['people:manage']}>
      <PeopleView />
    </RequirePermission>
  );
}

function PeopleView() {
  const { t, tc } = useT();
  const people = useQuery({ queryKey: PEOPLE_KEY, queryFn: peopleApi.list });
  const [editing, setEditing] = useState<PersonDto | 'new' | null>(null);

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>{t('people.title')}</h1>
          <p className="lead">{t('people.lead')}</p>
        </div>
        <Button variant="primary" onClick={() => setEditing('new')}>
          {t('people.add')}
        </Button>
      </header>
      <FormError error={people.error} />
      {people.isPending ? (
        <Spinner />
      ) : (
        <div className="card">
          <DataTable<PersonDto>
            caption={t('people.caption')}
            rows={people.data ?? []}
            rowKey={(p) => p.id}
            columns={[
              { key: 'name', header: t('people.col.name'), cell: (p) => <span className="strong">{p.name}</span> },
              { key: 'contact', header: t('people.col.contact'), mobileLabel: t('people.col.contact'), cell: (p) => [p.email, p.phone].filter(Boolean).join(' · ') || '–' },
              {
                key: 'roles',
                header: t('people.col.roles'),
                mobileLabel: t('people.col.roles'),
                cell: (p) => (
                  <span className="chips">
                    {p.roles.map((r) => (
                      <Chip key={r}>{tc(`role.${r}`)}</Chip>
                    ))}
                  </span>
                ),
              },
              { key: 'locale', header: t('people.col.language'), mobileLabel: t('people.col.language'), cell: (p) => LOCALE_NAMES[p.locale] },
              {
                key: 'active',
                header: t('people.col.status'),
                mobileLabel: t('people.col.status'),
                cell: (p) => (
                  <>
                    <Chip tone={p.active ? 'teal' : 'amber'}>{p.active ? t('people.active') : t('people.inactive')}</Chip>
                    {p.mfaEnrolled ? <Chip>{t('people.mfaOn')}</Chip> : null}
                  </>
                ),
              },
              {
                key: 'edit',
                header: t('common.actions'),
                srOnlyHeader: true,
                className: 'actions',
                cell: (p) => (
                  <Button small onClick={() => setEditing(p)}>
                    {t('common.edit')}
                    <span className="sr"> {p.name}</span>
                  </Button>
                ),
              },
            ]}
          />
        </div>
      )}
      {editing ? <PersonDialog key={editing === 'new' ? 'new' : editing.id} person={editing === 'new' ? null : editing} onClose={() => setEditing(null)} /> : null}
      <GurusSection />
    </div>
  );
}

function PersonDialog({ person, onClose }: { person: PersonDto | null; onClose: () => void }) {
  const { t, tc } = useT();
  const fieldText = useFieldErrorText();
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState(person?.name ?? '');
  const [email, setEmail] = useState(person?.email ?? '');
  const [phone, setPhone] = useState(person?.phone ?? '');
  const [roles, setRoles] = useState<Role[]>(person?.roles ?? ['CANDIDATE']);
  const [locale, setLocale] = useState<Locale>(person?.locale ?? 'en');
  const [active, setActive] = useState(person?.active ?? true);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const save = useMutation({
    mutationFn: () => {
      if (!person) {
        return peopleApi.create({ name: name.trim(), email: email.trim() || undefined, phone: phone.trim() || undefined, roles, locale });
      }
      return peopleApi.update(person.id, {
        name: name.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
        roles,
        locale,
        active,
      });
    },
    onSuccess: () => {
      toast.success(person ? t('people.saved') : t('people.created'));
      void qc.invalidateQueries({ queryKey: PEOPLE_KEY });
      void qc.invalidateQueries({ queryKey: ['mentors'] });
      onClose();
    },
    onError: (e) => {
      if (isApiError(e)) setErrors(Object.fromEntries(e.errors.map((fe) => [fe.path, fieldText(fe)])));
    },
  });

  function submit() {
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = t('people.nameRequired');
    if (roles.length === 0) next.roles = t('people.rolesRequired');
    if (!person) {
      const parsed = createPersonBody.safeParse({ name, email: email.trim() || undefined, phone: phone.trim() || undefined, roles, locale });
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          const key = String(issue.path[0]);
          if (key === 'email' && issue.message === 'EMAIL_OR_PHONE_REQUIRED') next.email = t('people.contactRequired');
          else if (key === 'email') next.email = t('addCandidate.emailInvalid');
        }
      }
    } else if (!email.trim() && !phone.trim()) next.email = t('people.contactRequired');
    setErrors(next);
    if (Object.keys(next).length === 0) save.mutate();
  }

  const toggle = (r: Role, on: boolean) => setRoles((cur) => (on ? [...cur, r] : cur.filter((x) => x !== r)));

  return (
    <Dialog
      open
      onClose={onClose}
      title={person ? t('people.editTitle', { name: person.name }) : t('people.addTitle')}
      footer={
        <>
          <Button onClick={onClose} disabled={save.isPending}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" onClick={submit} loading={save.isPending}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form
        className="stack"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <TextField label={t('people.col.name')} required value={name} maxLength={120} error={errors.name} onChange={(e) => setName(e.target.value)} />
        <TextField label={t('addCandidate.email')} type="email" value={email} error={errors.email} onChange={(e) => setEmail(e.target.value)} />
        <TextField label={t('addCandidate.phone')} type="tel" value={phone} error={errors.phone} onChange={(e) => setPhone(e.target.value)} />
        <fieldset className="stack">
          <legend>{t('people.col.roles')}</legend>
          {ROLES.map((r) => (
            <CheckboxField key={r} label={tc(`role.${r}`)} checked={roles.includes(r)} onChange={(e) => toggle(r, e.target.checked)} />
          ))}
          {errors.roles ? <div className="field-error">{errors.roles}</div> : null}
          <p className="sub">{t('people.mfaNote')}</p>
        </fieldset>
        <SelectField label={t('people.col.language')} value={locale} onChange={(e) => setLocale(e.target.value as Locale)}>
          {LOCALES.map((l) => (
            <option key={l} value={l}>
              {LOCALE_NAMES[l]}
            </option>
          ))}
        </SelectField>
        {person ? <CheckboxField label={t('people.activeLabel')} hint={t('people.activeHint')} checked={active} onChange={(e) => setActive(e.target.checked)} /> : null}
        <FormError error={save.error} />
      </form>
    </Dialog>
  );
}

function GurusSection() {
  const { t } = useT();
  const qc = useQueryClient();
  const toast = useToast();
  const gurus = useQuery({ queryKey: ['gurus'], queryFn: peopleApi.gurus });
  const [name, setName] = useState('');
  const refresh = () => void qc.invalidateQueries({ queryKey: ['gurus'] });
  const add = useMutation({
    mutationFn: () => peopleApi.createGuru(name.trim()),
    onSuccess: () => {
      setName('');
      toast.success(t('gurus.added'));
      refresh();
    },
  });
  const toggle = useMutation({ mutationFn: (g: GuruDto) => peopleApi.updateGuru(g.id, { active: !g.active }), onSuccess: refresh });
  return (
    <section className="card" aria-labelledby="gurus-h">
      <h2 id="gurus-h" className="card-h">
        {t('gurus.title')}
      </h2>
      <div className="pad stack">
        <p className="sub">{t('gurus.lead')}</p>
        <ul className="items">
          {(gurus.data ?? []).map((g) => (
            <li key={g.id} className="item">
              <div className="m item-label">{g.name}</div>
              <Chip tone={g.active ? 'teal' : 'amber'}>{g.active ? t('people.active') : t('people.inactive')}</Chip>
              <Button small onClick={() => toggle.mutate(g)} disabled={toggle.isPending}>
                {g.active ? t('gurus.deactivate') : t('gurus.activate')}
                <span className="sr"> {g.name}</span>
              </Button>
            </li>
          ))}
        </ul>
        <form
          className="row end"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) add.mutate();
          }}
        >
          <TextField label={t('gurus.name')} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} className="grow" />
          <Button type="submit" variant="primary" loading={add.isPending} disabled={!name.trim()}>
            {t('gurus.add')}
          </Button>
        </form>
        <FormError error={add.error ?? toggle.error ?? gurus.error} />
      </div>
    </section>
  );
}
