// The words a control's target holds, read with no knowledge of any domain: every string
// leaf of it, at any depth and under any key. They are read to compare with the person's
// request and are never stored or shown unless the request holds them too, since a leaf
// may be page text (`fixed-values.ts`). A domain that knows better says so through
// `targetWords` on the card input, and this is only what stands when it does not.
import type { JsonValue } from "../../../core/index.ts";

/** A leaf with no letter or digit, or shaped like a locator or a markup fragment, is no one's words. */
const NOT_WORDS = /^[^\p{L}\p{N}]*$|[#[\]>=/\{}<]/u;
const MAX_DEPTH = 8;

export function partTargetLeavesOf(target: Record<string, unknown>): readonly string[] {
  const found: string[] = [];
  const walk = (value: unknown, depth: number): void => {
    if (typeof value === "string") {
      const text = value.trim();
      if (text && !NOT_WORDS.test(text) && !found.includes(text)) found.push(text);
      return;
    }
    if (depth >= MAX_DEPTH || value === null || typeof value !== "object") return;
    for (const item of Array.isArray(value) ? value : Object.values(value as Record<string, JsonValue>)) walk(item, depth + 1);
  };
  walk(target, 0);
  return found;
}
