// The page view a result member holds, read by its shape alone.
//
// A member that is not a page view -- a string, a missing member, lines that
// are not `{ key, text }` -- is not one, and the window leaves it as it came.
// Nothing here reads a text.

import type { JsonValue } from "../../../core/index.ts";
import type { AutomationStudioLlmPageLine } from "./line.ts";
import type { AutomationStudioLlmPageView } from "./view.ts";

/** `value` as a page view, or undefined when its shape is not one. */
export function automationStudioLlmPageViewOf(value: JsonValue | undefined): AutomationStudioLlmPageView | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const { key, lines } = value;
  if (typeof key !== "string" || !Array.isArray(lines)) return undefined;
  const read: AutomationStudioLlmPageLine[] = [];
  for (const line of lines) {
    if (typeof line !== "object" || line === null || Array.isArray(line)) return undefined;
    if (typeof line.key !== "string" || typeof line.text !== "string") return undefined;
    read.push({ key: line.key, text: line.text, ...(line.extra === true ? { extra: true as const } : {}) });
  }
  return { key, lines: read };
}
