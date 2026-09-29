// The draft a build shows its model, without the keys the bound domain denies.
//
// **The defect.** A wrong-answer repair extends the Flow that ran: its nodes are
// read back as the draft the model amends (`node-tools/draft-from-flow.ts`),
// parameters and all, and the draft travels beside the loop's evidence. A web
// Flow's click, type and keypress steps carry their resolved locator under
// `selector`, which the web domain denies. So the very first decision of the
// repair was refused before any provider was called
// (`run-mulxk0ro-36bf090d`), and the repair ended having done nothing. Run
// `run-mulwm2dc-0bd95f22`'s repair got through only because its Flow happened
// to hold no step with such a key.
//
// **Why withheld here rather than refused.** The denied-key rule exists to keep
// a medium's raw payload and directly executable values away from the model.
// The draft is neither page payload nor something the model supplied: it is the
// Flow's own authored parameters, which Core already says with such values
// withheld wherever a model or a report is shown them. So the shown copy drops
// the denied keys and says that it did; the draft the loop keeps is untouched,
// so a step the model leaves as it is keeps its working locator when the Flow
// is assembled again. Gathered evidence is still refused whole, as before.

import type { JsonValue } from "../../../../../core/index.ts";
import { AUTOMATION_STUDIO_FLOW_DRAFT_TOOL_ID } from "../../flow-draft/index.ts";
import { automationStudioEvidenceKey } from "./failure-evidence.ts";

/** The note a screened draft carries, so the model knows a value exists and is not shown. */
export const AUTOMATION_STUDIO_LLM_DRAFT_WITHHELD_NOTE = "Values under keys the domain does not show to a model are withheld from these steps; a step kept as it is keeps them.";

/**
 * The evidence item as the request carries it: a draft entry with every denied
 * key removed at any depth, and anything else exactly as it was.
 */
export function automationStudioLlmDraftEntryWithoutDeniedKeys<T extends { toolId: string; value: JsonValue }>(item: T, deniedKeys: readonly string[]): T {
  if (item.toolId !== AUTOMATION_STUDIO_FLOW_DRAFT_TOOL_ID || !deniedKeys.length) return item;
  const denied = new Set(deniedKeys.map(automationStudioEvidenceKey));
  const removed = { count: 0 };
  const value = withoutKeys(item.value, denied, removed);
  if (!removed.count) return item;
  const noted = value && typeof value === "object" && !Array.isArray(value) ? { ...value, withheld: AUTOMATION_STUDIO_LLM_DRAFT_WITHHELD_NOTE } : value;
  return { ...item, value: noted };
}

function withoutKeys(value: JsonValue, denied: ReadonlySet<string>, removed: { count: number }): JsonValue {
  if (Array.isArray(value)) return value.map((item) => withoutKeys(item, denied, removed));
  if (!value || typeof value !== "object") return value;
  const out: { [key: string]: JsonValue } = {};
  for (const [key, item] of Object.entries(value)) {
    if (denied.has(automationStudioEvidenceKey(key))) {
      removed.count += 1;
      continue;
    }
    out[key] = withoutKeys(item as JsonValue, denied, removed);
  }
  return out;
}
