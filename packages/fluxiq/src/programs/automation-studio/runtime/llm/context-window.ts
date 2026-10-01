// What one evidence decision is shown of everything the loop has gathered:
// all of it, in the order it happened, with each view of the target shown whole
// only until a newer view replaces it.
//
// This module used to choose. It held each request to a byte allowance
// (24,000 bytes for Flow creation) and an entry count, kept the newest result
// of each tool first, then filled what was left newest first, and skipped a
// whole entry that did not fit without saying so. A page the model had
// observed early was gone by the decision that wrote the Flow, and nothing
// told it so. The standing decision of 2026-09-30 is that the model is shown
// every entry, with no ranking and no byte or count limit: the only bound on a
// request is the model's context window, and a request over it fails loudly
// before it is sent, with its measured size (`./harness/run.ts`,
// `./deepseek/provider.ts`). Nothing is trimmed to fit.
//
// **A view the target has left is not sent again (B1, 2026-10-01).** Shown
// whole, every page the tab had left rode in every later request: live run
// `run-mup2i28c-6c7fc209` went from 15,722 to 214,853 input tokens in five
// decisions, three whole pages of the same store in the last, and a build of
// thirty steps would pass a 1M-token window near its twenty-second call. So
// the current view is shown whole, and every earlier one is replaced by a
// reference: the rest of that result -- what the step did, what it read, what
// changed, why it was refused -- stays whole, and only the view is not
// repeated. Nothing still on the target is lost, because the current view is
// whole and the model can look again.
//
// Which keys of a result *are* the view is the domain's to say, as it says
// which keys are raw payload (`deniedEvidenceKeys`): Core knows nothing about
// pages. A domain that declares none is shown every entry whole, as before.
//
// **Cache.** A stub names the result that replaced it directly -- the next one
// carrying a view -- and never the newest, so once written it never changes,
// and every request is a byte prefix of the next through its last stub
// (`./deepseek/request-body.ts` orders the rest; `./evidence-loop/tests/request-prefix.test.ts`).
//
// A Core note superseded by a newer one of the same kind still leaves the
// evidence (`./decision-context/supersede.ts`); a tool's result never does.

import type { JsonObject, JsonValue } from "../../../../core/index.ts";

/** One evidence entry as a decision is shown it, and as the loop holds it. */
export type AutomationStudioLlmEvidenceEntry = { callId: string; toolId: string; value: JsonValue };

/**
 * The key a result whose view was replaced carries in place of it: the callId
 * of the result that replaced it. Core's own name, explained to the model once
 * in the decision instruction (`./evidence-loop-decision.ts`).
 */
export const AUTOMATION_STUDIO_LLM_EVIDENCE_SUPERSEDED_KEY = "supersededBy";

/**
 * The evidence one decision is shown: every entry the loop holds, in the order
 * the loop holds them, each whole -- except that in every entry but the newest
 * carrying a view of the target, the view's keys are replaced by
 * `supersededBy`, naming the next entry that carried one.
 *
 * `observedStateKeys` are the top-level keys of a value that make up a view of
 * the target, as the domain declared them. An entry carries a view when its
 * value is an object holding at least one of them at the top level; keys
 * nested deeper are never touched. Absent or empty, every entry is whole.
 */
export function automationStudioLlmEvidenceContextWindow(
  records: readonly AutomationStudioLlmEvidenceEntry[],
  observedStateKeys: readonly string[] = []
): AutomationStudioLlmEvidenceEntry[] {
  const window = records.map(({ callId, toolId, value }) => ({ callId, toolId, value }));
  const keys = new Set(observedStateKeys);
  if (!keys.size) return window;
  // From the newest back, so each view knows the one that replaced it.
  let replacedBy: string | undefined;
  for (let index = window.length - 1; index >= 0; index -= 1) {
    const entry = window[index]!;
    if (!carriesView(entry.value, keys)) continue;
    if (replacedBy !== undefined) entry.value = withoutView(entry.value, keys, replacedBy);
    replacedBy = entry.callId;
  }
  return window;
}

function carriesView(value: JsonValue, keys: ReadonlySet<string>): value is JsonObject {
  return isJsonObject(value) && Object.keys(value).some((key) => keys.has(key));
}

/** The value with its view's keys taken out, in its own key order, and the reference last. */
function withoutView(value: JsonObject, keys: ReadonlySet<string>, replacedBy: string): JsonObject {
  const kept: JsonObject = {};
  for (const [key, member] of Object.entries(value)) if (!keys.has(key)) kept[key] = member;
  kept[AUTOMATION_STUDIO_LLM_EVIDENCE_SUPERSEDED_KEY] = replacedBy;
  return kept;
}

function isJsonObject(value: JsonValue): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
