import type { ApplicationDetail, SessionResponse } from '@iskcon/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { navItemsFor, titleKeyFor, isActive, NAV_ITEMS, isCandidateOnly } from '@/components/layout/nav';
import { destinationAfterSignIn } from '@/features/auth/LoginForm';
import { missingNames } from '@/features/ceremonies/CeremonyDetailPage';
import { diffFacts, draftFromFacts, visibleFacts, type FactField } from '@/features/application/facts';
import { latestOpenSendBack } from '@/features/application/NotesThread';
import { stepStates } from '@/features/application/StageStepper';
import { inRange } from '@/features/register/RegisterPage';
import { diffParams, draftFromParams, notWholeMonths, paramsFromDraft, sameDraft } from '@/features/rules/params';
import { candidatesApi } from './api/candidates';
import { configureApi } from './api/request';
import { buildCsp, gate } from './csp';
import { daysBetween, formatCalendarDate, formatInstant, isIsoDate, todayIn } from './dates';
import { errorKey, fieldErrorKey } from './error-keys';
import { localeFromCookieHeader, parseLocale, serializeLocaleCookie } from './locale-cookie';
import { notificationHref, safeInternalPath } from './safe-path';

describe('calendar dates', () => {
  it('formats a date by its digits, whatever the machine time zone is', () => {
    expect(formatCalendarDate('2026-03-01', 'en')).toBe('1 Mar 2026');
    expect(formatCalendarDate('2026-12-31', 'en', 'long')).toBe('31 December 2026');
    expect(formatCalendarDate('2026-01-01', 'hi')).toMatch(/1.*2026|१.*२०२६/);
    expect(formatCalendarDate('not a date', 'en')).toBe('not a date');
  });

  it('does not shift the day in a far-west or far-east zone', () => {
    const original = process.env.TZ;
    for (const tz of ['America/Los_Angeles', 'Pacific/Kiritimati']) {
      process.env.TZ = tz;
      expect(formatCalendarDate('2026-03-01', 'en')).toBe('1 Mar 2026');
      expect(daysBetween('2026-03-01', '2026-03-31')).toBe(30);
    }
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  });

  it('formats an instant in the temple time zone', () => {
    expect(formatInstant('2026-10-14T20:00:00.000Z', 'en', 'Asia/Kolkata')).toContain('15 Oct 2026');
    expect(formatInstant('2026-10-14T20:00:00.000Z', 'en', 'UTC', false)).toBe('14 Oct 2026');
    expect(formatInstant('garbage', 'en', 'UTC')).toBe('garbage');
  });

  it('knows an ISO date, counts days across month ends and leap years, and finds today in a zone', () => {
    expect(isIsoDate('2026-02-30')).toBe(true); // shape only; the API validates real dates
    expect(isIsoDate('26-1-1')).toBe(false);
    expect(daysBetween('2024-02-28', '2024-03-01')).toBe(2);
    expect(daysBetween('2026-10-14', '2026-10-07')).toBe(-7);
    expect(todayIn('Asia/Kolkata', new Date('2026-10-14T19:00:00Z'))).toBe('2026-10-15');
    expect(todayIn('UTC', new Date('2026-10-14T19:00:00Z'))).toBe('2026-10-14');
  });
});

describe('safeInternalPath', () => {
  it('keeps in-app paths and drops everything else', () => {
    expect(safeInternalPath('/candidates/abc?tab=notes#x')).toBe('/candidates/abc?tab=notes#x');
    expect(safeInternalPath('https://evil.example/x')).toBeNull();
    expect(safeInternalPath('//evil.example')).toBeNull();
    expect(safeInternalPath('/\\evil.example')).toBeNull();
    expect(safeInternalPath('javascript:alert(1)')).toBeNull();
    expect(safeInternalPath(null)).toBeNull();
    expect(safeInternalPath('')).toBeNull();
  });
});

describe('notificationHref', () => {
  it('points an API file link at this app\'s file page and keeps other in-app links', () => {
    expect(notificationHref('/applications/1f2e-abc')).toBe('/candidates/1f2e-abc');
    expect(notificationHref('/queue')).toBe('/queue');
    expect(notificationHref('/path')).toBe('/path');
    expect(notificationHref('https://evil.example/applications/1')).toBeNull();
    expect(notificationHref(null)).toBeNull();
  });
});

