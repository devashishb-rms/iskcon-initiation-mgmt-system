import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

/**
 * All configuration, validated once at start-up. A bad or missing value stops the process with a
 * readable message instead of failing later in the middle of a request.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  DATABASE_URL: z.string().url(),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).default(10),
  RUN_MIGRATIONS_ON_BOOT: bool.default('false'),

  /** 32 random bytes, base64. Seals TOTP secrets and keys OTP hashes. Rotate with care. */
  APP_ENCRYPTION_KEY: z
    .string()
    .refine((v) => Buffer.from(v, 'base64').length === 32, 'must be 32 bytes, base64 encoded'),

  DEFAULT_TENANT_SLUG: z.string().min(1).default('newtown'),

  COOKIE_SECURE: bool.default('false'),
  COOKIE_DOMAIN: z.string().optional(),
  CORS_ORIGIN: z.string().optional(),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).default(12),
  OTP_TTL_MINUTES: z.coerce.number().int().min(1).default(10),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().min(1).default(5),
  OTP_MAX_PER_HOUR: z.coerce.number().int().min(1).default(5),

  /** 'console' logs messages (development, test). 'live' sends real mail and SMS. */
  DELIVERY_MODE: z.enum(['console', 'live']).default('console'),
  SMTP_URL: z.string().optional(),
  MAIL_FROM: z.string().default('Initiation Office <no-reply@example.org>'),
  /** HTTP endpoint of the SMS gateway (POST JSON {to, text}). Empty = SMS disabled. */
  SMS_WEBHOOK_URL: z.string().url().optional(),
  SMS_WEBHOOK_TOKEN: z.string().optional(),

  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_LOCAL_DIR: z.string().default('./storage'),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().default('ap-south-1'),
  S3_ENDPOINT: z.string().optional(),
  S3_FORCE_PATH_STYLE: bool.default('false'),
  /** Server-side encryption for uploads. Default: AES256 on AWS, none when S3_ENDPOINT is set (MinIO without KMS refuses the header). */
  S3_SSE: z.enum(['AES256', 'aws:kms', 'none']).optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  MAX_UPLOAD_MB: z.coerce.number().int().min(1).max(50).default(10),

  OUTBOX_ENABLED: bool.default('true'),
  OUTBOX_POLL_MS: z.coerce.number().int().min(50).default(1000),
  SCHEDULER_ENABLED: bool.default('true'),
  PUBLIC_WEB_URL: z.string().url().default('http://localhost:3000'),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: Record<string, unknown> = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid environment:\n${lines.join('\n')}`);
  }
  return result.data;
}
