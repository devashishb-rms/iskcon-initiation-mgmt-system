import { buildCorrection, cleanName, hasName } from './register-entry';

describe('register entry rules', () => {
  it('trims names and rejects blank ones', () => {
    expect(cleanName('  Gaura Hari Das ')).toBe('Gaura Hari Das');
    expect(hasName('   ')).toBe(false);
    expect(hasName('গৌর হরি দাস')).toBe(true);
  });

  it('builds a before/after record with the reason', () => {
    expect(buildCorrection({ spiritualName: 'Gour Hari Das' }, ' Gaura Hari Das ', ' Misspelt in the register ')).toEqual({
      before: { spiritualName: 'Gour Hari Das' },
      after: { spiritualName: 'Gaura Hari Das' },
      reason: 'Misspelt in the register',
    });
  });

  it('reports no change when the name is the same', () => {
    expect(buildCorrection({ spiritualName: 'Gaura Hari Das' }, 'Gaura Hari Das ', 'x')).toBeNull();
  });
});
