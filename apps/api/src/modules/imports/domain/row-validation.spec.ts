import { checkRow, looksLikeFormula, toIsoDate } from './row-validation';

const env = { today: '2026-10-14', normalizePhone: (raw: string) => (/^\+?\d[\d\s]{7,}$/.test(raw) ? `+91${raw.replace(/\D/g, '').slice(-10)}` : null) };
const codes = (r: ReturnType<typeof checkRow>) => r.messages.map((m) => m.code);

describe('toIsoDate', () => {
  it('accepts day-first dates with / - or .', () => {
    expect(toIsoDate('14/03/2025')).toBe('2025-03-14');
    expect(toIsoDate('4-3-2025')).toBe('2025-03-04');
    expect(toIsoDate('01.12.2024')).toBe('2024-12-01');
  });
  it('leaves everything else for the contract to judge', () => {
    expect(toIsoDate('2025-03-14')).toBe('2025-03-14');
    expect(toIsoDate('March 2025')).toBe('March 2025');
  });
});

describe('checkRow', () => {
  it('accepts a complete row and normalises it', () => {
    const r = checkRow({ name: 'Ananya Sen', phone: '98300 11111', email: 'ANANYA@Example.org', track: 'second', shelterDate: '01/03/2025' }, env);
    expect(r.data).toMatchObject({ name: 'Ananya Sen', phone: '+919830011111', email: 'ananya@example.org', track: 'SECOND', shelterDate: '2025-03-01' });
    expect(r.messages).toEqual([]);
  });

  it('defaults the track to FIRST', () => {
    expect(checkRow({ name: 'A', email: 'a@example.org' }, env).data?.track).toBe('FIRST');
  });

  it('reports each kind of error with a stable code', () => {
    expect(codes(checkRow({}, env))).toEqual(['import.name.required']);
    expect(codes(checkRow({ name: 'A', email: 'nope' }, env))).toEqual(['import.email.invalid']);
    expect(codes(checkRow({ name: 'A', phone: 'abc' }, env))).toEqual(['import.phone.invalid']);
    expect(codes(checkRow({ name: 'A', email: 'a@example.org', track: 'THIRD' }, env))).toEqual(['import.track.invalid']);
    expect(codes(checkRow({ name: 'A', email: 'a@example.org', shelterDate: '31/02/2025' }, env))).toEqual(['import.date.invalid']);
    expect(codes(checkRow({ name: 'A', email: 'a@example.org', shelterDate: 'soon' }, env))).toEqual(['import.date.invalid']);
    expect(checkRow({ name: 'x'.repeat(121), email: 'a@example.org' }, env).messages).toEqual([{ code: 'import.field.tooLong', params: { field: 'name', max: 120 } }]);
  });

  it('refuses dates in the future', () => {
    const r = checkRow({ name: 'A', email: 'a@example.org', shelterDate: '2026-10-15' }, env);
    expect(r.messages).toEqual([{ code: 'import.date.future', params: { field: 'shelterDate' } }]);
    expect(r.data).toBeUndefined();
    expect(checkRow({ name: 'A', email: 'a@example.org', shelterDate: '2026-10-14' }, env).data).toBeDefined();
  });

  it('warns, without refusing, when there is no way to contact the person', () => {
    const r = checkRow({ name: 'A' }, env);
    expect(codes(r)).toEqual(['import.contact.missing']);
    expect(r.data).toBeDefined();
  });

  it('warns that the practice date is not applied by the import', () => {
    expect(codes(checkRow({ name: 'A', email: 'a@example.org', practiceSince: '2024-01-10' }, env))).toEqual(['import.practiceSince.notApplied']);
  });

  it('keeps a formula-looking cell as it is and says so', () => {
    const r = checkRow({ name: '=cmd|\' /C calc\'!A0', email: 'a@example.org' }, env);
    expect(r.data?.name).toBe('=cmd|\' /C calc\'!A0');
    expect(r.messages).toEqual([{ code: 'import.cell.formulaLike', params: { field: 'name' } }]);
  });
});

describe('looksLikeFormula', () => {
  it('flags = and @ at the start only', () => {
    expect(['=1+1', '@SUM(A1)'].every(looksLikeFormula)).toBe(true);
    expect(['a=b', '+919830011111', 'Ananya'].some(looksLikeFormula)).toBe(false);
  });
});
