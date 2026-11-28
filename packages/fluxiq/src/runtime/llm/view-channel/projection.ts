// The page channel: what each result's page view is shown as, projected over the window's own records (D1, D3, D6, D7).
//
// **Whole once, then changes.** Walking the records in call order, the first
// view of a page key in this window is delivered whole; each later view of that
// key is delivered as what changed since the last one delivered
// (`./changes.ts`), or as unchanged. Lines marked `extra` show in their own
// delivery and never enter the state a later view is compared with. A
// `core.full_page` capture is delivered whole and starts that key again from it.
//
// **Results stay as they were sent; the pages sit in one trailing entry
// (t1080).** Each result's page member becomes a short note of what its delivery
// was -- whole, changes since a call, unchanged -- fixed the moment the record
// is projected, from earlier records alone. The deliveries themselves go in one
// entry after every result, `core.page_window`, which holds the pages as they
// now stand. So appending a record never changes a byte of an earlier one, and
// the request's cached prefix only grows. Up to t1080 the deliveries sat inside
// the results and an earlier copy was rewritten into a reference when it was
// replaced or let go: live run `run-mwytbimp-e0c33977` read results pages 1 and
// 2 of one list (11,762 and 10,202 characters under one key, the budget fitting
// one), each visit rewrote the other's copy, and 10 of its 28 decisions read the
// cache back only to the system prompt and re-wrote everything after it
// (482,628 cache-write tokens in attempt 1).
//
// **A projection, not a store.** What a key's state is depends only on earlier
// records of the same window, so the same records always project to the same
// bytes, and a window that does not hold a key's earlier views (a fresh
// round's) delivers that page whole again. Nothing outlives the run.
//
// **One current copy per key (D7).** When the changes since a key's last whole
// view would outgrow that whole view, the key is delivered whole again instead,
// and the trailing entry drops that key's earlier deliveries: its newest whole
// delivery and the changes after it are what it holds.
//
// **The page budget per request (D6, user 2026-11-25: "a data limit on pages
// to ensure we dont just send everything on every single request").** The page
// text the trailing entry holds, across all keys, stays within the budget. One
// delivery longer than it is shown up to the budget at a line boundary, saying
// how many lines are left and how to ask for them (`core.full_page` with
// `part`). When a new delivery would take the entry over, the deliveries of the
// least recently delivered other pages leave it, oldest first, until it fits,
// and their keys are named under `letGo`; the page being delivered is never let
// go, and a page let go is delivered whole when the work comes back to it.
// Changes that would take the current page's own deliveries over the budget are
// sent as the page whole instead. The budget bounds what one request carries; it
// never ends or resets a round or a run.
//
// Core never parses a page text here: keys and texts are compared for equality
// and measured by length, nothing more.

import type { JsonObject, JsonValue } from "../../../core/index.ts";
import { AUTOMATION_STUDIO_LLM_PAGE_BUDGET_CHARS } from "./budget.ts";
import type { AutomationStudioLlmPageChannel } from "./channel.ts";
import { automationStudioLlmPageChanges } from "./changes.ts";
import type { AutomationStudioLlmPageLine } from "./line.ts";
import { automationStudioLlmPageParts } from "./parts.ts";
import { AUTOMATION_STUDIO_LLM_FULL_PAGE_TOOL_ID } from "./tool-id.ts";
import { automationStudioLlmPageViewOf } from "./view-of.ts";
import { AUTOMATION_STUDIO_LLM_PAGE_WINDOW_TOOL_ID } from "./window-tool-id.ts";

type Entry = { callId: string; toolId: string; value: JsonValue };

/** `core.recall_result`, written as its name so this module takes no edge into the recall's binding (`./tests/projection.test.ts` holds it to its owner). */
const RECALL_TOOL_ID = "core.recall_result";

/** Told in the trailing entry whenever it holds a delivery of changes. */
const CHANGES_LEGEND = "A line after \"- \" left the page, after \"+ \" arrived, after \"~ \" now reads as shown; each group of changes follows the unchanged line before it, shown after two spaces.";

type Shape = "whole" | "changes";

/** A `core.full_page` capture delivered in parts: how many there are, and which the model has been shown (the capture's first, and any it asked for). */
export type AutomationStudioLlmPageSplit = { parts: number; shown: number[] };

type Parted = { call: string; shape: Shape; parts: string[][] };

/** What a key's next view is compared with. Gone when the key's deliveries left the window: its next view is then whole. */
type KeyState = {
  /** The page's lines as last delivered, without extra lines. */
  lines: readonly AutomationStudioLlmPageLine[];
  /** Characters of the last whole view, and of the changes delivered since it. */
  baseChars: number;
  sinceBase: number;
  /** The call of the delivery a next view is compared with. */
  last: string;
};

