import { detectFile } from './file-sniffer';

const buf = (...parts: Array<number[] | string>) =>
  Buffer.concat(parts.map((p) => (typeof p === 'string' ? Buffer.from(p, 'latin1') : Buffer.from(p))));

describe('detectFile', () => {
  it('recognises the allowed types from their first bytes', () => {
    expect(detectFile(buf('%PDF-1.7\n'))).toEqual({ mime: 'application/pdf', extension: 'pdf' });
    expect(detectFile(buf([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]))?.mime).toBe('image/png');
    expect(detectFile(buf([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]))?.mime).toBe('image/jpeg');
    expect(detectFile(buf('RIFF', [1, 2, 3, 4], 'WEBPVP8 '))?.mime).toBe('image/webp');
    expect(detectFile(buf([0, 0, 0, 0x18], 'ftypheic', [0, 0, 0, 0]))?.mime).toBe('image/heic');
    expect(detectFile(buf([0, 0, 0, 0x18], 'ftypmif1', [0, 0, 0, 0]))?.mime).toBe('image/heif');
  });

  it.each([
    ['a Windows executable', buf('MZ\x90\x00\x03\x00\x00\x00')],
    ['an ELF binary', buf([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1, 0])],
    ['HTML', buf('<!doctype html><script>alert(1)</script>')],
    ['SVG', buf('<svg xmlns="http://www.w3.org/2000/svg"></svg>')],
    ['a zip', buf('PK\x03\x04')],
    ['an MP4', buf([0, 0, 0, 0x18], 'ftypisom', [0, 0, 0, 0])],
    ['RIFF that is not WebP', buf('RIFF', [1, 2, 3, 4], 'WAVEfmt ')],
    ['an empty file', Buffer.alloc(0)],
    ['PDF text that does not start the file', buf('  %PDF-1.4')],
  ])('refuses %s', (_name, bytes) => {
    expect(detectFile(bytes)).toBeNull();
  });
});
