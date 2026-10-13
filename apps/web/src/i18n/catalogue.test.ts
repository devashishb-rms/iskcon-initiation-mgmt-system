import { ERROR_CODES, documentType, examStatus, STAGES, track } from '@iskcon/contracts';
import { DEFAULT_RULES, evaluate, GBC_FLOOR, RULE_IDS, type ApplicationFacts, type NextStepCode, type RuleParams } from '@iskcon/rules-engine';
import { describe, expect, it } from 'vitest';
import bn from './bn.json';
import en from './en.json';
import hi from './hi.json';
import { catalogues, formatParams, hasMessage, interpolate, resolveCode, translate, translateMessage } from './core';

const keys = (o: object) => Object.keys(o).sort();
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('catalogue completeness', () => {
  it.each([
    ['bn', bn],
    ['hi', hi],
  ])('%s has exactly the keys of en', (_name, cat) => {
    const missing = keys(en).filter((k) => !(k in cat));
    const extra = keys(cat).filter((k) => !(k in en));
    expect({ missing, extra }).toEqual({ missing: [], extra: [] });
  });

  it.each([
    ['bn', bn],
    ['hi', hi],
  ])('%s has no empty message and keeps every {placeholder}', (_name, cat) => {
    const bad: string[] = [];
    for (const [k, v] of Object.entries(cat as Record<string, string>)) {
      if (!v.trim()) bad.push(`${k}: empty`);
      const want = placeholders((en as Record<string, string>)[k] ?? '');
      if (JSON.stringify(placeholders(v)) !== JSON.stringify(want)) bad.push(`${k}: placeholders ${placeholders(v)} vs ${want}`);
    }
    expect(bad).toEqual([]);
  });

  it('bn and hi are real translations, not copies of English', () => {
    const same = (cat: Record<string, string>) =>
      keys(en).filter((k) => cat[k] === (en as Record<string, string>)[k] && /[a-z]{4,}/i.test((cat[k] ?? '').replace(/\{\w+\}/g, '')) && k !== 'import.template');
    expect(same(bn)).toEqual([]);
    expect(same(hi)).toEqual([]);
  });
});

describe('every code the system can send has an English message', () => {
  const missing = (codes: string[]) => codes.filter((c) => !hasMessage(c));

  it('API error codes', () => {
    expect(missing([...ERROR_CODES, 'NETWORK_ERROR', 'RESPONSE_INVALID', 'UNKNOWN'].map((c) => `error.${c}`))).toEqual([]);
  });

  it('field error codes the API sends', () => {
    const codes = [
      'INVALID', 'BELOW_FLOOR', 'NOT_WHOLE_MONTHS', 'CANNOT_DISABLE', 'EMAIL_OR_PHONE_REQUIRED', 'LOGIN_NEEDS_CONTACT',
      'NOTHING_TO_UPDATE', 'RULE_NOT_EXCEPTABLE', 'FILE_REQUIRED', 'SPIRITUAL_NAME_REQUIRED', 'NOBODY_PRESENT', 'DATE_IN_FUTURE',
      'ATTENDEE_NOT_RECOMMENDED', 'MISSING_COLUMN', 'NO_ROWS', 'TOO_MANY_ROWS',
    ];
    expect(missing(codes.map((c) => `error.field.${c}`))).toEqual([]);
  });

  it('every next-step code', () => {
    const all: Record<NextStepCode, true> = {
      UPLOAD_COURSE_CERTIFICATE: true, COMPLETE_COURSE: true, PASS_EXAM: true, MENTOR_CONFIRM_PRACTICE: true,
      RECORD_SHELTER_DATE: true, RECORD_FIRST_INITIATION: true, WAIT_UNTIL: true, RECORD_FACT: true, READY_FOR_REVIEW: true,
    };
    expect(missing(Object.keys(all).map((c) => `nextStep.${c}`))).toEqual([]);
  });

  it('every rule label and detail code the engine can produce', () => {
    const base: RuleParams = { ...GBC_FLOOR, requiredDocuments: [] };
    const dates = [null, '2020-01-01', '2026-06-01', '2026-10-01'];
    const codes = new Set<string>();
    const add = (m: { code: string }) => codes.add(m.code);
    for (const trackValue of track.options) {
      for (const practiceSince of dates) for (const shelterDate of dates) for (const firstInitiationDate of dates) {
        for (const examStatusValue of [null, ...examStatus.options]) for (const courseComplete of [null, true, false]) {
          for (const docs of [[], ['COURSE_CERTIFICATE' as const]]) for (const approved of [false, true]) {
            for (const extra of [null, '2020-01-01', '2026-10-01']) {
              const facts: ApplicationFacts = {
                track: trackValue, practiceSince, shelterDate, firstInitiationDate, examStatus: examStatusValue,
                courseComplete, guruChangedOn: extra, returnedOn: extra,
              };
              const ev = evaluate(facts, base, { documents: docs, exceptions: [{ ruleId: 'R-1', reason: 'x' }], approved, today: '2026-10-14' });
              for (const item of ev.items) { add(item.label); add(item.detail); }
            }
          }
        }
      }
    }
    expect(DEFAULT_RULES.length).toBe(RULE_IDS.length);
    expect(codes.size).toBeGreaterThan(20);
    expect(missing([...codes])).toEqual([]);
  });

  it('stages, tracks, documents, statuses, sources, roles', () => {
    const list = [
      ...STAGES.map((s) => `stage.${s}`),
      ...track.options.map((t) => `track.${t}`),
      ...documentType.options.map((d) => `docType.${d}`),
      ...examStatus.options.map((e) => `examStatus.${e}`),
      ...['MET', 'UNKNOWN', 'NOT_MET', 'LATER', 'EXCEPTION'].map((s) => `status.${s}`),
      ...['MENTOR_CONFIRMATION', 'TEMPLE_RECORD', 'REGISTER', 'UPLOADED_CERTIFICATE', 'RECOMMENDATION_RECORD', 'COMMITTEE_EXCEPTION'].map((s) => `source.${s}`),
      ...['CANDIDATE', 'MENTOR', 'PRESIDENT', 'COMMITTEE', 'ADMIN'].map((r) => `role.${r}`),
    ];
    expect(missing(list)).toEqual([]);
  });

  it('notification codes', () => {
    const codes = [
      'welcome', 'mentorAssigned', 'fileWaiting', 'sentBack.staff', 'sentBack.self', 'approved.staff', 'approved.self',
      'declined.staff', 'declined.self', 'guruResponse.staff', 'guruResponse.self', 'documentUploaded',
      'ceremonyCompleted.staff', 'ceremonyCompleted.self', 'monthlyNoteDue', 'filesWaiting',
    ];
    expect(missing(codes.map((c) => `notification.${c}`))).toEqual([]);
  });

  it('import row message codes and column names', () => {
    const codes = [
      'name.required', 'email.invalid', 'phone.invalid', 'date.invalid', 'date.future', 'track.invalid', 'field.tooLong',
      'field.invalid', 'mentor.unknown', 'mentor.ambiguous', 'guru.unknown', 'guru.inactive', 'duplicate.existing',
      'duplicate.inFile', 'contact.missing', 'cell.formulaLike', 'practiceSince.notApplied', 'row.failed',
      'field.name', 'field.phone', 'field.email', 'field.groupName', 'field.mentorName', 'field.guruName', 'field.track',
      'field.shelterDate', 'field.practiceSince',
    ];
    expect(missing(codes.map((c) => `import.${c}`))).toEqual([]);
  });

  it('timeline codes', () => {
    const codes = [
      'stage', 'stage.start', 'facts', 'note.monthly', 'note.readiness', 'note.message', 'note.send_back', 'document.uploaded',
      'document.removed', 'exception.recorded', 'exception.removed', 'recommendation.approve', 'recommendation.send_back',
      'recommendation.decline', 'guruResponse.accepted', 'guruResponse.wait', 'guruResponse.declined', 'package.exported', 'register',
    ];
    expect(missing(codes.map((c) => `timeline.${c}`))).toEqual([]);
  });
});

