// What each condition of a read did, as the host states it on its own call,
// read before it is carried onto the draft step (t693).
//
// A host whose steps keep some of the items they read can say, per condition
// and in the order the step's argument lists them, how many items it kept and
// how many it rejected, and a few of the values it read on the items the step
// kept. Core reads the counts to tell the model a condition narrowed nothing
// (`../llm/repeat-guard/narrowed-nothing.ts`): run `run-mvbr0w7e-6a01c05b`
// resent one such condition six decisions running with nothing telling it so.
//
// **Positional, so read whole or not at all.** An entry that is not exactly
// counts and values withholds the whole account rather than one entry, because
// dropping one would renumber every condition after it. A call is never
// refused for it: the call happened either way.
//
// **The values are page text**, so each passes the screen a control's words
// pass (`./control-words.ts`): plain text, shown in the call's own evidence, cut
// past its bound. A value that fails it is withheld and the rest kept; at most
// `MOST_VALUES` are carried per condition.

import type { JsonValue } from "../../../../core/index.ts";
import { automationStudioFlowDraftControlWords } from "./control-words.ts";
import type { AutomationStudioFlowDraftStepCondition } from "./step.ts";

/** The most values carried per condition: a few, to say what it read, never the list. */
const MOST_VALUES = 3;

/**
 * The account the host stated, or nothing when it stated none or one this
 * cannot read: a list of exactly `kept`, `rejected` and `keptValues` per
 * condition, the counts whole numbers and the values strings.
 */
export function automationStudioFlowDraftConditionAccount(value: unknown, evidence: JsonValue): AutomationStudioFlowDraftStepCondition[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  const account: AutomationStudioFlowDraftStepCondition[] = [];
  for (const entry of value) {
    if (!isRecord(entry) || !Object.keys(entry).every((key) => key === "kept" || key === "rejected" || key === "keptValues")) return undefined;
    if (!isCount(entry.kept) || !isCount(entry.rejected)) return undefined;
    const values = entry.keptValues ?? [];
    if (!Array.isArray(values) || !values.every((item) => typeof item === "string")) return undefined;
    const keptValues = values.flatMap((item) => automationStudioFlowDraftControlWords(item, evidence) ?? []).slice(0, MOST_VALUES);
    account.push({ kept: entry.kept, rejected: entry.rejected, keptValues });
  }
  return account;
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