describe('locale cookie', () => {
  it('reads and writes only the three supported languages', () => {
    expect(parseLocale('bn')).toBe('bn');
    expect(parseLocale('fr')).toBeNull();
    expect(localeFromCookieHeader('a=1; lang=hi; sid=zzz')).toBe('hi');
    expect(localeFromCookieHeader('lang=xx')).toBeNull();
    expect(localeFromCookieHeader(undefined)).toBeNull();
    expect(serializeLocaleCookie('bn')).toMatch(/^lang=bn; Path=\/; Max-Age=\d+; SameSite=Lax$/);
  });
});

describe('content security policy and cookie gate', () => {
  it('allows only self and the nonce, and refuses framing', () => {
    const csp = buildCsp('abc123', false);
    expect(csp).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("connect-src 'self'");
    expect(csp).not.toContain('unsafe-eval');
    expect(csp).not.toContain('https:');
    expect(buildCsp('n', true)).toContain("'unsafe-eval'");
  });

  it('sends visitors without a session cookie to sign-in, remembering where they were going', () => {
    expect(gate('/login', false)).toEqual({ action: 'next' });
    expect(gate('/queue', true)).toEqual({ action: 'next' });
    expect(gate('/queue', false)).toEqual({ action: 'redirect', to: '/login?next=%2Fqueue' });
    expect(gate('/', false)).toEqual({ action: 'redirect', to: '/login' });
  });
});

describe('error keys', () => {
  it('prefers the reason variant, then the code, then unknown', () => {
    expect(errorKey('CONFLICT', { reason: 'EXPIRED' })).toBe('error.CONFLICT.EXPIRED');
    expect(errorKey('CONFLICT', { reason: 'SOMETHING_NEW' })).toBe('error.CONFLICT');
    expect(errorKey('NOT_A_REAL_CODE')).toBe('error.UNKNOWN');
    expect(fieldErrorKey('BELOW_FLOOR')).toBe('error.field.BELOW_FLOOR');
    expect(fieldErrorKey('FORBIDDEN')).toBe('error.FORBIDDEN');
    expect(fieldErrorKey('???')).toBe('error.field.INVALID');
  });
});

describe('candidate list query', () => {
  const fetchMock = vi.fn<typeof fetch>();
  let restore: () => void;
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ items: [], page: 1, pageSize: 20, total: 0 }), { status: 200 })));
    restore = configureApi({ fetch: fetchMock });
  });
  afterEach(() => restore());

  it('omits waitingOnMentor unless it is on (the API would read the string "false" as true)', async () => {
    await candidatesApi.list({ page: 1, waitingOnMentor: false });
    expect(fetchMock.mock.calls[0]?.[0]).not.toContain('waitingOnMentor');
    await candidatesApi.list({ page: 1, waitingOnMentor: true });
    expect(fetchMock.mock.calls[1]?.[0]).toContain('waitingOnMentor=true');
  });
});

describe('stage stepper states', () => {
  it('marks done, current and later stages', () => {
    expect(stepStates('PREPARING', 'FIRST').map((s) => s.state)).toEqual(['done', 'done', 'now', 'todo', 'todo', 'todo']);
    expect(stepStates('INITIATED', 'FIRST').map((s) => s.state).at(-1)).toBe('done');
  });

  it('shows Aspiring and Shelter as done earlier for a second initiation', () => {
    expect(stepStates('PREPARING', 'SECOND').map((s) => s.state)).toEqual(['earlier', 'earlier', 'now', 'todo', 'todo', 'todo']);
  });
});

