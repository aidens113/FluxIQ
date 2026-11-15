import type { ZodTypeAny } from "zod";
import { z } from "zod";

export function appUniqueList<T extends ZodTypeAny>(schema: T, key: (value: z.output<T>) => string, maximum = 128) {
  return z.array(schema).max(maximum).refine(values => new Set(values.map(key)).size === values.length);
}
