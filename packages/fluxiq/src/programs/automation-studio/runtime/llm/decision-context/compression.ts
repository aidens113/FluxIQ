// Every telling of the history the entry may choose, longest first.
//
// The ladder, each rung tried only once the one before it did not fit:
//
//   1. every row, with its full closed detail;
//   2. the detail reduced to codes and positions;
//   3. plain successful calls -- not refused, answered, failed or repeated --
//      folded into counted ranges, oldest first, one more at a time;
//   4. with every plain call folded, identical refusals that were not
//      consecutive joined into one row carrying all their iterations;
//   5. the least form: every refusal, answer, failure and unusable decision as
//      its iterations, kind and code, and everything else counted.
//
// **A distinct refusal never loses its row.** Only plain calls fold, only
// identical refusals join, and the least form lists every refusal row there
// is. That is the point of the entry: the builds that repeated themselves did
// so because a refusal they had been given was no longer in front of them.
// Like the draft's least entry, the least form is given even over budget,
// because an entry that gave back nothing would read as a build that had not
// been refused anything.
//
// Whatever a rung leaves out, the entry says: `omitted` names what shrinking
// cost, `folded` counts calls folded into ranges, `unlisted` counts decisions
// the least form does not list.

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioLlmDecisionContextRecord } from "./decision.ts";
import { automationStudioLlmDecisionContextClosedCode } from "./closed-code.ts";
import { automationStudioLlmDecisionContextGroup, type AutomationStudioLlmDecisionContextGroup } from "./group.ts";

const HISTORY_CODE = "llm_evidence_loop.decision_history";
const ROW_FORMAT = "decision_rows_v1";
const LEAST_FORMAT = "decision_rows_least_v1";
const ROW_FIELDS = ["at", "kind", "toolId", "actionId", "callId", "code", "changed", "detail", "sameAs"] as const;
const LEAST_FIELDS = ["at", "kind", "code"] as const;
const FOLDED_KIND = "calls";
const DEFAULT_REDIRECT_CODE = "no_progress";

/** At most 350 bytes: what the entry is, and not to resend what it shows refused or answered. */
const INSTRUCTION = "Your own earlier decisions, oldest first, and what Core answered each; at is the iterations it was made at, sameAs the iteration you first made the same decision. Do not resend a decision shown refused or answered unless something has changed since: it gets the same answer. A calls row is at, calls, how many succeeded, how many changed anything.";

type Detail = "full" | "codes";
type Folded = { folded: true; from: number; to: number; count: number; changed: number };
type Item = AutomationStudioLlmDecisionContextGroup | Folded;

/** One telling, and whether it is the least form. */
export type AutomationStudioLlmDecisionContextTelling = { value: JsonObject; least: boolean };

/** Every telling of `records` in ladder order; the last is always the least form. */
export function* automationStudioLlmDecisionContextTellings(records: readonly AutomationStudioLlmDecisionContextRecord[]): Generator<AutomationStudioLlmDecisionContextTelling> {
  const singles = records.flatMap((record) => automationStudioLlmDecisionContextGroup(record) ?? []);
  const redirects = redirectsOf(records);

  yield { value: rowsValue(joinConsecutive(singles, "full"), "full", redirects, []), least: false };

  const byCodes = joinConsecutive(singles, "codes");
  const trimmed = ["detail beyond codes"];
  yield { value: rowsValue(byCodes, "codes", redirects, trimmed), least: false };

  const plain = byCodes.filter(isPlain);
  for (let count = 1; count <= plain.length; count += 1) {
    const folding = new Set(plain.slice(0, count));
    yield { value: rowsValue(fold(byCodes, folding), "codes", redirects, [...trimmed, "plain calls folded"]), least: false };
  }

  const joined = joinIdenticalRefusals(byCodes);
  yield { value: rowsValue(fold(joined, new Set(joined.filter(isPlain))), "codes", redirects, [...trimmed, "plain calls folded", "identical refusals joined"]), least: false };

  yield { value: leastValue(joined, redirects), least: true };
}

/** Consecutive rows that are the same decision answered the same way, as one. */
function joinConsecutive(singles: readonly AutomationStudioLlmDecisionContextGroup[], detail: Detail): AutomationStudioLlmDecisionContextGroup[] {
  const groups: AutomationStudioLlmDecisionContextGroup[] = [];
  for (const single of singles) {
    const last = groups.at(-1);
    if (last && last.identity[detail] === single.identity[detail]) {
      groups[groups.length - 1] = joined(last, single);
      continue;
    }
    groups.push({ ...single, at: [...single.at] });
  }
  return groups;
}

/**
 * Identical refusals wherever they are, as one row at the newest of them: the
 * row then sits where the decision was last made, and lists every time it was.
 */
function joinIdenticalRefusals(groups: readonly AutomationStudioLlmDecisionContextGroup[]): AutomationStudioLlmDecisionContextGroup[] {
  const newest = new Map<string, AutomationStudioLlmDecisionContextGroup>();
  for (const group of groups) {
    if (group.role !== "refusal") continue;
    const seen = newest.get(group.identity.codes);
    newest.set(group.identity.codes, seen ? joined(seen, group) : group);
  }
  const placed = new Set<string>();
  const result: AutomationStudioLlmDecisionContextGroup[] = [];
  for (let index = groups.length - 1; index >= 0; index -= 1) {
    const group = groups[index]!;
    if (group.role !== "refusal") {
      result.push(group);
      continue;
    }
    if (placed.has(group.identity.codes)) continue;
    placed.add(group.identity.codes);
    result.push(newest.get(group.identity.codes)!);
  }
  return result.reverse();
}

