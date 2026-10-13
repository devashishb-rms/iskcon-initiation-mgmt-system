import { createHmac } from 'node:crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Decode(input: string): Buffer {
  const clean = input.replace(/=+$/, '').replace(/\s+/g, '').toUpperCase();
  let bits = '';
  for (const ch of clean) {
    const v = ALPHABET.indexOf(ch);
    if (v < 0) throw new Error(`Not base32: ${ch}`);
    bits += v.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

/** RFC 6238 time-based code (SHA-1, 30 s, 6 digits), enough to sign in as the president/admin in tests. */
export function totp(secret: string, at: number = Date.now()): string {
  const counter = Math.floor(at / 1000 / 30);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const h = createHmac('sha1', base32Decode(secret)).update(buf).digest();
  const offset = (h[h.length - 1] ?? 0) & 0x0f;
  const bin = (((h[offset] ?? 0) & 0x7f) << 24) | (((h[offset + 1] ?? 0) & 0xff) << 16) | (((h[offset + 2] ?? 0) & 0xff) << 8) | ((h[offset + 3] ?? 0) & 0xff);
  return String(bin % 1_000_000).padStart(6, '0');
}
