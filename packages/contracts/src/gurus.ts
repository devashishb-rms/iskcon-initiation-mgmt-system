import { z } from 'zod';
import { text } from './common';

export const guruDto = z.object({ id: z.string().uuid(), name: z.string(), active: z.boolean() });
export type GuruDto = z.infer<typeof guruDto>;
export const createGuruBody = z.object({ name: text(120) });
export const updateGuruBody = z.object({ name: text(120).optional(), active: z.boolean().optional() });
