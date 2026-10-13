import { detectSpreadsheetType, hasAllowedExtension } from './file-type';

const bytes = (...b: number[]) => Uint8Array.from(b);
const text = (s: string) => new TextEncoder().encode(s);

describe('detectSpreadsheetType', () => {
  it('recognises a zip as an xlsx and UTF-8 text as a CSV, with or without a byte-order mark', () => {
    expect(detectSpreadsheetType(bytes(0x50, 0x4b, 0x03, 0x04, 0))).toBe('xlsx');
    expect(detectSpreadsheetType(text('name,phone\nA,1\n'))).toBe('csv');
    expect(detectSpreadsheetType(Uint8Array.from([0xef, 0xbb, 0xbf, ...text('নাম,phone\n')]))).toBe('csv');
    expect(detectSpreadsheetType(text('নাম,फ़ोन\r\nরাধা,1\r\n'))).toBe('csv');
  });
  it('refuses empty files, other formats and anything that is not plain UTF-8', () => {
    expect(detectSpreadsheetType(bytes())).toBeNull();
    expect(detectSpreadsheetType(text('%PDF-1.7\n'))).toBeNull();
    expect(detectSpreadsheetType(bytes(0x89, 0x50, 0x4e, 0x47))).toBeNull();
    expect(detectSpreadsheetType(bytes(0xd0, 0xcf, 0x11, 0xe0))).toBeNull();
    expect(detectSpreadsheetType(bytes(0x6e, 0x61, 0x00, 0x6d))).toBeNull();
    expect(detectSpreadsheetType(Buffer.from('Renée', 'latin1'))).toBeNull();
    expect(detectSpreadsheetType(bytes(0xff, 0xfe, 0x6e, 0x00))).toBeNull();
  });
});

describe('hasAllowedExtension', () => {
  it('allows .csv and .xlsx in any case', () => {
    expect(['a.csv', 'A.CSV', 'b.xlsx', 'c.XLSX'].every(hasAllowedExtension)).toBe(true);
    expect(['a.xls', 'a.csv.exe', 'a', 'a.txt', 'a.xlsm'].some(hasAllowedExtension)).toBe(false);
  });
});