describe('facts form', () => {
  const facts: ApplicationDetail['facts'] = {
    practiceSince: '2025-01-01',
    shelterDate: null,
    examStatus: 'PASSED',
    courseComplete: false,
    firstInitiationDate: null,
    guruChangedOn: null,
    returnedOn: null,
  };

  it('sends only changed fields, null for cleared ones and booleans for the course', () => {
    const draft = { ...draftFromFacts(facts), practiceSince: '', courseComplete: 'true', shelterDate: '2025-06-01' };
    expect(diffFacts(facts, draft, () => true)).toEqual({ practiceSince: null, courseComplete: true, shelterDate: '2025-06-01' });
    expect(diffFacts(facts, draftFromFacts(facts), () => true)).toEqual({});
  });

  it('never sends a field the person may not edit', () => {
    const draft = { ...draftFromFacts(facts), practiceSince: '2024-01-01', shelterDate: '2025-06-01' };
    const mentorOnlyPractice = (f: FactField) => f.editableBy === 'canSetPractice';
    expect(diffFacts(facts, draft, mentorOnlyPractice)).toEqual({ practiceSince: '2024-01-01' });
  });

  it('shows only the fields that apply to the track, and optional ones when set or editable', () => {
    const keys = (track: 'FIRST' | 'SECOND', editable: boolean) => visibleFacts(track, facts, () => editable).map((f) => f.key);
    expect(keys('FIRST', false)).toEqual(['practiceSince', 'shelterDate', 'examStatus', 'courseComplete']);
    expect(keys('SECOND', false)).toEqual(['practiceSince', 'courseComplete', 'firstInitiationDate']);
    expect(keys('FIRST', true)).toContain('guruChangedOn');
  });
});

describe('rule-set drafts', () => {
  const params = {
    practiceMonths: 12, shelterMonths: 6, secondGapMonths: 12, changeGuruMonths: 6, returnGapMonths: 24,
    examRequired: true, courseRequired: true, letterRequired: true, requiredDocuments: ['COURSE_CERTIFICATE' as const],
  };

  it('round-trips a draft and turns a blank or decimal month into a value the server rejects', () => {
    expect(paramsFromDraft(draftFromParams(params))).toEqual(params);
    const d = draftFromParams(params);
    d.numbers.practiceMonths = '';
    d.numbers.shelterMonths = '6.5';
    const out = paramsFromDraft(d);
    expect(out.practiceMonths).toBe(-1);
    expect(out.shelterMonths).toBe(-1);
  });

  it('finds the month fields that are not whole numbers, so the form can say so without calling the API', () => {
    const d = draftFromParams(params);
    expect(notWholeMonths(d)).toEqual([]);
    d.numbers.practiceMonths = '12.5';
    d.numbers.returnGapMonths = ' ';
    d.numbers.shelterMonths = '-3';
    expect(notWholeMonths(d)).toEqual(['practiceMonths', 'shelterMonths', 'returnGapMonths']);
  });

  it('lists what changed between two versions', () => {
    expect(diffParams(params, { ...params, practiceMonths: 18, requiredDocuments: ['COURSE_CERTIFICATE', 'ESSAY'] })).toEqual([
      { field: 'practiceMonths', from: '12', to: '18' },
      { field: 'requiredDocuments', from: 'COURSE_CERTIFICATE', to: 'COURSE_CERTIFICATE, ESSAY' },
    ]);
    expect(diffParams(params, { ...params })).toEqual([]);
    expect(diffParams(null, params).length).toBe(9);
  });

  it('compares drafts regardless of document order', () => {
    const a = draftFromParams({ ...params, requiredDocuments: ['ESSAY', 'OATH'] });
    const b = draftFromParams({ ...params, requiredDocuments: ['OATH', 'ESSAY'] });
    expect(sameDraft(a, b)).toBe(true);
  });
});

describe('register date range', () => {
  it('includes both ends and treats a blank end as open', () => {
    expect(inRange('2026-03-01', '2026-03-01', '2026-03-31')).toBe(true);
    expect(inRange('2026-03-31', '2026-03-01', '2026-03-31')).toBe(true);
    expect(inRange('2026-04-01', '2026-03-01', '2026-03-31')).toBe(false);
    expect(inRange('1999-01-01', '', '')).toBe(true);
    expect(inRange('2026-02-28', '2026-03-01', '')).toBe(false);
  });
});

