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
// **A read's rows are a view of their own (t194 w48).** Live run 13
// (`run-muqbzu32-8691a65e`) read one list three times, and its last request
// carried all three reads whole: 164,577 of its 290,929 characters. A domain
// may also declare a key as `holder.member` -- the web domain's
// `read.extracted` -- and that member is replaced inside its holder, the same
// way, by the next result whose same holder carries one
// (`./decision-context/view-groups.ts`). Each holder is its own kind of view:
// a click or a page view after a read leaves its rows whole, and only a newer
// read replaces them. The rest of the holder stays -- the domain keeps a short
// account of the read there, its counts and first rows -- and
// `core.recall_result` gives the replaced members back whole on request
// (`./evidence-recall/`); its own earlier answers are replaced by its newer
// one the same way.
//
// A Core note superseded by a newer one of the same kind still leaves the
// evidence (`./decision-context/supersede.ts`); a tool's result never does.

import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import { automationStudioLlmEvidenceViewGroups, type AutomationStudioLlmEvidenceViewGroup } from "./decision-context/index.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_RECALL_TOOL_ID } from "./evidence-recall/index.ts";

/** One evidence entry as a decision is shown it, and as the loop holds it. */
export type AutomationStudioLlmEvidenceEntry = { callId: string; toolId: string; value: JsonValue };

/**
 * The key a result whose view was replaced carries in place of it: the callId
 * of the result that replaced it. Core's own name, explained to the model once
 * in the decision instruction (`./evidence-loop-decision.ts`). A held view's
 * reference sits inside its holder.
 */
export const AUTOMATION_STUDIO_LLM_EVIDENCE_SUPERSEDED_KEY = "supersededBy";

/** A kind of view, and the one tool whose results alone carry it when it is Core's own. */
type ToolViewGroup = AutomationStudioLlmEvidenceViewGroup & { toolId?: string };

/**
 * The evidence one decision is shown: every entry the loop holds, in the order
 * the loop holds them, each whole -- except that in every entry but the newest
 * carrying a view of a kind, that view's keys are replaced by `supersededBy`,
 * naming the next entry that carried a view of the same kind.
 *
 * `observedStateKeys` are the keys of a value that make up a view, as the
 * domain declared them. A plain key is a top-level key of the value, and an
 * entry carries that view when its value is an object holding at least one of
 * them at the top level. `holder.member` is a key of the object the value
 * holds under `holder`; an entry carries that holder's view when the holder is
 * an object holding at least one of its declared members, and the reference
 * then sits inside the holder. Nothing deeper is ever touched. Absent or
 * empty, every entry is whole.
 */
export function automationStudioLlmEvidenceContextWindow(
  records: readonly AutomationStudioLlmEvidenceEntry[],
  observedStateKeys: readonly string[] = []
): AutomationStudioLlmEvidenceEntry[] {
  const window = records.map(({ callId, toolId, value }) => ({ callId, toolId, value }));
  const declared = automationStudioLlmEvidenceViewGroups(observedStateKeys);
  if (!declared.length) return window;
  // Held views first, so the result's own view, replaced last, puts its
  // reference after everything else the result kept.
  // What a recall answers with (`./evidence-recall/binding.ts`) is replaced by
  // the newer answer like any view. Built here, not at load: the barrels this
  // file imports from import it back.
  const recall: ToolViewGroup = { members: ["restored"], toolId: AUTOMATION_STUDIO_LLM_EVIDENCE_RECALL_TOOL_ID };
  const groups: ToolViewGroup[] = [...declared.filter((group) => group.holder !== undefined), recall, ...declared.filter((group) => group.holder === undefined)];
  for (const group of groups) {
    const members = new Set(group.members);
    // From the newest back, so each view knows the one that replaced it.
    let replacedBy: string | undefined;
    for (let index = window.length - 1; index >= 0; index -= 1) {
      const entry = window[index]!;
      if (group.toolId !== undefined && entry.toolId !== group.toolId) continue;
      const holder = holderOf(entry.value, group.holder);
      if (!holder || !Object.keys(holder).some((key) => members.has(key))) continue;
      if (replacedBy !== undefined) entry.value = replaced(entry.value as JsonObject, group.holder, members, replacedBy);
      replacedBy = entry.callId;
    }
  }
  return window;
}

/** The object a group's members sit in: the value itself, or the object it holds under `holder`. */
function holderOf(value: JsonValue, holder: string | undefined): JsonObject | undefined {
  if (!isJsonObject(value)) return undefined;
  if (holder === undefined) return value;
  const held = value[holder];
  return held !== undefined && isJsonObject(held) ? held : undefined;
}

/** The value with the group's members replaced, in its own key order, the holder kept where it stood. */
function replaced(value: JsonObject, holder: string | undefined, members: ReadonlySet<string>, replacedBy: string): JsonObject {
  if (holder === undefined) return withoutView(value, members, replacedBy);
  const out: JsonObject = {};
  for (const [key, member] of Object.entries(value)) out[key] = key === holder ? withoutView(member as JsonObject, members, replacedBy) : member;
  return out;
}

/** The object with its view's keys taken out, in its own key order, and the reference last. */
function withoutView(value: JsonObject, keys: ReadonlySet<string>, replacedBy: string): JsonObject {
  const kept: JsonObject = {};
  for (const [key, member] of Object.entries(value)) if (!keys.has(key)) kept[key] = member;
  kept[AUTOMATION_STUDIO_LLM_EVIDENCE_SUPERSEDED_KEY] = replacedBy;
  return kept;
}

function isJsonObject(value: JsonValue): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
