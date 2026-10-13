import { cellText } from './xlsx-reader';

describe('cellText', () => {
  it('reads values as text', () => {
    expect(cellText('Ananya')).toBe('Ananya');
    expect(cellText(9830011111)).toBe('9830011111');
    expect(cellText(true)).toBe('TRUE');
    expect(cellText(null)).toBe('');
    expect(cellText(undefined)).toBe('');
    expect(cellText(new Date(Date.UTC(2025, 2, 1)))).toBe('2025-03-01');
    expect(cellText({ richText: [{ text: 'রাধা' }, { text: 'রাণী' }] })).toBe('রাধারাণী');
    expect(cellText({ text: 'link text', hyperlink: 'http://x' })).toBe('link text');
  });
  it('gives a formula as its text and never as its result', () => {
    expect(cellText({ formula: '1+1', result: 2 })).toBe('=1+1');
    expect(cellText({ sharedFormula: 'A1', result: 'whatever' })).toBe('=A1');
  });
  it('treats an error value as empty', () => {
    expect(cellText({ error: '#N/A' })).toBe('');
  });
});
