// How the history is told: every row, with its full closed detail.
//
// There used to be a ladder here -- detail cut to codes, plain calls folded
// into counted ranges, identical refusals joined, and a least form that listed
// only refusals -- each rung tried once the one before it did not fit a byte
// allowance. The history now has no allowance (`../context-window.ts`), so it
// is always told in full. Consecutive rows that are the same decision answered
// the same way are still one row carrying every iteration it was made at,
// which drops nothing: the row lists them all.

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioLlmDecisionContextRecord } from "./decision.ts";
import { automationStudioLlmDecisionContextClosedCode } from "./closed-code.ts";
import { automationStudioLlmDecisionContextGroup, type AutomationStudioLlmDecisionContextGroup } from "./group.ts";

const HISTORY_CODE = "llm_evidence_loop.decision_history";
const ROW_FORMAT = "decision_rows_v1";
const ROW_FIELDS = ["at", "kind", "toolId", "actionId", "callId", "code", "changed", "detail", "sameAs"] as const;
const DEFAULT_REDIRECT_CODE = "no_progress";

const INSTRUCTION = "Your own earlier decisions, oldest first, and what Core answered each; at is the iterations it was made at, sameAs the iteration you first made the same decision. Do not resend a decision shown refused or answered unless something has changed since: it gets the same answer.";

/** The history of `records`: every row, in full. */
export function automationStudioLlmDecisionContextHistoryValue(records: readonly AutomationStudioLlmDecisionContextRecord[]): JsonObject {
  const singles = records.flatMap((record) => automationStudioLlmDecisionContextGroup(record) ?? []);
  const redirects = redirectsOf(records);
  return {
    code: HISTORY_CODE,
    format: ROW_FORMAT,
    fields: [...ROW_FIELDS],
    rows: joinConsecutive(singles).map(row),
    ...(redirects ? { redirects } : {}),
    instruction: INSTRUCTION
  };
}

/** Consecutive rows that are the same decision answered the same way, as one. */
function joinConsecutive(singles: readonly AutomationStudioLlmDecisionContextGroup[]): AutomationStudioLlmDecisionContextGroup[] {
  const groups: AutomationStudioLlmDecisionContextGroup[] = [];
  for (const single of singles) {
    const last = groups.at(-1);
    if (last && last.identity.full === single.identity.full) {
      groups[groups.length - 1] = joined(last, single);
      continue;
    }
    groups.push({ ...single, at: [...single.at] });
  }
  return groups;
}

function joined(first: AutomationStudioLlmDecisionContextGroup, second: AutomationStudioLlmDecisionContextGroup): AutomationStudioLlmDecisionContextGroup {
  const at = [...new Set([...first.at, ...second.at])].sort((a, b) => a - b);
  const earliest = [first.sameAs, second.sameAs].filter((value): value is number => value !== undefined);
  const sameAs = earliest.length ? Math.min(...earliest) : undefined;
  const { sameAs: _dropped, ...rest } = first;
  return { ...rest, at, ...(sameAs !== undefined && sameAs < at[0]! ? { sameAs } : {}) };
}

/** One row in field order, trailing absent cells left off. */
function row(group: AutomationStudioLlmDecisionContextGroup): JsonValue[] {
  const shownDetail = group.detail.full;
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
