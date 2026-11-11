// Whether a Flow about to be saved holds the output step as it now reads (lead addition A, lane t905).
//
// The result is the output step's current version (`./output-step.ts`). A saved Flow whose read of that step lost its
// conditions or columns would hand the next attempt another list than the one this attempt's answer was: run-mwcess01
// saved its read without the `where` its answer was read under, and attempt 2 delivered 28 rows for the 4 asked. So the
// save path asks this, after assembly, of what the assembled plan holds for each draft step, and refuses a Flow that
// lost the output step's version rather than saving it.
//
// **What is compared.** The conditions, as a set of their stable forms, and the columns the read names (its `fields`'
// keys). A field's own value is not compared: a plan holds the step as it ran, and a domain writes a field's read in its
// own resolved form there (a selector where the call named a handle), which is the same column read the same way. The
// list's key is never in a plan, so it is not compared either.
//
// **A step folded into the output step (D2) counts as it.** Any draft step the ledger holds under the output step may be
// the one the plan keeps.
import { stableJson } from "../../stable-json.ts";
import type { AutomationStudioAnswerFirstResultStep, AutomationStudioAnswerFirstResultVersion } from "./types.ts";

/** Why the Flow does not hold the output step as it reads. */
export type AutomationStudioAnswerFirstResultOutputNotSaved = { ok: false; code: "answer_first.output_step_not_saved" | "answer_first.output_step_version_not_saved"; said: string };

/**
 * `saved` maps each draft step id the plan holds a read for to what that read is in the plan. `undefined` output: no
 * read step is the result, so nothing has to be held.
 */
export function automationStudioAnswerFirstResultOutputSaved(
  output: AutomationStudioAnswerFirstResultStep | undefined,
  saved: ReadonlyMap<string, AutomationStudioAnswerFirstResultVersion>,
): { ok: true } | AutomationStudioAnswerFirstResultOutputNotSaved {
  if (!output) return { ok: true };
  const held = [output.id, ...output.folded.map((folded) => folded.id)].flatMap((id) => (saved.has(id) ? [saved.get(id)!] : []));
  if (!held.length) return { ok: false, code: "answer_first.output_step_not_saved", said: `The Flow holds no read of step ${output.position}, whose rows are the result.` };
  if (held.some((version) => sameColumnsAndConditions(output.reads, version))) return { ok: true };
  return { ok: false, code: "answer_first.output_step_version_not_saved", said: `The Flow's read of step ${output.position} is not v${output.version}, the version whose rows are the result: its conditions or its columns differ.` };
}

function sameColumnsAndConditions(one: AutomationStudioAnswerFirstResultVersion, other: AutomationStudioAnswerFirstResultVersion): boolean {
  return conditionsKey(one) === conditionsKey(other) && columnsKey(one) === columnsKey(other);
}

function conditionsKey(version: AutomationStudioAnswerFirstResultVersion): string {
  return JSON.stringify([...new Set(version.conditions.map((condition) => stableJson(condition)))].sort());
}

function columnsKey(version: AutomationStudioAnswerFirstResultVersion): string {
  return JSON.stringify(Object.keys(version.fields).sort());
}