/** The deliveries of one page the trailing entry holds -- a page key's, or one recalled page's -- with their page text and when the last arrived. */
type Holder = { key: string; recalled: boolean; lastAt: number; copies: Array<{ index: number; chars: number }> };

/**
 * Each record with its page member shown as a short note of its delivery, in
 * call order, and the one trailing entry holding the deliveries the window keeps
 * (`window`, absent when it would hold nothing). A record without a page view
 * under `channel.member` is returned as it came. How a record reads depends only
 * on the records before it, so appending never changes an earlier one. The input
 * is never mutated. This is the function an offline replay drives: records in,
 * projected evidence out.
 */
export function automationStudioLlmPageChannelProjection(records: readonly Entry[], channel: AutomationStudioLlmPageChannel): { history: Entry[]; window?: Entry; split: ReadonlyMap<string, AutomationStudioLlmPageSplit> } {
  const budget = channel.budgetChars !== undefined && Number.isInteger(channel.budgetChars) && channel.budgetChars > 0 ? channel.budgetChars : AUTOMATION_STUDIO_LLM_PAGE_BUDGET_CHARS;
  const member = channel.member;
  const states = new Map<string, KeyState>();
  const parted = new Map<string, Parted>();
  const split = new Map<string, AutomationStudioLlmPageSplit>();
  const holders = new Map<string, Holder>();
  /** Each projected record's note, fixed when it is projected. */
  const notes = new Map<number, JsonObject>();
  /** Each held delivery's page text and what it is, by its record; it leaves when its page is replaced or let go. */
  const deliveries = new Map<number, JsonObject>();
  /** Pages let go for the budget, by key, with the call that let them go; a page held again leaves this. */
  const letGo = new Map<string, string>();
  let current: string | undefined;

  const liveChars = (holder: Holder | undefined): number => (holder ? holder.copies.reduce((sum, copy) => sum + copy.chars, 0) : 0);
  const windowChars = (): number => [...holders.values()].reduce((sum, holder) => sum + liveChars(holder), 0);
  const release = (id: string): void => {
    for (const copy of holders.get(id)?.copies ?? []) deliveries.delete(copy.index);
    holders.delete(id);
    states.delete(id);
  };
  // A new delivery, then the entry brought back within the budget: other pages leave oldest first; the
  // page just delivered keeps its newest delivery, and if its own older ones must go its next view is whole.
  const hold = (id: string, key: string, recalled: boolean, index: number, chars: number, callId: string): void => {
    const holder = holders.get(id) ?? { key, recalled, lastAt: index, copies: [] };
    holder.copies.push({ index, chars });
    holder.lastAt = index;
    holders.set(id, holder);
    while (windowChars() > budget) {
      const oldest = [...holders.entries()].filter(([other]) => other !== id).sort(([, a], [, b]) => a.lastAt - b.lastAt)[0];
      if (oldest) {
        release(oldest[0]);
        if (!oldest[1].recalled) letGo.set(oldest[1].key, callId);
        continue;
      }
      const older = holder.copies.filter((copy) => copy.index !== index);
      if (!older.length) break;
      for (const copy of older) deliveries.delete(copy.index);
      holder.copies = holder.copies.filter((copy) => copy.index === index);
      states.delete(id);
    }
  };

  const delivered = (callId: string, key: string, shape: Shape, lines: readonly string[], extra: JsonObject): { page: JsonObject; chars: number } => {
    const parts = automationStudioLlmPageParts(lines, budget);
    if (parts.length > 1) {
      parted.set(key, { call: callId, shape, parts });
      if (shape === "whole") split.set(callId, { parts: parts.length, shown: [1] });
    }
    return { page: { call: callId, ...extra, ...partShown(shape, parts, 1, budget) }, chars: joinedLength(parts[0]!) };
  };

  // Delivered whole, as the key's new state: its earlier deliveries leave the entry (D7).
  const whole = (index: number, callId: string, key: string, lines: readonly AutomationStudioLlmPageLine[], comparable: boolean, capture = false): void => {
    release(key);
    letGo.delete(key);
    current = key;
    // A full capture puts the page as anyone sees it first and the extra lines (hidden elements, attributes) after, each in page order, so its first part is the visible page.
    const ordered = capture ? [...lines.filter((line) => line.extra !== true), ...lines.filter((line) => line.extra === true)] : lines;
    const { page, chars } = delivered(callId, key, "whole", ordered.map((line) => line.text), {});
    notes.set(index, { key, shown: "whole", in: AUTOMATION_STUDIO_LLM_PAGE_WINDOW_TOOL_ID });
    deliveries.set(index, page);
    hold(key, key, false, index, chars, callId);
    if (!comparable) return;
    const kept = lines.filter((line) => line.extra !== true);
    states.set(key, { lines: kept, baseChars: joinedLength(kept.map((line) => line.text)), sinceBase: 0, last: callId });
  };

  records.forEach((record, index) => {
    const value = record.value;
    if (!isObject(value)) return;
    if (record.toolId === AUTOMATION_STUDIO_LLM_FULL_PAGE_TOOL_ID && value[member] === undefined && typeof value.part === "number") {
      const answer = partAnswer(record.callId, value.part, current, current === undefined ? undefined : parted.get(current), budget);
      notes.set(index, answer.note);
      const asked = answer.page !== undefined && current !== undefined ? parted.get(current) : undefined;
      if (asked && Number.isInteger(value.part)) split.get(asked.call)?.shown.push(value.part as number);
      if (answer.page !== undefined && answer.chars !== undefined && current !== undefined) {
        deliveries.set(index, answer.page);
        hold(current, current, false, index, answer.chars, record.callId);
      }
      return;
    }
    if (record.toolId === RECALL_TOOL_ID && isObject(value.restored)) {
      const recalled = automationStudioLlmPageViewOf(value.restored[member]);
      if (!recalled) return;
      const { page, chars } = recalledShown(record.callId, recalled.lines.map((line) => line.text), budget);
      notes.set(index, { key: recalled.key, recalled: true, shown: "whole", in: AUTOMATION_STUDIO_LLM_PAGE_WINDOW_TOOL_ID });
      deliveries.set(index, page);
      // Its own holder, so it is let go like any other page and never changes the current page's state.
      hold(`\u0000recalled:${index}`, recalled.key, true, index, chars, record.callId);
      return;
    }
    const view = automationStudioLlmPageViewOf(value[member]);
    if (!view) return;
    const { key, lines } = view;
    // Keys that do not name one line each cannot be compared: delivered whole, and the next view of this page is whole too.
    if (new Set(lines.map((line) => line.key)).size !== lines.length) {
      whole(index, record.callId, key, lines, false, record.toolId === AUTOMATION_STUDIO_LLM_FULL_PAGE_TOOL_ID);
      return;
    }
    const state = states.get(key);
    if (!state || record.toolId === AUTOMATION_STUDIO_LLM_FULL_PAGE_TOOL_ID) {
      whole(index, record.callId, key, lines, true, record.toolId === AUTOMATION_STUDIO_LLM_FULL_PAGE_TOOL_ID);
      return;
    }
    const changes = automationStudioLlmPageChanges(state.lines, lines);
    const changeChars = joinedLength(changes);
    if (state.sinceBase + changeChars > state.baseChars || liveChars(holders.get(key)) + changeChars > budget) {
      whole(index, record.callId, key, lines, true);
      return;
    }
    const since = state.last;
    state.lines = lines.filter((line) => line.extra !== true);
    state.sinceBase += changeChars;
    state.last = record.callId;
    current = key;
    if (!changes.length) {
      notes.set(index, { key, since, unchanged: true });
      hold(key, key, false, index, 0, record.callId);
      return;
    }
    const { page, chars } = delivered(record.callId, key, "changes", changes, { since });
    notes.set(index, { key, shown: "changes", since, in: AUTOMATION_STUDIO_LLM_PAGE_WINDOW_TOOL_ID });
    deliveries.set(index, page);
    hold(key, key, false, index, chars, record.callId);
  });

  const history = records.map((record, index) => {
    const note = notes.get(index);
    if (!note || !isObject(record.value)) return record;
    return { callId: record.callId, toolId: record.toolId, value: withMember(record.toolId, record.value, member, note) };
  });
  const window = pageWindow(holders, deliveries, letGo, current);
  return window ? { history, window, split } : { history, split };
}