describe('interpolate and translate', () => {
  it('replaces {name} and leaves unknown names visible', () => {
    expect(interpolate('Hello {name}, {x}', { name: 'Ananya' })).toBe('Hello Ananya, {x}');
  });

  it('falls back to English, then to a readable form of the code', () => {
    expect(translate('bn', 'login.signIn')).toBe(bn['login.signIn']);
    const original = catalogues.bn['login.signIn'];
    try {
      (catalogues.bn as Record<string, string>)['login.signIn'] = undefined as unknown as string;
      expect(translate('bn', 'login.signIn')).toBe(en['login.signIn']);
    } finally {
      (catalogues.bn as Record<string, string>)['login.signIn'] = original as string;
    }
    expect(translate('en', 'some.new.thingHappened')).toBe('thing happened');
  });
});

describe('server messages', () => {
  it('formats ISO dates for the locale without shifting the day', () => {
    const out = formatParams('en', { since: '2025-03-01', dueOn: '2026-03-01', months: 12 });
    expect(out).toEqual({ since: '1 Mar 2025', dueOn: '1 Mar 2026', months: 12 });
  });

  it('translates stage and document parameters', () => {
    expect(translateMessage('en', { code: 'timeline.stage', params: { from: 'SHELTER', to: 'PREPARING' } })).toBe('Moved from Shelter to Preparing');
    expect(translateMessage('hi', { code: 'timeline.stage', params: { from: 'SHELTER', to: 'PREPARING' } })).toContain(hi['stage.SHELTER']);
  });

  it('uses the "opened" wording when there is no from stage, and the reason wording when there is a reason', () => {
    expect(resolveCode('timeline.stage', { to: 'ASPIRING' })).toBe('timeline.stage.start');
    expect(resolveCode('notification.sentBack.staff', { reason: 'x' })).toBe('notification.sentBack.staff.withReason');
    expect(resolveCode('notification.welcome', { reason: 'x' })).toBe('notification.welcome');
  });

  it('shows the exception reason from a checklist detail', () => {
    expect(translateMessage('en', { code: 'common.exceptionRecorded', params: { reason: 'Approved by the guru' } })).toContain('Approved by the guru');
  });
});
