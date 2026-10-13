import { nameKey, resolveGuru, resolveMentor } from './references';

const mentors = [
  { id: '1', name: 'Mohan Biswas', email: 'mohan@example.org' },
  { id: '2', name: 'Twin', email: 'a@example.org' },
  { id: '3', name: 'Twin', email: 'b@example.org' },
];

describe('references', () => {
  it('matches a mentor by e-mail or exact name, ignoring case and extra spaces', () => {
    expect(resolveMentor('  MOHAN@example.org ', mentors)).toEqual({ id: '1' });
    expect(resolveMentor('mohan   biswas', mentors)).toEqual({ id: '1' });
  });
  it('refuses a partial name and an ambiguous one', () => {
    expect(resolveMentor('Mohan', mentors)).toMatchObject({ error: { code: 'import.mentor.unknown' } });
    expect(resolveMentor('Twin', mentors)).toMatchObject({ error: { code: 'import.mentor.ambiguous' } });
    expect(resolveMentor('b@example.org', mentors)).toEqual({ id: '3' });
  });
  it('matches a guru by exact name and refuses an inactive one', () => {
    const gurus = [{ id: 'g', name: 'HH Test Swami', active: true }, { id: 'h', name: 'Old', active: false }];
    expect(resolveGuru('HH Test Swami', gurus)).toEqual({ id: 'g' });
    expect(resolveGuru('Old', gurus)).toMatchObject({ error: { code: 'import.guru.inactive' } });
    expect(resolveGuru('Nobody', gurus)).toMatchObject({ error: { code: 'import.guru.unknown' } });
  });
  it('treats a name typed with composed or decomposed Unicode as the same', () => {
    expect(nameKey('क्षि')).toBe(nameKey('क्षि'.normalize('NFD')));
    expect(nameKey('नुता')).toBe(nameKey('नुता'.normalize('NFD')));
  });
});
