// The page channel: what each result's page view is shown as, projected over the window's own records (D1, D3, D6, D7).
//
// **Whole once, then changes.** Walking the records in call order, the first
// view of a page key in this window is shown whole; each later view of that key
// is shown as what changed since the last one shown (`./changes.ts`), or as
// unchanged. Lines marked `extra` show in their own delivery and never enter
// the state a later view is compared with. A `core.full_page` capture is shown
// whole and starts that key again from it.
//
// **A projection, not a store.** What a key's state is depends only on earlier
// records of the same window, so the same records always project to the same
// bytes, a new record never changes how an earlier one reads -- except at the
// two rewrites below -- and a window that does not hold a key's earlier views (a
// fresh round's) shows that page whole again. Nothing outlives the run.
//
// **One current copy per key (D7).** When the changes since a key's last whole
// view would outgrow that whole view, the key is shown whole again instead, and
// every earlier copy of that key in the window becomes a short reference to
// the call that now carries it (`{ key, replacedBy }`).
//
// **The page budget per request (D6, user 2026-11-25: "a data limit on pages
// to ensure we dont just send everything on every single request").** The page
// text of every copy the window shows, across all keys, stays within the
// budget. One delivery longer than it is shown up to the budget at a line
// boundary, saying how many lines are left and how to ask for them
// (`core.full_page` with `part`). When a new delivery would take the window
// over, the copies of the least recently delivered other pages become short
// references (`{ key, droppedAt }`), oldest first, until it fits; the page
// being delivered is never dropped, and a dropped page is shown whole when the
// work comes back to it. Changes that would take the current page's own copies
// over the budget are sent as the page whole instead. The budget bounds what one
// request carries; it never ends or resets a round or a run.
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

type Entry = { callId: string; toolId: string; value: JsonValue };

/** `core.recall_result`, written as its name so this module takes no edge into the recall's binding (`./tests/projection.test.ts` holds it to its owner). */
const RECALL_TOOL_ID = "core.recall_result";

/** Told once in a window, on its first delivery of changes. */
const CHANGES_LEGEND = "A line after \"- \" left the page, after \"+ \" arrived, after \"~ \" now reads as shown; each group of changes follows the unchanged line before it, shown after two spaces.";

type Shape = "whole" | "changes";

type Parted = { call: string; shape: Shape; parts: string[][] };

/** What a key's next view is compared with. Gone when the key's copies left the window: its next view is then whole. */
type KeyState = {
  /** The page's lines as last shown, without extra lines. */
  lines: readonly AutomationStudioLlmPageLine[];
  /** Characters of the last whole view, and of the changes shown since it. */
  baseChars: number;
  sinceBase: number;
  /** The call of the delivery a next view is compared with. */
  last: string;
};

/** The copies of one page the window shows -- a page key's, or one recalled page's -- with their page text and when the last arrived. */
type Holder = { key: string; lastAt: number; copies: Array<{ index: number; chars: number }> };

/**
 * Each record with its page member shown as its delivery, in call order. A
 * record without a page view under `channel.member` is returned as it came.
 * The input is never mutated. This is the function an offline replay drives:
 * records in, projected evidence out.
 */
