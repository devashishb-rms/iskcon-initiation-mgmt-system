import { z } from 'zod';

export const uuid = z.string().uuid();
export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD')
  .refine((v) => {
    const [y, m, d] = v.split('-').map(Number) as [number, number, number];
    const t = new Date(Date.UTC(y, m - 1, d));
    return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
  }, 'Not a real calendar date');
export const isoDateTime = z.string().datetime({ offset: true });

export const pageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
export type PageQuery = z.infer<typeof pageQuery>;

export const pageOf = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    items: z.array(item),
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
  });
export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

/** Text a person typed: trimmed, bounded, and never HTML. */
export const text = (max: number) => z.string().trim().min(1).max(max);
export const optionalText = (max: number) => z.string().trim().max(max).optional();

/** A message the UI translates (same shape as the rules engine's Message). */
export const message = z.object({
  code: z.string(),
  params: z.record(z.union([z.string(), z.number()])).optional(),
});