/**
 * The trailing entry: every held page in the order it was last delivered, so the
 * page the work is on comes last, each with its deliveries in call order; then
 * the pages let go for the budget. Nothing when it would hold nothing.
 */
function pageWindow(holders: ReadonlyMap<string, Holder>, deliveries: ReadonlyMap<number, JsonObject>, letGo: ReadonlyMap<string, string>, current: string | undefined): Entry | undefined {
  const pages: JsonObject[] = [];
  let changes = false;
  for (const [id, holder] of [...holders.entries()].sort(([, a], [, b]) => a.lastAt - b.lastAt)) {
    const shown: JsonObject[] = [];
    for (const copy of holder.copies) {
      const delivery = deliveries.get(copy.index);
      if (delivery) shown.push(delivery);
    }
    if (!shown.length) continue;
    changes ||= shown.some((delivery) => delivery.changes !== undefined);
    pages.push({ key: holder.key, ...(holder.recalled ? { recalled: true } : {}), ...(id === current ? { current: true } : {}), shown });
  }
  const gone = [...letGo.entries()].filter(([key]) => !holders.has(key)).map(([key, at]): JsonObject => ({ key, at }));
  if (!pages.length && !gone.length) return undefined;
  const value: JsonObject = { ...(changes ? { read: CHANGES_LEGEND } : {}), pages, ...(gone.length ? { letGo: gone } : {}) };
  return { callId: AUTOMATION_STUDIO_LLM_PAGE_WINDOW_TOOL_ID, toolId: AUTOMATION_STUDIO_LLM_PAGE_WINDOW_TOOL_ID, value };
}

