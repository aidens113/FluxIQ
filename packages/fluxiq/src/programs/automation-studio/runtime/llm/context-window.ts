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
// what each request carries: the newest results in full, as many as the window
// holds, and for every call whose result no longer fits, a closed one-line
// account of it -- the call, the tool, its result code, whether it changed
// anything. A result leaves whole. It is never cut to fit, because half a page
// reads to a model as a page with half its controls.
//
// Everything the account carries is Core's own bookkeeping or a code a tool
// already returned; none of it is page content, so nothing leaves the window
// by being summarized that the model had not already been shown.

import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS } from "../loop-limits/index.ts";

/** One evidence entry as a decision is shown it. */
export type AutomationStudioLlmEvidenceEntry = { callId: string; toolId: string; value: JsonValue };

/**
 * How a tool call is listed once its result no longer fits in the window.
 * `changed` is whether the call changed what a later look would see: `yes` for
 * an applied action, `no` for an observation or an action that applied
 * nothing, `unknown` for an action that failed part way.
 */
export type AutomationStudioLlmEvidenceCallSummary = {
  resultCode: string;
  changed: "yes" | "no" | "unknown";
};

/**
 * An entry as the loop holds it. `call` is present on the result of a tool
 * call, and absent on Core's own notes -- an answered repeat, a refused
 * decision -- which the model has acted on already and which leave the window
 * without a line.
 */
export type AutomationStudioLlmEvidenceRecord = AutomationStudioLlmEvidenceEntry & { call?: AutomationStudioLlmEvidenceCallSummary };

/** The entry that lists the calls whose results the window no longer carries. */
export const AUTOMATION_STUDIO_LLM_EVIDENCE_HISTORY_TOOL_ID = "core.evidence_history";

const HISTORY_CODE = "llm_evidence_loop.earlier_calls";
const HISTORY_INSTRUCTION = "Calls whose full results are no longer shown, oldest first: each one's result code and whether it changed anything. Request one again only if you still need its result.";

/**
 * The evidence one decision is shown: as many whole entries as `maxBytes`
 * carries, and a line for each tool call left out.
 *
 * Whole entries are chosen as they always were. The newest result of each tool
 * is taken first, then the rest newest first, and an entry that does not fit is
 * skipped rather than ending the walk; they are shown in the order they
 * happened. The newest result of each tool goes first because the decision
 * instruction tells the model evidence entries are the current results of its
 * calls, and a window that dropped one while keeping an older, superseded entry
 * would contradict it: a live build observed its page on the first call, spent
 * two more on smaller things, and wrote the Flow with that page already gone,
 * naming handles that belonged to none of the controls it needed.
 *
 * When anything is left out, the order is: the newest result of each tool,
 * whole, beside the history at its smallest; then a line for every call left
 * out; then older results whole again, newest first, each only where every call
 * still left out keeps its line -- a result shown whole needs no line. A line is
 * a few dozen bytes and a page is thousands, so without that order a run of
 * small older results would fill the window and leave the history a bare count.
 * When there is not room for every line, the most recent are listed and the
 * rest counted. The newest entry is never displaced by the history: when both
 * cannot fit, the history goes. The window is also held to `maxEntries`, the
 * history included: the provider's entry count, less whatever the caller adds
 * beside the window.
 */
export function automationStudioLlmEvidenceContextWindow(records: readonly AutomationStudioLlmEvidenceRecord[], maxBytes: number, maxEntries: number = AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS.maxToolCalls): AutomationStudioLlmEvidenceEntry[] {
  const entries = records.map(({ callId, toolId, value }) => ({ callId, toolId, value }));
  const sizes = entries.map(serializedBytes);
  const { current, older } = priorityOrder(entries);
  const whole = choose([...current, ...older], sizes, maxBytes, maxEntries);
  const calls = records.flatMap((record, index) => record.call ? [index] : []);
  if (!calls.some((index) => !whole.has(index))) return inOrder(entries, whole);
  const reserve = serializedBytes(historyEntry(records, [], calls.length)) + 1;
  const chosen = choose(current, sizes, maxBytes - reserve, maxEntries - 1);
  const newest = entries.length - 1;
  if (!chosen.has(newest) && whole.has(newest)) return inOrder(entries, whole);
  // Bytes of the window without the history, counting the comma each whole
  // entry adds; and of every line still owed, a comma each. Both err high.
  let shownBytes = 2;
  for (const index of chosen) shownBytes += sizes[index]! + 1;
  const lineBytes = new Map(calls.map((index) => [index, serializedBytes(historyLine(records, index)) + 1] as const));
  let owedBytes = 0;
  for (const [index, bytes] of lineBytes) if (!chosen.has(index)) owedBytes += bytes;
  const base = serializedBytes(historyEntry(records, [], 0));
  for (const index of older) {
    if (chosen.size >= maxEntries - 1) break;
    const line = lineBytes.get(index) ?? 0;
    if (shownBytes + sizes[index]! + 1 + base + owedBytes - line > maxBytes) continue;
    chosen.add(index);
    shownBytes += sizes[index]! + 1;
    owedBytes -= line;
  }
  const left = calls.filter((index) => !chosen.has(index));
  if (!left.length) return inOrder(entries, chosen);
  const room = maxBytes - shownBytes;
  let history: AutomationStudioLlmEvidenceEntry | undefined;
  for (let listed = 0; listed <= left.length; listed += 1) {
    const candidate = historyEntry(records, left.slice(left.length - listed), left.length - listed);
    if (serializedBytes(candidate) > room) break;
    history = candidate;
  }
  return history ? [history, ...inOrder(entries, chosen)] : inOrder(entries, chosen);
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

function historyEntry(records: readonly AutomationStudioLlmEvidenceRecord[], listed: readonly number[], unlisted: number): AutomationStudioLlmEvidenceEntry {
  const value: JsonObject = {
    code: HISTORY_CODE,
    calls: listed.map((index) => historyLine(records, index)),
    ...(unlisted > 0 ? { unlisted } : {}),
    instruction: HISTORY_INSTRUCTION
  };
  return { callId: AUTOMATION_STUDIO_LLM_EVIDENCE_HISTORY_TOOL_ID, toolId: AUTOMATION_STUDIO_LLM_EVIDENCE_HISTORY_TOOL_ID, value };
}

/** One left-out call's line: its ids, and the closed account the loop recorded. */
function historyLine(records: readonly AutomationStudioLlmEvidenceRecord[], index: number): JsonObject {
  const { callId, toolId, call } = records[index]!;
  return { callId, toolId, resultCode: call!.resultCode, changed: call!.changed };
}

function inOrder(entries: readonly AutomationStudioLlmEvidenceEntry[], chosen: ReadonlySet<number>): AutomationStudioLlmEvidenceEntry[] {
  return [...chosen].sort((left, right) => left - right).map((index) => entries[index]!);
}

function serializedBytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}
