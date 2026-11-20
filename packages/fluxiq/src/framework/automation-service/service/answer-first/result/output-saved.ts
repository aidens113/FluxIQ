// Whether a Flow about to be saved holds the output step as it now reads (lead addition A, lane t905).
//
// The result is the output step's current version (`./output-step.ts`). A saved Flow whose read of that step lost its
// conditions or columns would hand the next attempt another list than the one this attempt's answer was: run-mwcess01
// saved its read without the `where` its answer was read under, and attempt 2 delivered 28 rows for the 4 asked. So the
// save path asks this, after assembly, of what the assembled plan holds for each draft step, and refuses a Flow that
// lost the output step's version rather than saving it.
//
// **What is compared.** The ledger must still describe the authored read, and the plan must hold the read's recorded
// resolution. Those are two separate comparisons: a domain may resolve a condition naming an unprojected column into
// that column's concrete read, just as it resolves a kept field. `run-mwdbj3vf` refused the correct four-column read
// because it compared that resolved predicate with its authored name. The step's `input` -> `ranWith` correspondence
// is Core's record of what actually ran, not a guessed equivalence. Conditions and fields compare whole on each side,
// so neither a stale authored version nor a changed executable predicate/field can pass through it. The list's key
// may be unsaid: a plan names no domain list identity.
//
// **A step folded into the output step (D2) counts as it.** Any draft step the ledger holds under the output step may be
// the one the plan keeps.
import type { AutomationStudioAnswerFirstResultStep, AutomationStudioAnswerFirstResultVersion } from "./types.ts";
import { automationStudioAnswerFirstResultSameReading } from "./version.ts";

/** Why the Flow does not hold the output step as it reads. */
export type AutomationStudioAnswerFirstResultOutputNotSaved = { ok: false; code: "answer_first.output_step_not_saved" | "answer_first.output_step_version_not_saved"; said: string };

/**
 * `saved` maps each draft step id the plan holds a read for to that step's authored read, its recorded resolution,
 * and what the assembled plan holds. `undefined` output: no read step is the result, so nothing has to be held.
 */
export function automationStudioAnswerFirstResultOutputSaved(
  output: AutomationStudioAnswerFirstResultStep | undefined,
  saved: ReadonlyMap<string, {
    written: AutomationStudioAnswerFirstResultVersion;
    resolved: AutomationStudioAnswerFirstResultVersion;
    saved: AutomationStudioAnswerFirstResultVersion;
  }>,
): { ok: true } | AutomationStudioAnswerFirstResultOutputNotSaved {
  if (!output) return { ok: true };
  const held = [output.id, ...output.folded.map((folded) => folded.id)].flatMap((id) => (saved.has(id) ? [saved.get(id)!] : []));
  if (!held.length) return { ok: false, code: "answer_first.output_step_not_saved", said: `The Flow holds no read of step ${output.position}, whose rows are the result.` };
  if (held.some((read) => automationStudioAnswerFirstResultSameReading(output.reads, read.written, "may be unsaid")
    && automationStudioAnswerFirstResultSameReading(read.resolved, read.saved, "may be unsaid"))) return { ok: true };
  return { ok: false, code: "answer_first.output_step_version_not_saved", said: `The Flow's read of step ${output.position} is not v${output.version}, the version whose rows are the result: its conditions or its columns differ.` };
}
