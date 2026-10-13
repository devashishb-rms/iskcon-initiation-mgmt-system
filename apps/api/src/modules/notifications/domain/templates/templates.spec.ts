import { LOCALES } from '@iskcon/contracts';
import { ALL_MESSAGE_CODES, MESSAGE_CODES } from '../notification-kinds';
import { renderMessage, templatesFor } from './index';
import { sanitize } from './sanitize';

const PARAMS = {
  candidateName: 'Ananya Sen',
  reason: 'Please complete the essay.',
  by: 'PRESIDENT',
  response: 'ACCEPTED',
  documentType: 'ESSAY',
  date: '2026-10-10',
  count: 3,
  names: 'A, B, C',
  oldestDays: 9,
};

describe('message templates', () => {
  it.each(LOCALES)('renders every message code in %s with a subject, a body and an SMS', (locale) => {
    for (const code of ALL_MESSAGE_CODES) {
      const m = renderMessage(locale, code, PARAMS, null);
      expect(m.subject.trim()).not.toBe('');
      expect(m.body.trim()).not.toBe('');
      expect(m.sms.trim()).not.toBe('');
      expect(`${m.subject}${m.body}${m.sms}`).not.toMatch(/undefined|\[object/);
    }
  });

  it('writes Bengali and Hindi in their own scripts', () => {
    expect(renderMessage('bn', MESSAGE_CODES.fileWaiting, PARAMS, null).subject).toMatch(/[ঀ-৿]/);
    expect(renderMessage('hi', MESSAGE_CODES.fileWaiting, PARAMS, null).subject).toMatch(/[ऀ-ॿ]/);
  });

  it('falls back to English for a locale it does not have', () => {
    expect(templatesFor('ta')).toBe(templatesFor('en'));
    expect(renderMessage('ta', MESSAGE_CODES.fileWaiting, PARAMS, null).subject).toBe('A file is waiting: Ananya Sen');
  });

  it('appends the link to the body only', () => {
    const m = renderMessage('en', MESSAGE_CODES.fileWaiting, PARAMS, 'https://temple.example/queue');
    expect(m.body.endsWith('\n\nhttps://temple.example/queue')).toBe(true);
    expect(m.sms).not.toContain('https://');
  });

  it('leaves the reason out of SMS and out of the candidate\'s decline message', () => {
    expect(renderMessage('en', MESSAGE_CODES.sentBackStaff, PARAMS, null).sms).not.toContain('essay');
    expect(renderMessage('en', MESSAGE_CODES.declinedSelf, PARAMS, null).body).not.toContain('essay');
  });

  it('omits the reason line when a decline has none', () => {
    expect(renderMessage('en', MESSAGE_CODES.declinedStaff, { ...PARAMS, reason: '' }, null).body).not.toContain('Reason');
  });
});

describe('sanitize', () => {
  it('removes line breaks, control characters and angle brackets', () => {
    expect(sanitize('a\r\nBcc: x\u0000<b>y</b> z')).toBe('a Bcc: x by/b z');
  });
  it('bounds the length', () => {
    expect(sanitize('x'.repeat(2000)).length).toBe(500);
  });
  it('accepts numbers', () => {
    expect(sanitize(42)).toBe('42');
  });
});
