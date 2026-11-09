// Tells a zod schema from a raw JSON Schema without `instanceof`, so a program whose
// zod is another copy than the SDK's still works.

import type { ZodTypeAny } from "zod";

/** True when `value` is a zod schema: it has a `_def` and a `safeParse` function. */
export function isZodSchema(value: unknown): value is ZodTypeAny {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { _def?: unknown; safeParse?: unknown };
  return typeof candidate._def === "object" && candidate._def !== null && typeof candidate.safeParse === "function";
}
