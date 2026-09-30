// What one evidence decision is shown of everything the loop has gathered.
//
// The loop used to hold the total it gathered to a byte limit as well as each
// request, and Flow creation set that total at 64,000 bytes. A realistic page
// costs 5 to 20 KB, so a build on the realistic sites spent its whole
// allowance on ten to fifteen calls and ended `llm_evidence_loop.evidence_limit`
// before it had written a Flow -- `run-mubpn1ga-8ae8fdc5` at 63,982 bytes after
// fourteen calls, with money, tokens and time left and still learning. That is
// a fixed call count under another name, and the loop's own bound was never
// meant to be one: it iterates while it makes progress, and cost, tokens, the
// deadline and the no-progress guard are what stop it.
//
// What has to stay bounded is a request, and it always was, by the per-request
// evidence context. So the total is now only accounted, and this module decides
// which whole entries each request carries: the newest results, as many as the
// window holds. A result leaves whole. It is never cut to fit, because half a
// page reads to a model as a page with half its controls.
//
// What left the window is not listed here. It used to be, as a line per tool
// call under `core.evidence_history`, and that list named only tool calls:
// every one of Core's answers to a decision -- a refused completion, an
// answered repeat, a refused amendment -- left with no trace. The decision
// history (`./decision-context/`) now sits beside the window and records every
// decision and what Core answered it, so a line here would only say part of the
// same thing twice.

import type { JsonValue } from "../../../../core/index.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS } from "../loop-limits/index.ts";

/** One evidence entry as a decision is shown it, and as the loop holds it. */
export type AutomationStudioLlmEvidenceEntry = { callId: string; toolId: string; value: JsonValue };

/**
 * The evidence one decision is shown: as many whole entries as `maxBytes`
 * carries, and at most `maxEntries` of them.
 *
 * The newest result of each tool is taken first, then the rest newest first,
 * and an entry that does not fit is skipped rather than ending the walk; they
 * are shown in the order they happened. The newest result of each tool goes
 * first because the decision instruction tells the model evidence entries are
 * the current results of its calls, and a window that dropped one while keeping
 * an older, superseded entry would contradict it: a live build observed its
 * page on the first call, spent two more on smaller things, and wrote the Flow
 * with that page already gone, naming handles that belonged to none of the
 * controls it needed. `maxEntries` is the provider's entry count, less whatever
 * the caller adds beside the window.
 */
export function automationStudioLlmEvidenceContextWindow(records: readonly AutomationStudioLlmEvidenceEntry[], maxBytes: number, maxEntries: number = AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS.maxToolCalls): AutomationStudioLlmEvidenceEntry[] {
  const entries = records.map(({ callId, toolId, value }) => ({ callId, toolId, value }));
  const sizes = entries.map(serializedBytes);
  const { current, older } = priorityOrder(entries);
  const chosen = choose([...current, ...older], sizes, maxBytes, maxEntries);
  return [...chosen].sort((left, right) => left - right).map((index) => entries[index]!);
}

/** The newest result of each tool, newest first; and every other entry, newest first. */
function priorityOrder(entries: readonly AutomationStudioLlmEvidenceEntry[]): { current: number[]; older: number[] } {
  const current: number[] = [];
  const older: number[] = [];
  const seen = new Set<string>();
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const { toolId } = entries[index]!;
    if (seen.has(toolId)) older.push(index);
    else {
      seen.add(toolId);
      current.push(index);
    }
  }
  return { current, older };
}

/**
 * The entries that fit, in priority order. `JSON.stringify` of an array is
 * "[", the entries joined by ",", then "]", which is what these bytes count:
 * measured per entry rather than by re-serializing the whole window, so the
 * two cannot disagree on a separator.
 */
function choose(order: readonly number[], sizes: readonly number[], maxBytes: number, maxEntries: number): Set<number> {
  const chosen = new Set<number>();
  let used = 2;
  for (const index of order) {
    if (chosen.size >= maxEntries) break;
    const added = sizes[index]! + (chosen.size ? 1 : 0);
    if (used + added > maxBytes) continue;
    chosen.add(index);
    used += added;
  }
  return chosen;
}

function serializedBytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}
