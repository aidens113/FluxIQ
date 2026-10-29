import type { JsonValue } from "../../../../../core/index.ts";

/**
 * A list's items as the run summary stores it: a plain list as it is, or the
 * parameter screen's `{ count, items }` where it kept every item (items it
 * withholds are dropped, so `items.length < count` means one was lost);
 * `undefined` for anything else, extra keys included.
 */
export function automationStudioStoredListItems(value: JsonValue | undefined): JsonValue[] | undefined {
  if (Array.isArray(value)) return value;
  if (typeof value !== "object" || value === null) return undefined;
  if (Object.keys(value).some((key) => key !== "count" && key !== "items")) return undefined;
  const items = value.items ?? [];
  return Number.isSafeInteger(value.count) && Array.isArray(items) && items.length === value.count ? items : undefined;
}
