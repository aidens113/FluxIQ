// The conditions Core's record showed leave out only rows the request does not
// ask for, kept by one gate across its build's trials (t641).
//
// **Why.** A8 wave 14 candidate towels `run-mv9ul5dy-e9a1b1c1`: a revision
// stored exactly the rows asked for and its two judges said no. Core's record
// of that trial showed two of its conditions leaving out, each by itself, only
// rows the request does not ask for: every row one left out was another copy of
// a row in the result, and every row the other left out showed a value Core
// read failing the request's own words. A judge's misread advice got the first
// dropped in the next revision, another misread the second in the one after,
// and no later revision held every clause again. Nothing remembered what
// Core's own record had shown.
//
// **What Core keeps.** Each trial judged no hands its gate Core's record of it
// (`standingNo`, `./types.ts`), whose conditions now carry where they stand
// (`nodeId`, `number`) and, where Core's record accounts for every row one left
// out by itself and there is at least one, those rows (`keptOut`). The gate
// finds each such condition as the revision that ran wrote it
// (`./written-conditions.ts`) and keeps it here, the latest trial's account
// replacing an earlier one. A later trial whose record shows the same written
// condition leaving out a row Core does not account for takes it out again:
// Core holds the build only to what it measured. Whether the trial's no was
// taken does not matter: the record is Core's, not a judge's.
//
// What the gate keeps rides on the result it keeps for each trial
// (`keptConditions`), outside the feedback a model is shown, so the submission
// controller that asks the gate about earlier revisions can hold a revision to
// it (`./kept-condition-drop.ts`).

import { automationStudioResultStandingNoRecordOf } from "./record-shape.ts";
import type { AutomationStudioResultKeptCondition } from "./types.ts";
import { automationStudioResultWrittenCondition, type AutomationStudioResultConditionPlan } from "./written-conditions.ts";

/** The most conditions a gate keeps; the latest are kept. */
const MAX_KEPT = 40;

/** One gate's memory of the conditions Core's record showed keep out only rows the request does not ask for (header). */
export class AutomationStudioResultKeptConditionMemory {
  /** By the condition as written, oldest first. */
  private readonly kept = new Map<string, AutomationStudioResultKeptCondition>();

  /**
   * Reads one trial's record (`standingNo`, any value a port answered; one not
   * of the record's shape is no record) against the plan of the revision that
   * ran (header). Nothing is kept for a condition the plan does not write where
   * the record says it stands.
   */
  remember(trial: { revision: number; standingNo?: unknown; plan?: AutomationStudioResultConditionPlan | undefined }): void {
    const record = automationStudioResultStandingNoRecordOf(trial.standingNo);
    if (!record || !trial.plan) return;
    for (const condition of record.conditions) {
      const written = automationStudioResultWrittenCondition(trial.plan, condition);
      if (written === undefined) continue;
      if (condition.keptOut?.length) {
        this.kept.delete(written);
        this.kept.set(written, { name: condition.name, revision: trial.revision, written, keptOut: structuredClone(condition.keptOut) });
      } else if (condition.leftOutAlone?.length) {
        // It left out, by itself, a row Core's record does not account for (header).
        this.kept.delete(written);
      }
    }
    for (const written of [...this.kept.keys()].slice(0, Math.max(0, this.kept.size - MAX_KEPT))) this.kept.delete(written);
  }

  /** Every condition kept, oldest first, as copies. */
  conditions(): AutomationStudioResultKeptCondition[] {
    return structuredClone([...this.kept.values()]);
  }
}