describe('ceremony helpers', () => {
  const a = (id: string, present: boolean, spiritualName: string | null) =>
    ({ applicationId: id, present, spiritualName }) as Parameters<typeof missingNames>[0][number];

  it('asks for a spiritual name only for people who were present', () => {
    const attendees = [a('1', true, null), a('2', true, 'Gaura Das'), a('3', false, null), a('4', true, null)];
    expect(missingNames(attendees, { '4': '  ' })).toEqual(['1', '4']);
    expect(missingNames(attendees, { '1': 'Nitai Das', '4': 'Hari Das' })).toEqual([]);
  });
});

describe('notes', () => {
  const n = (id: string, kind: string, at: string) => ({ id, kind, createdAt: at }) as Parameters<typeof latestOpenSendBack>[0][number];
  it('shows the send-back until a later readiness note answers it', () => {
    const back = n('b', 'SEND_BACK', '2026-10-01T10:00:00Z');
    expect(latestOpenSendBack([n('m', 'MESSAGE', '2026-10-02T10:00:00Z'), back])?.id).toBe('b');
    expect(latestOpenSendBack([back, n('r', 'READINESS', '2026-10-03T10:00:00Z')])).toBeNull();
    expect(latestOpenSendBack([n('r', 'READINESS', '2026-09-01T10:00:00Z'), back])?.id).toBe('b');
    expect(latestOpenSendBack([])).toBeNull();
  });
});

describe('navigation', () => {
  const grants = (...perms: string[]) => (p: string) => perms.includes(p);

  it('shows each role only what its permissions allow', () => {
    expect(navItemsFor(grants('recommendation:decide', 'candidate:read:any', 'ceremony:read', 'register:read')).map((i) => i.href)).toEqual([
      '/queue', '/candidates', '/ceremonies', '/register',
    ]);
    expect(navItemsFor(grants('candidate:read:assigned')).map((i) => i.href)).toEqual(['/candidates']);
    expect(navItemsFor(grants())).toEqual([]);
    expect(navItemsFor(grants('ruleset:read', 'people:manage', 'audit:read', 'import:run')).map((i) => i.href)).toEqual(['/rules', '/import', '/people', '/audit']);
  });

  it('marks nested routes active and gives each page a title key', () => {
    const candidates = NAV_ITEMS.find((i) => i.href === '/candidates')!;
    expect(isActive(candidates, '/candidates/abc')).toBe(true);
    expect(isActive(candidates, '/ceremonies')).toBe(false);
    expect(titleKeyFor('/ceremonies/123')).toBe('nav.ceremonies');
    expect(titleKeyFor('/path')).toBe('path.tab.path');
    expect(titleKeyFor('/notifications')).toBe('notifications.title');
    expect(titleKeyFor('/nowhere')).toBeNull();
  });

  it('recognises a candidate-only account', () => {
    expect(isCandidateOnly(['CANDIDATE'])).toBe(true);
    expect(isCandidateOnly(['CANDIDATE', 'MENTOR'])).toBe(false);
    expect(isCandidateOnly([])).toBe(false);
  });
});

describe('where to go after sign-in', () => {
  const session = (roles: string[], mfa: { required: boolean; verified: boolean }) =>
    ({ user: { roles }, mfa }) as unknown as SessionResponse;

  it('goes to the second step first, then the role home or a safe next link', () => {
    expect(destinationAfterSignIn(session(['PRESIDENT'], { required: true, verified: false }), '/queue')).toBe('/mfa');
    expect(destinationAfterSignIn(session(['PRESIDENT'], { required: true, verified: true }), null)).toBe('/queue');
    expect(destinationAfterSignIn(session(['CANDIDATE'], { required: false, verified: false }), null)).toBe('/path');
    expect(destinationAfterSignIn(session(['MENTOR'], { required: false, verified: false }), null)).toBe('/candidates');
    expect(destinationAfterSignIn(session(['ADMIN'], { required: true, verified: true }), null)).toBe('/rules');
    expect(destinationAfterSignIn(session(['MENTOR'], { required: false, verified: false }), 'https://evil.example')).toBe('/candidates');
    expect(destinationAfterSignIn(session(['MENTOR'], { required: false, verified: false }), '/candidates/42')).toBe('/candidates/42');
  });
});
