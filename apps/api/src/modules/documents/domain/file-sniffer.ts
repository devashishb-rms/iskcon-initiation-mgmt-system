/** What a file really is, decided from its first bytes and never from the name or type the client sent. */
export interface DetectedFile {
  mime: string;
  /** Extension without the dot. */
  extension: string;
}

const startsWith = (b: Buffer, bytes: number[], offset = 0): boolean => b.length >= offset + bytes.length && bytes.every((v, i) => b[offset + i] === v);
const ascii = (b: Buffer, from: number, to: number): string => b.toString('latin1', from, to);

/** `ftyp` brands that mean HEIC/HEIF stills (iPhone photos). */
const HEIC_BRANDS = new Set(['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'hevm', 'hevs']);
const HEIF_BRANDS = new Set(['mif1', 'msf1']);

/** The allow-list: PDF, PNG, JPEG, WebP and HEIC/HEIF. Anything else (executables, archives, HTML, SVG) is `null`. */
export function detectFile(head: Buffer): DetectedFile | null {
  if (startsWith(head, [0x25, 0x50, 0x44, 0x46, 0x2d])) return { mime: 'application/pdf', extension: 'pdf' }; // %PDF-
  if (startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { mime: 'image/png', extension: 'png' };
  if (startsWith(head, [0xff, 0xd8, 0xff])) return { mime: 'image/jpeg', extension: 'jpg' };
  if (ascii(head, 0, 4) === 'RIFF' && ascii(head, 8, 12) === 'WEBP') return { mime: 'image/webp', extension: 'webp' };
  if (ascii(head, 4, 8) === 'ftyp') {
    const brand = ascii(head, 8, 12);
    if (HEIC_BRANDS.has(brand)) return { mime: 'image/heic', extension: 'heic' };
    if (HEIF_BRANDS.has(brand)) return { mime: 'image/heif', extension: 'heif' };
  }
  return null;
}
