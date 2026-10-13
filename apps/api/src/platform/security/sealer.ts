import { Inject, Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env';

/** Encryption and keyed hashing from one application key. */
@Injectable()
export class Sealer {
  private readonly key: Buffer;

  constructor(@Inject(ENV) env: Env) {
    this.key = Buffer.from(env.APP_ENCRYPTION_KEY, 'base64');
  }

  /** AES-256-GCM. Output: base64(iv ‖ tag ‖ ciphertext). */
  seal(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString('base64');
  }

  open(sealed: string): string {
    const raw = Buffer.from(sealed, 'base64');
    const decipher = createDecipheriv('aes-256-gcm', this.key, raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
  }

  /** Keyed hash, so a leaked database cannot be used to brute-force six-digit codes offline. */
  mac(value: string): string {
    return createHmac('sha256', this.key).update(value).digest('hex');
  }

  /** Constant-time comparison of two hex strings. */
  safeEqual(a: string, b: string): boolean {
    const x = Buffer.from(a);
    const y = Buffer.from(b);
    return x.length === y.length && timingSafeEqual(x, y);
  }

  static sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }
}
