import { describe, expect, it } from 'vitest';
import {
  can,
  createCandidateBody,
  decideBody,
  homeFor,
  isoDate,
  needsMfa,
  recordGuruResponseBody,
  ROLE_PERMISSIONS,
  PERMISSIONS,
  saveDraftBody,
  updateFactsBody,
} from '../src';

describe('contracts', () => {
  it('accepts only real calendar dates', () => {
    expect(isoDate.safeParse('2026-02-28').success).toBe(true);
    expect(isoDate.safeParse('2026-02-30').success).toBe(false);
    expect(isoDate.safeParse('11/10/2026').success).toBe(false);
  });

  it('requires a reason to send back or decline, but not to approve', () => {
    expect(decideBody.safeParse({ decision: 'APPROVE' }).success).toBe(true);
    expect(decideBody.safeParse({ decision: 'SEND_BACK' }).success).toBe(false);
    expect(decideBody.safeParse({ decision: 'DECLINE', reason: '  ' }).success).toBe(false);
    expect(decideBody.safeParse({ decision: 'DECLINE', reason: 'Not ready' }).success).toBe(true);
  });

  it('requires a reason unless the guru accepted', () => {
    expect(recordGuruResponseBody.safeParse({ response: 'ACCEPTED' }).success).toBe(true);
    expect(recordGuruResponseBody.safeParse({ response: 'WAIT' }).success).toBe(false);
  });

  it('makes consent mandatory when creating a candidate', () => {
    const base = { name: 'Ananya Sen', phone: '9830012345', consent: { accepted: true as const, version: 'v1' } };
    expect(createCandidateBody.safeParse(base).success).toBe(true);
    expect(createCandidateBody.safeParse({ ...base, consent: { accepted: false, version: 'v1' } }).success).toBe(false);
    expect(createCandidateBody.safeParse({ name: 'No contact', consent: base.consent }).success).toBe(false);
    expect(createCandidateBody.safeParse({ name: 'No contact', createLogin: false, consent: base.consent }).success).toBe(true);
  });

  it('refuses an empty facts update and unknown identity fields are stripped', () => {
    expect(updateFactsBody.safeParse({}).success).toBe(false);
    const parsed = updateFactsBody.safeParse({ practiceSince: '2025-01-01', caste: 'x' });
    expect(parsed.success && 'caste' in parsed.data).toBe(false);
  });

  it('rejects non-integer months in a rule set draft', () => {
    const params = { practiceMonths: 12.5, shelterMonths: 6, secondGapMonths: 12, changeGuruMonths: 6, returnGapMonths: 24, examRequired: true, courseRequired: true, letterRequired: true, requiredDocuments: [] };
    expect(saveDraftBody.safeParse({ params }).success).toBe(false);
  });

  it('keeps role permissions sensible', () => {
    for (const perms of Object.values(ROLE_PERMISSIONS)) for (const p of perms) expect(PERMISSIONS).toContain(p);
    expect(can(['PRESIDENT'], 'recommendation:decide')).toBe(true);
    expect(can(['ADMIN'], 'recommendation:decide')).toBe(false); // only the president recommends
    expect(can(['COMMITTEE'], 'recommendation:decide')).toBe(false);
    expect(can(['CANDIDATE'], 'candidate:read:any')).toBe(false);
    expect(needsMfa(['MENTOR'])).toBe(false);
    expect(needsMfa(['MENTOR', 'ADMIN'])).toBe(true);
    expect(homeFor(['MENTOR', 'PRESIDENT'])).toBe('/queue');
  });
});
