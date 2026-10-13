import { repairEncoding, sanitiseFilename, withExtension } from './filename';

describe('sanitiseFilename', () => {
  it('keeps only the base name', () => {
    expect(sanitiseFilename('../../etc/passwd')).toBe('passwd');
    expect(sanitiseFilename('C:\\Users\\me\\scan.pdf')).toBe('scan.pdf');
    expect(sanitiseFilename('a/b/c.png')).toBe('c.png');
  });

  it('removes control, zero-width and bidi override characters', () => {
    expect(sanitiseFilename('evil\u202Efdp.exe')).toBe('evilfdp.exe');
    expect(sanitiseFilename('a\u0000b\u0007c.pdf')).toBe('abc.pdf');
    expect(sanitiseFilename('x\u200By.pdf')).toBe('xy.pdf');
  });

  it('replaces characters that are special in paths and headers, and leading dots', () => {
    expect(sanitiseFilename('a<b>:c|d?.pdf')).toBe('a_b__c_d_.pdf');
    expect(sanitiseFilename('...hidden.pdf')).toBe('hidden.pdf');
  });

  it('falls back when nothing is left and caps the length keeping the extension', () => {
    expect(sanitiseFilename('///')).toBe('document');
    expect(sanitiseFilename('\u202E\u0000')).toBe('document');
    const long = sanitiseFilename(`${'a'.repeat(500)}.pdf`);
    expect([...long].length).toBe(120);
    expect(long.endsWith('.pdf')).toBe(true);
  });

  it('keeps Bengali and Devanagari names, and repairs Latin-1 mojibake of UTF-8 names', () => {
    expect(sanitiseFilename('শংসাপত্র.pdf')).toBe('শংসাপত্র.pdf');
    const mojibake = Buffer.from('प्रमाणपत्र.pdf', 'utf8').toString('latin1');
    expect(repairEncoding(mojibake)).toBe('प्रमाणपत्र.pdf');
    expect(sanitiseFilename(mojibake)).toBe('प्रमाणपत्र.pdf');
    expect(repairEncoding('café.pdf')).toBe('café.pdf'); // genuine Latin-1 text is not valid UTF-8, so it stays
  });
});

describe('withExtension', () => {
  it('corrects an extension that disagrees with the real type', () => {
    expect(withExtension('scan.pdf', 'png')).toBe('scan.png');
    expect(withExtension('scan', 'pdf')).toBe('scan.pdf');
    expect(withExtension('photo.jpeg', 'jpg')).toBe('photo.jpeg');
    expect(withExtension('Scan.PDF', 'pdf')).toBe('Scan.PDF');
  });
});
