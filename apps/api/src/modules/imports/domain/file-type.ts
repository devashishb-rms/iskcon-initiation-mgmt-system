export type SpreadsheetType = 'csv' | 'xlsx';

const ZIP = [0x50, 0x4b, 0x03, 0x04];
const startsWith = (bytes: Uint8Array, signature: number[]): boolean => signature.every((b, i) => bytes[i] === b);

/** Signatures of files that are certainly not a text table, whatever their name says. */
const BINARY_SIGNATURES: number[][] = [
  [0x25, 0x50, 0x44, 0x46], // %PDF
  [0x89, 0x50, 0x4e, 0x47], // PNG
  [0xff, 0xd8, 0xff], // JPEG
  [0x47, 0x49, 0x46, 0x38], // GIF
  [0xd0, 0xcf, 0x11, 0xe0], // old Office (xls, doc)
  [0x4d, 0x5a], // Windows program
  [0x7f, 0x45, 0x4c, 0x46], // Linux program
  [0xff, 0xfe], // UTF-16 text (not supported)
  [0xfe, 0xff],
];

/**
 * Decides what a file is from its bytes, not from its name. A zip is taken for an xlsx (the reader
 * confirms); anything that is valid UTF-8 text without control characters is a CSV; everything else
 * is refused.
 */
export function detectSpreadsheetType(bytes: Uint8Array): SpreadsheetType | null {
  if (bytes.length === 0) return null;
  if (startsWith(bytes, ZIP)) return 'xlsx';
  if (BINARY_SIGNATURES.some((s) => startsWith(bytes, s))) return null;
  return isPlainUtf8(bytes) ? 'csv' : null;
}

function isPlainUtf8(bytes: Uint8Array): boolean {
  for (const b of bytes) {
    // Tab, line feed and carriage return are text; other control characters mean a binary file.
    if (b < 0x20 && b !== 0x09 && b !== 0x0a && b !== 0x0d) return false;
  }
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

/** Extensions the product accepts; the content decides the parser, the name only has to be sensible. */
export const ALLOWED_EXTENSIONS: readonly string[] = ['.csv', '.xlsx'];

export function hasAllowedExtension(filename: string): boolean {
  const lower = filename.toLowerCase();
  return ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}
