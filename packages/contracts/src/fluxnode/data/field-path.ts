// Where a value sits inside a record, for a data step: dotted text such as
// `seller.name` or `items.0.price`, or a list of steps for a key no dotted text can
// spell, such as `["Price (USD)"]`.

import { z } from "zod";

const DOTTED = /^[A-Za-z_$][A-Za-z0-9_$-]*(?:\.(?:[A-Za-z_$][A-Za-z0-9_$-]*|0|[1-9][0-9]*))*$/u;

/** A field path: dotted text, or 1 to 16 steps of keys and indexes. */
export const dataFieldPathSchema = z.union([
  z.string().max(256).regex(DOTTED, 'A field path is dotted names and indexes, such as "seller.name" or "items.0.price"; write a list such as ["Price (USD)"] for other keys.'),
  z.array(z.union([z.string().min(1).max(256), z.number().int().nonnegative()])).min(1).max(16)
]);

export type DataFieldPath = z.infer<typeof dataFieldPathSchema>;

/** The steps of a field path: `"items.0.price"` is `["items", 0, "price"]`. */
export function dataFieldPathSteps(path: DataFieldPath): Array<string | number> {
  if (Array.isArray(path)) return [...path];
  return path.split(".").map((step, index) => (index > 0 && /^(?:0|[1-9][0-9]*)$/u.test(step) ? Number(step) : step));
}