/** The value with its page shown as `note`, every other property where it was. */
function withMember(toolId: string, value: JsonObject, member: string, note: JsonObject): JsonObject {
  if (toolId === RECALL_TOOL_ID && isObject(value.restored) && value[member] === undefined) {
    return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, name === "restored" && isObject(item) ? replaced(item, member, note) : item]));
  }
  if (toolId === AUTOMATION_STUDIO_LLM_FULL_PAGE_TOOL_ID && value[member] === undefined) return { ...value, [member]: note };
  return replaced(value, member, note);
}

function replaced(value: JsonObject, member: string, note: JsonObject): JsonObject {
  return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, name === member ? note : item]));
}

/** Part `n` of a delivery: its lines, which part it is, and how to ask for the next. */
function partShown(shape: Shape, parts: readonly string[][], n: number, budget: number): JsonObject {
  const text = parts[n - 1]!.join("\n");
  if (parts.length === 1) return { [shape]: text };
  const left = parts.slice(n).reduce((sum, part) => sum + part.length, 0);
  const which = n + 1 === parts.length ? `part ${n + 1}` : `parts ${n + 1} to ${parts.length}`;
  const next: JsonObject = n < parts.length
    ? { rest: `Page text past the budget of ${budget} characters: ${left} more lines in ${which}. Call ${AUTOMATION_STUDIO_LLM_FULL_PAGE_TOOL_ID} with part ${n + 1} for the next.` }
    : {};
  return { part: `${n} of ${parts.length}`, [shape]: text, ...next };
}

/**
 * A `core.full_page` part request, answered from the current page's latest delivery in parts: the note its result
 * carries, and the part itself for the trailing entry. Never an ending: a part that does not exist is told so in
 * the note, and nothing is held.
 */
function partAnswer(callId: string, n: number, key: string | undefined, parted: Parted | undefined, budget: number): { note: JsonObject; page?: JsonObject; chars?: number } {
  const named: JsonObject = key === undefined ? {} : { key };
  if (!parted) {
    return { note: { ...named, missing: `No delivery of the current page was sent in parts. Call ${AUTOMATION_STUDIO_LLM_FULL_PAGE_TOOL_ID} without part for the whole page.` } };
  }
  if (!Number.isInteger(n) || n < 1 || n > parted.parts.length) {
    return { note: { ...named, missing: `There is no part ${n}: the delivery in call ${parted.call} has ${parted.parts.length} parts.` } };
  }
  return {
    note: { ...named, from: parted.call, shown: `part ${n} of ${parted.parts.length}`, in: AUTOMATION_STUDIO_LLM_PAGE_WINDOW_TOOL_ID },
    page: { call: callId, from: parted.call, ...partShown(parted.shape, parted.parts, n, budget) },
    chars: joinedLength(parted.parts[n - 1]!)
  };
}

/** A page an earlier call ended on, given back by a recall: delivered whole up to the budget, and never the current page's state. */
function recalledShown(callId: string, lines: readonly string[], budget: number): { page: JsonObject; chars: number } {
  const parts = automationStudioLlmPageParts(lines, budget);
  const left = parts.slice(1).reduce((sum, part) => sum + part.length, 0);
  const rest: JsonObject = left ? { rest: `${left} more lines past the budget of ${budget} characters are not shown here; ${AUTOMATION_STUDIO_LLM_FULL_PAGE_TOOL_ID} gives the current page whole.` } : {};
  return { page: { call: callId, whole: parts[0]!.join("\n"), ...rest }, chars: joinedLength(parts[0]!) };
}

function joinedLength(lines: readonly string[]): number {
  return lines.reduce((sum, line) => sum + line.length, 0) + Math.max(0, lines.length - 1);
}

function isObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
