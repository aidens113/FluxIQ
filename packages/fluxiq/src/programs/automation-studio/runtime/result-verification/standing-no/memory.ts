// What one gate keeps of its build's standing nos across its trials (t633,
// `./index.ts`): the subflow trial gate per brief, the candidate trial gate
// per build. Each trial judged no hands its record here (`standingNo`, carried
// on the trial's result outside its feedback); a no the build's own record
// contradicts (`./contradiction.ts`) is answered so, and is not kept; any other
// that upheld rows of a kind is kept for the trials after it.

import { automationStudioResultStandingNoContradicted } from "./contradiction.ts";
import type { AutomationStudioResultStandingNoCall, AutomationStudioResultStandingNoCondition, AutomationStudioResultStandingNoContradiction, AutomationStudioResultStandingNoRecord } from "./types.ts";

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

/** A copy of `value` where it has the record's shape (`./types.ts`); nothing otherwise. */
function recordOf(value: unknown): AutomationStudioResultStandingNoRecord | undefined {
  if (!isObject(value) || !strings(value.stored) || typeof value.storedWhole !== "boolean" || !Array.isArray(value.conditions) || !Array.isArray(value.standing)) return undefined;
  if (value.upheldKind !== undefined && !strings(value.upheldKind)) return undefined;
  const conditions = value.conditions.map(conditionOf);
  const standing = value.standing.map(callOf);
  if (conditions.some((condition) => !condition) || standing.some((call) => !call)) return undefined;
  return {
    stored: [...value.stored],
    storedWhole: value.storedWhole,
    conditions: conditions as AutomationStudioResultStandingNoCondition[],
    ...(value.upheldKind?.length ? { upheldKind: [...value.upheldKind] } : {}),
    standing: standing as AutomationStudioResultStandingNoCall[]
  };
}

function conditionOf(value: unknown): AutomationStudioResultStandingNoCondition | undefined {
  if (!isObject(value) || typeof value.name !== "string" || (value.key !== undefined && typeof value.key !== "string") || (value.leftOutAlone !== undefined && !strings(value.leftOutAlone))) return undefined;
  return { name: value.name, ...(value.key !== undefined ? { key: value.key } : {}), ...(value.leftOutAlone !== undefined ? { leftOutAlone: [...value.leftOutAlone] } : {}) };
}

function callOf(value: unknown): AutomationStudioResultStandingNoCall | undefined {
  if (!isObject(value) || (value.call !== 1 && value.call !== 2) || (value.drops !== undefined && !strings(value.drops))) return undefined;
  return { call: value.call, ...(value.drops !== undefined ? { drops: [...value.drops] } : {}) };
}

function isObject(value: unknown): value is Record<string, unknown> & { stored?: unknown; storedWhole?: unknown; conditions?: unknown; standing?: unknown; upheldKind?: unknown } {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function strings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}
