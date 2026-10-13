/**
 * The name shown to people. It is display text only: it is never part of a storage key or a path.
 */
const MAX_LENGTH = 120;

/* eslint-disable no-control-regex -- removing control characters from names is the purpose of this file */
// C0/C1 controls, zero-width characters, and the bidirectional overrides that make "evil‮fdp.exe" look like a PDF.
const INVISIBLE = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]/g;
// Characters that matter in a path or a header on some system.
const RESERVED = /[<>:"|?*\\/]/g;

/**
 * Multipart parsers hand over file names as Latin-1 text, which turns a UTF-8 name (a Bengali or
 * Hindi file name) into mojibake. If the text round-trips as valid UTF-8 it was UTF-8; otherwise leave it.
 */
export function repairEncoding(raw: string): string {
  if (/[^\u0000-\u00ff]/.test(raw) || !/[\u0080-\u00ff]/.test(raw)) return raw;
  const utf8 = Buffer.from(raw, 'latin1').toString('utf8');
  return utf8.includes('\ufffd') ? raw : utf8;
}

/** Drops any path, control and bidi characters, normalises, caps the length (keeping the extension), never returns empty. */
export function sanitiseFilename(raw: string, fallback = 'document'): string {
  const base = repairEncoding(raw).split(/[\\/]/).pop() ?? '';
  const cleaned = base
    .normalize('NFC')
    .replace(INVISIBLE, '')
    .replace(RESERVED, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .trim();
  const name = cleaned.length ? cleaned : fallback;
  if ([...name].length <= MAX_LENGTH) return name;
  const dot = name.lastIndexOf('.');
  const ext = dot > 0 && name.length - dot <= 10 ? name.slice(dot) : '';
  return [...name.slice(0, name.length - ext.length)].slice(0, MAX_LENGTH - ext.length).join('') + ext;
}

/** Makes the extension agree with what the file really is (a PNG uploaded as "scan.pdf" becomes "scan.png"). */
export function withExtension(filename: string, extension: string): string {
  const dot = filename.lastIndexOf('.');
  const stem = dot > 0 ? filename.slice(0, dot) : filename;
  const current = dot > 0 ? filename.slice(dot + 1).toLowerCase() : '';
  const same = current === extension || (extension === 'jpg' && current === 'jpeg') || (extension === 'heic' && current === 'heif');
  return same ? filename : `${stem}.${extension}`;
}