export function automationStudioLlmPageChannelProjection(records: readonly Entry[], channel: AutomationStudioLlmPageChannel): Entry[] {
  const budget = channel.budgetChars !== undefined && Number.isInteger(channel.budgetChars) && channel.budgetChars > 0 ? channel.budgetChars : AUTOMATION_STUDIO_LLM_PAGE_BUDGET_CHARS;
  const member = channel.member;
  const states = new Map<string, KeyState>();
  const parted = new Map<string, Parted>();
  const holders = new Map<string, Holder>();
  const shown = new Map<number, JsonObject>();
  const references = new Map<number, JsonObject>();
  let current: string | undefined;
  let legendTold = false;

  const liveChars = (holder: Holder | undefined): number => (holder ? holder.copies.reduce((sum, copy) => sum + copy.chars, 0) : 0);
  const windowChars = (): number => [...holders.values()].reduce((sum, holder) => sum + liveChars(holder), 0);
  const retire = (id: string, reference: JsonObject): void => {
    for (const copy of holders.get(id)?.copies ?? []) references.set(copy.index, reference);
    holders.delete(id);
    states.delete(id);
  };
  // A new copy, then the window brought back within the budget: other pages' copies leave oldest first; the
  // page just delivered keeps its newest copy, and if its own older copies must go its next view is whole.
  const hold = (id: string, key: string, index: number, chars: number, callId: string): void => {
    const holder = holders.get(id) ?? { key, lastAt: index, copies: [] };
    holder.copies.push({ index, chars });
    holder.lastAt = index;
    holders.set(id, holder);
    while (windowChars() > budget) {
      const oldest = [...holders.entries()].filter(([other]) => other !== id).sort(([, a], [, b]) => a.lastAt - b.lastAt)[0];
      if (oldest) {
        retire(oldest[0], { key: oldest[1].key, droppedAt: callId });
        continue;
      }
      const older = holder.copies.filter((copy) => copy.index !== index);
      if (!older.length) break;
      for (const copy of older) references.set(copy.index, { key, droppedAt: callId });
      holder.copies = holder.copies.filter((copy) => copy.index === index);
      states.delete(id);
    }
  };

  const delivered = (callId: string, key: string, shape: Shape, lines: readonly string[], extra: JsonObject): { page: JsonObject; chars: number } => {
    const parts = automationStudioLlmPageParts(lines, budget);
    if (parts.length > 1) parted.set(key, { call: callId, shape, parts });
    return { page: { key, ...extra, ...partShown(shape, parts, 1, budget) }, chars: joinedLength(parts[0]!) };
  };

  // Shown whole, as the key's new state: its earlier copies point here (D7).
  const whole = (index: number, callId: string, key: string, lines: readonly AutomationStudioLlmPageLine[], comparable: boolean): void => {
    retire(key, { key, replacedBy: callId });
    current = key;
    const { page, chars } = delivered(callId, key, "whole", lines.map((line) => line.text), {});
    shown.set(index, page);
    hold(key, key, index, chars, callId);
    if (!comparable) return;
    const kept = lines.filter((line) => line.extra !== true);
    states.set(key, { lines: kept, baseChars: joinedLength(kept.map((line) => line.text)), sinceBase: 0, last: callId });
  };

  records.forEach((record, index) => {
    const value = record.value;
    if (!isObject(value)) return;
    if (record.toolId === AUTOMATION_STUDIO_LLM_FULL_PAGE_TOOL_ID && value[member] === undefined && typeof value.part === "number") {
      const answer = partAnswer(value.part, current, current === undefined ? undefined : parted.get(current), budget);
      shown.set(index, answer.page);
      if (answer.chars !== undefined && current !== undefined) hold(current, current, index, answer.chars, record.callId);
      return;
    }
    if (record.toolId === RECALL_TOOL_ID && isObject(value.restored)) {
      const recalled = automationStudioLlmPageViewOf(value.restored[member]);
      if (!recalled) return;
      const { page, chars } = recalledShown(recalled.key, recalled.lines.map((line) => line.text), budget);
      shown.set(index, page);
      // Its own holder, so it is let go like any other page and never changes the current page's state.
      hold(`\u0000recalled:${index}`, recalled.key, index, chars, record.callId);
      return;
    }
    const view = automationStudioLlmPageViewOf(value[member]);
    if (!view) return;
    const { key, lines } = view;
    // Keys that do not name one line each cannot be compared: shown whole, and the next view of this page is whole too.
    if (new Set(lines.map((line) => line.key)).size !== lines.length) {
      whole(index, record.callId, key, lines, false);
      return;
    }
    const state = states.get(key);
    if (!state || record.toolId === AUTOMATION_STUDIO_LLM_FULL_PAGE_TOOL_ID) {
      whole(index, record.callId, key, lines, true);
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
      shown.set(index, { key, since, unchanged: true });
      hold(key, key, index, 0, record.callId);
      return;
    }
    const legend: JsonObject = legendTold ? {} : { read: CHANGES_LEGEND };
    legendTold = true;
    const { page, chars } = delivered(record.callId, key, "changes", changes, { since, ...legend });
    shown.set(index, page);
    hold(key, key, index, chars, record.callId);
  });

  return records.map((record, index) => {
    const delivery = references.get(index) ?? shown.get(index);
    if (!delivery || !isObject(record.value)) return record;
    return { callId: record.callId, toolId: record.toolId, value: withMember(record.toolId, record.value, member, delivery) };
  });
}

/** The value with its page shown as `delivery`, every other property where it was. */
function withMember(toolId: string, value: JsonObject, member: string, delivery: JsonObject): JsonObject {
  if (toolId === RECALL_TOOL_ID && isObject(value.restored) && value[member] === undefined) {
    return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, name === "restored" && isObject(item) ? replaced(item, member, delivery) : item]));
  }
  if (toolId === AUTOMATION_STUDIO_LLM_FULL_PAGE_TOOL_ID && value[member] === undefined) return { ...value, [member]: delivery };
  return replaced(value, member, delivery);
}

function replaced(value: JsonObject, member: string, delivery: JsonObject): JsonObject {
  return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, name === member ? delivery : item]));
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

/** A `core.full_page` part request, answered from the current page's latest delivery in parts. Never an ending: a part that does not exist is told so. */
function partAnswer(n: number, key: string | undefined, parted: Parted | undefined, budget: number): { page: JsonObject; chars?: number } {
  const named: JsonObject = key === undefined ? {} : { key };
  if (!parted) {
    return { page: { ...named, missing: `No delivery of the current page was sent in parts. Call ${AUTOMATION_STUDIO_LLM_FULL_PAGE_TOOL_ID} without part for the whole page.` } };
  }
  if (!Number.isInteger(n) || n < 1 || n > parted.parts.length) {
    return { page: { ...named, missing: `There is no part ${n}: the delivery in call ${parted.call} has ${parted.parts.length} parts.` } };
  }
  return { page: { ...named, from: parted.call, ...partShown(parted.shape, parted.parts, n, budget) }, chars: joinedLength(parted.parts[n - 1]!) };
}

/** A page an earlier call ended on, given back by a recall: shown whole up to the budget, and never the current page's state. */
function recalledShown(key: string, lines: readonly string[], budget: number): { page: JsonObject; chars: number } {
  const parts = automationStudioLlmPageParts(lines, budget);
  const left = parts.slice(1).reduce((sum, part) => sum + part.length, 0);
  const rest: JsonObject = left ? { rest: `${left} more lines past the budget of ${budget} characters are not shown here; ${AUTOMATION_STUDIO_LLM_FULL_PAGE_TOOL_ID} gives the current page whole.` } : {};
  return { page: { key, recalled: true, whole: parts[0]!.join("\n"), ...rest }, chars: joinedLength(parts[0]!) };
}

function joinedLength(lines: readonly string[]): number {
  return lines.reduce((sum, line) => sum + line.length, 0) + Math.max(0, lines.length - 1);
}

function isObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
