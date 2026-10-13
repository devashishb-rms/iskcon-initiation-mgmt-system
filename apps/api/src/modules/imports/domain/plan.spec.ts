import { planRows, type PlanReference } from './plan';

const ref: PlanReference = {
  mentors: [{ id: 'm1', name: 'Mohan Biswas', email: 'mohan@example.org' }],
  gurus: [
    { id: 'g1', name: 'HH Test Swami', active: true },
    { id: 'g2', name: 'HH Retired Swami', active: false },
  ],
  existingEmails: new Set(['here@example.org']),
  existingPhones: new Set(['+919830000001']),
};
const env = { today: '2026-10-14', normalizePhone: (raw: string) => (/^\+?\d{10,12}$/.test(raw) ? (raw.startsWith('+') ? raw : `+91${raw}`) : null) };
const plan = (...rows: Array<Record<string, string>>) => planRows(rows.map((raw, i) => ({ line: i + 2, raw })), ref, env);

describe('planRows', () => {
  it('creates a clean row and resolves its mentor and guru', () => {
    const [row] = plan({ name: 'A', email: 'a@example.org', mentorName: 'mohan@example.org', guruName: 'hh test swami' });
    expect(row).toMatchObject({ status: 'OK', plan: 'CREATE', data: { mentorId: 'm1', guruId: 'g1' } });
  });

  it('turns an unknown or inactive mentor or guru into an error that skips the row', () => {
    const rows = plan({ name: 'A', email: 'a@example.org', mentorName: 'Nobody' }, { name: 'B', email: 'b@example.org', guruName: 'HH Retired Swami' });
    expect(rows.map((r) => [r.status, r.plan, r.data])).toEqual([['ERROR', 'SKIP', undefined], ['ERROR', 'SKIP', undefined]]);
    expect(rows[1]!.messages[0]!.code).toBe('import.guru.inactive');
  });

  it('skips rows that repeat a person who exists, by e-mail or by phone', () => {
    const rows = plan({ name: 'A', email: 'here@example.org' }, { name: 'B', phone: '+919830000001' });
    expect(rows.map((r) => [r.status, r.plan])).toEqual([['WARNING', 'SKIP'], ['WARNING', 'SKIP']]);
    expect(rows[0]!.messages).toEqual([{ code: 'import.duplicate.existing', params: { field: 'email' } }]);
  });

  it('skips the second of two rows for one person, and says which line it repeats', () => {
    const rows = plan({ name: 'A', phone: '9830011111' }, { name: 'A again', phone: '9830011111' }, { name: 'C', email: 'c@example.org' });
    expect(rows.map((r) => r.plan)).toEqual(['CREATE', 'SKIP', 'CREATE']);
    expect(rows[1]!.messages).toEqual([{ code: 'import.duplicate.inFile', params: { field: 'phone', line: 2 } }]);
  });

  it('does not let an invalid row make a later valid row a duplicate', () => {
    const rows = plan({ name: 'A', phone: '9830011111', mentorName: 'Nobody' }, { name: 'A', phone: '9830011111' });
    expect(rows.map((r) => r.plan)).toEqual(['SKIP', 'CREATE']);
  });

  it('treats two rows with no contact as the same person only when name and group match', () => {
    const rows = plan({ name: 'Sita', groupName: 'North' }, { name: 'sita', groupName: 'North' }, { name: 'Sita', groupName: 'South' });
    expect(rows.map((r) => r.plan)).toEqual(['CREATE', 'SKIP', 'CREATE']);
  });

  it('is deterministic and does not touch its input', () => {
    const input = [{ line: 2, raw: { name: 'A', email: 'a@example.org' } }];
    const copy = JSON.stringify(input);
    expect(planRows(input, ref, env)).toEqual(planRows(input, ref, env));
    expect(JSON.stringify(input)).toBe(copy);
  });
});