function joined(first: AutomationStudioLlmDecisionContextGroup, second: AutomationStudioLlmDecisionContextGroup): AutomationStudioLlmDecisionContextGroup {
  const at = [...new Set([...first.at, ...second.at])].sort((a, b) => a - b);
  const earliest = [first.sameAs, second.sameAs].filter((value): value is number => value !== undefined);
  const sameAs = earliest.length ? Math.min(...earliest) : undefined;
  const { sameAs: _dropped, ...rest } = first;
  return { ...rest, at, ...(sameAs !== undefined && sameAs < at[0]! ? { sameAs } : {}) };
}

function isPlain(group: AutomationStudioLlmDecisionContextGroup): boolean {
  return group.role === "plain" && group.at.length === 1 && group.sameAs === undefined;
}

/** The rows with `folding` replaced by counted ranges, adjacent ones as one range. */
function fold(groups: readonly AutomationStudioLlmDecisionContextGroup[], folding: ReadonlySet<AutomationStudioLlmDecisionContextGroup>): Item[] {
  const items: Item[] = [];
  for (const group of groups) {
    if (!folding.has(group)) {
      items.push(group);
      continue;
    }
    const iteration = group.at[0]!;
    const changed = group.cells.changed === "yes" ? 1 : 0;
    const last = items.at(-1);
    if (last && "folded" in last) {
      items[items.length - 1] = { ...last, to: iteration, count: last.count + 1, changed: last.changed + changed };
      continue;
    }
    items.push({ folded: true, from: iteration, to: iteration, count: 1, changed });
  }
  return items;
}

function rowsValue(items: readonly Item[], detail: Detail, redirects: JsonObject | undefined, omitted: readonly string[]): JsonObject {
  const folded = items.reduce((sum, item) => sum + ("folded" in item ? item.count : 0), 0);
  return {
    code: HISTORY_CODE,
    format: ROW_FORMAT,
    fields: [...ROW_FIELDS],
    rows: items.map((item) => ("folded" in item ? foldedRow(item) : row(item, detail))),
    ...(redirects ? { redirects } : {}),
    ...(folded ? { folded } : {}),
    ...(omitted.length ? { omitted: [...omitted] } : {}),
    instruction: INSTRUCTION
  };
}

function leastValue(groups: readonly AutomationStudioLlmDecisionContextGroup[], redirects: JsonObject | undefined): JsonObject {
  const listed = groups.filter((group) => group.role === "refusal");
  const unlisted = groups.reduce((sum, group) => sum + (group.role === "refusal" ? 0 : group.at.length), 0);
  return {
    code: HISTORY_CODE,
    format: LEAST_FORMAT,
    fields: [...LEAST_FIELDS],
    rows: listed.map((group) => [iterations(group.at), group.kind, group.cells.code]),
    ...(redirects ? { redirects } : {}),
    ...(unlisted ? { unlisted } : {}),
    omitted: ["every decision that was not refused, answered, failed or unusable"],
    instruction: INSTRUCTION
  };
}

/** One row in field order, trailing absent cells left off. */
function row(group: AutomationStudioLlmDecisionContextGroup, detail: Detail): JsonValue[] {
  const shownDetail = group.detail[detail];
  const values: JsonValue[] = [
    iterations(group.at),
    group.kind,
    group.cells.toolId,
    group.cells.actionId,
    group.cells.callId,
    group.cells.code,
    group.cells.changed,
    shownDetail && Object.keys(shownDetail).length ? shownDetail : null,
    group.sameAs ?? null
  ];
  let last = values.length - 1;
  while (last > 1 && values[last] === null) last -= 1;
  return values.slice(0, last + 1);
}

/**
 * A counted range, shorter than the rows it stands for: `at` as "from-to" (a
 * string, so it never reads as exact iterations), then how many calls it
 * folded and how many of them changed anything. The instruction says so,
 * because a range written in the row fields would cost more than the row it
 * replaces.
 */
function foldedRow(item: Folded): JsonValue[] {
  return [item.from === item.to ? String(item.from) : `${item.from}-${item.to}`, FOLDED_KIND, item.count, item.changed];
}

function iterations(at: readonly number[]): JsonValue {
  return at.length === 1 ? at[0]! : [...at];
}

/** The redirects Core gave, by code, each with the iterations it was given at. */
function redirectsOf(records: readonly AutomationStudioLlmDecisionContextRecord[]): JsonObject | undefined {
  const byCode: { [code: string]: number[] } = {};
  for (const record of records) {
    if (record.decision.kind !== "redirect") continue;
    const code = automationStudioLlmDecisionContextClosedCode(record.decision.code) ?? DEFAULT_REDIRECT_CODE;
    (byCode[code] ??= []).push(record.iteration);
  }
  return Object.keys(byCode).length ? byCode : undefined;
}
