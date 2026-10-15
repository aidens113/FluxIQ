// What one gate keeps of its build's standing nos across its trials (t633,
// `./index.ts`): the subflow trial gate per brief, the candidate trial gate
// per build. Each trial judged no hands its record here (`standingNo`, carried
// on the trial's result outside its feedback); a no the build's own record
// contradicts (`./contradiction.ts`) is answered so, and is not kept; any other
// that upheld rows of a kind is kept for the trials after it.

import { automationStudioResultStandingNoContradicted } from "./contradiction.ts";
import { automationStudioResultStandingNoRecordOf as recordOf } from "./record-shape.ts";
import type { AutomationStudioResultStandingNoContradiction, AutomationStudioResultStandingNoRecord } from "./types.ts";

/** The most standing nos a gate keeps; the latest are kept. */
const MAX_KEPT = 20;

/** One gate's memory of its build's standing nos (header). */
export class AutomationStudioResultStandingNoMemory {
  private readonly upheld: Array<{ revision: number; record: AutomationStudioResultStandingNoRecord }> = [];

  /**
   * Weighs one trial's verdict: for a no carrying a record (`standingNo`, any
   * value a port answered; one not of the record's shape is no record), Core's
   * finding where an earlier standing no of another revision contradicts it;
   * nothing otherwise. A no not contradicted that upheld rows is kept.
   */
  weigh(trial: { revision: number; verdict: string; standingNo?: unknown }): AutomationStudioResultStandingNoContradiction | undefined {
    if (trial.verdict !== "no") return undefined;
    const record = recordOf(trial.standingNo);
    if (!record) return undefined;
    const found = automationStudioResultStandingNoContradicted(this.upheld.filter((kept) => kept.revision !== trial.revision), record);
    if (found) return found;
    if (record.upheldKind?.length) {
      this.upheld.push({ revision: trial.revision, record });
      while (this.upheld.length > MAX_KEPT) this.upheld.shift();
    }
    return undefined;
  }
}
