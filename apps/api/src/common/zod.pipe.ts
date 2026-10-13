import { type PipeTransform } from '@nestjs/common';
import type { ZodTypeAny, z } from 'zod';
import { ValidationFailed } from './errors';

/** Validates and parses a body, query or param with a schema from @iskcon/contracts. */
export class ZodPipe<S extends ZodTypeAny> implements PipeTransform<unknown, z.infer<S>> {
  constructor(private readonly schema: S) {}

  transform(value: unknown): z.infer<S> {
    const result = this.schema.safeParse(value ?? {});
    if (result.success) return result.data;
    throw new ValidationFailed(
      result.error.issues.map((i) => ({
        path: i.path.join('.'),
        code: i.code === 'custom' ? i.message : i.code.toUpperCase(),
        message: i.message,
      })),
    );
  }
}

export const zod = <S extends ZodTypeAny>(schema: S) => new ZodPipe(schema);
