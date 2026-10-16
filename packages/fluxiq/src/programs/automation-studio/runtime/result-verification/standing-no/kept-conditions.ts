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
// **What Core keeps.** Each judged trial hands its gate Core's record of it
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
//
// **From any judged trial, not only a no (t652).** A8 frozen pair 5 candidate
// towels `run-mva6mlo8-f519063c`: a correct revision was judged a split (one yes,
// one no), so no record reached its gate, and the next revision dropped a
// condition whose every row left out by itself Core had settled on the
// request's own words. A trial judged unsure carries the record too
// (`../agreement.ts`), and this memory reads it as it reads a no's: the rows
// are Core's measurement, and a label test is never one (t651,
// `../refuted-no/label-tested-condition.ts`).
//
// **And conditions that left rows out only together, kept as one (t666).** A8
// frozen pair 8 candidate towels `run-mvam0lys-2d3eb090`: two name conditions
// each left out no row by themselves, and together kept out a row the request
// does not ask for. A judge advised removing both, since they "alone rejected 0
// rows"; nothing here kept them, the next revision dropped both, and the row
// came back. Core's record now carries each read's sets of conditions that
// left rows out only together (`together`, t655), with those rows where it
// accounts for every one (`keptOut`), as it does for one condition's. Such a
// set is kept as one entry (`members`): no one of its conditions left a row out
// by itself, so dropping one keeps the rows out, and only a plan that writes
// none of them as written brings them back (`./kept-condition-drop.ts`). A
// later record showing the same set, as written, leaving out a row Core does
// not account for takes it out again, as for one condition.

import { automationStudioResultStandingNoRecordOf } from "./record-shape.ts";
import type { AutomationStudioResultKeptCondition, AutomationStudioResultStandingNoRecord, AutomationStudioResultStandingNoTogether } from "./types.ts";
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
    for (const set of record.together ?? []) this.rememberTogether(trial.revision, record, set, trial.plan);
    for (const written of [...this.kept.keys()].slice(0, Math.max(0, this.kept.size - MAX_KEPT))) this.kept.delete(written);
  }

  /** One set of conditions that left rows out only together, kept as one where Core's record accounts for every such row (header, t666). */
  private rememberTogether(revision: number, record: AutomationStudioResultStandingNoRecord, set: AutomationStudioResultStandingNoTogether, plan: AutomationStudioResultConditionPlan): void {
    const members = set.numbers.map((number) => {
      const condition = record.conditions.find((one) => one.nodeId === set.nodeId && one.number === number);
      const written = condition ? automationStudioResultWrittenCondition(plan, condition) : undefined;
      return condition && written !== undefined ? { name: condition.name, written } : undefined;
    });
    if (members.length < 2 || members.some((member) => !member)) return;
    const found = members as Array<{ name: string; written: string }>;
    const key = `[${[...new Set(found.map((member) => member.written))].sort().join(",")}]`;
    this.kept.delete(key);
    if (set.keptOut?.length) {
      this.kept.set(key, { name: found.map((member) => member.name).join(" and "), revision, written: key, keptOut: structuredClone(set.keptOut), members: found });
    }
  }

  /** Every condition kept, oldest first, as copies. */
  conditions(): AutomationStudioResultKeptCondition[] {
    return structuredClone([...this.kept.values()]);
  }
}
