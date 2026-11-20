// Whether a Flow about to be saved holds the output step as it now reads (lead addition A, lane t905).
//
// The result is the output step's current version (`./output-step.ts`). A saved Flow whose read of that step lost its
// conditions or columns would hand the next attempt another list than the one this attempt's answer was: run-mwcess01
// saved its read without the `where` its answer was read under, and attempt 2 delivered 28 rows for the 4 asked. So the
// save path asks this, after assembly, of what the assembled plan holds for each draft step, and refuses a Flow that
// lost the output step's version rather than saving it.
//
// **What is compared, and in which words.** Three reads of one step, each in its own vocabulary:
//
// - `written`, the step's `input`: what the model wrote, the words the ledger records the answer's version in.
// - `recorded`, the step's `ranWith ?? input`: what the assembly was handed for the step (`runtime/llm/node-tools/draft-step.ts`).
// - `saved`, the assembled plan's node: what the domain's resolver answered for the recorded read.
//
// The ledger must describe `written` exactly. Then the plan must hold `recorded`, which is one of two things, each
// compared exactly within one vocabulary and never across two:
//
// 1. `recorded` already in the plan's words, kept unchanged: the domain recorded the step resolved.
// 2. `recorded` in the authored words, exactly `written`: the domain kept the read as written and resolves it again
//    when the plan is assembled. The web domain does this for every list read (its `node-run/node-call.ts`: "resolved,
//    except for the list an extraction reads"; its resolver refuses a literal list request once a list was detected).
//    The plan's read is then the domain's resolution of exactly the answer's read. Its values are the domain's own
//    words, which Core does not read (`runtime/flow-authoring/draft/step.ts`, `ranWith`), but a resolution changes how
//    a column or a condition is read and never whether: the plan must keep every column the read named, under its own
//    key, and as many distinct conditions.
//
// `run-mwdbj3vf` refused the right read because it compared a resolved condition with its authored words. The fix that
// followed took `ranWith` for the recorded resolution, which the web domain never makes it for a list read, so every
// such Flow was then refused and saved nothing, and no later attempt's continuation could be proven (`run-mwop7kt3`).
//
// **A step folded into the output step (D2) counts as it.** Any draft step the ledger holds under the output step may be
// the one the plan keeps.
import { stableJson } from "../../stable-json.ts";
import type { AutomationStudioAnswerFirstResultStep, AutomationStudioAnswerFirstResultVersion } from "./types.ts";
import { automationStudioAnswerFirstResultSameReading } from "./version.ts";

/** Why the Flow does not hold the output step as it reads. */
export type AutomationStudioAnswerFirstResultOutputNotSaved = { ok: false; code: "answer_first.output_step_not_saved" | "answer_first.output_step_version_not_saved"; said: string };

/** One draft step's read as authored, as handed to the assembly, and as the assembled plan holds it (header). */
export type AutomationStudioAnswerFirstResultSavedRead = {
  written: AutomationStudioAnswerFirstResultVersion;
  recorded: AutomationStudioAnswerFirstResultVersion;
  saved: AutomationStudioAnswerFirstResultVersion;
};

/**
 * `saved` maps each draft step id the plan holds a read for to that step's reads (header). `undefined` output: no read
 * step is the result, so nothing has to be held.
 */
export function automationStudioAnswerFirstResultOutputSaved(
  output: AutomationStudioAnswerFirstResultStep | undefined,
  saved: ReadonlyMap<string, AutomationStudioAnswerFirstResultSavedRead>,
): { ok: true } | AutomationStudioAnswerFirstResultOutputNotSaved {
  if (!output) return { ok: true };
  const held = [output.id, ...output.folded.map((folded) => folded.id)].flatMap((id) => (saved.has(id) ? [saved.get(id)!] : []));
  if (!held.length) return { ok: false, code: "answer_first.output_step_not_saved", said: `The Flow holds no read of step ${output.position}, whose rows are the result.` };
  if (held.some((read) => automationStudioAnswerFirstResultSameReading(output.reads, read.written, "may be unsaid") && planHolds(read))) return { ok: true };
  return { ok: false, code: "answer_first.output_step_version_not_saved", said: `The Flow's read of step ${output.position} is not v${output.version}, the version whose rows are the result: its conditions or its columns differ.` };
}

/** Whether the plan holds the recorded read: kept as recorded, or resolved from the authored read keeping every part (header). */
function planHolds({ written, recorded, saved }: AutomationStudioAnswerFirstResultSavedRead): boolean {
  if (automationStudioAnswerFirstResultSameReading(recorded, saved, "may be unsaid")) return true;
  return automationStudioAnswerFirstResultSameReading(recorded, written, "may be unsaid") && keepsEveryPart(written, saved);
}

/** Every column the authored read named is a column of the plan's read, and it holds as many distinct conditions. */
function keepsEveryPart(written: AutomationStudioAnswerFirstResultVersion, saved: AutomationStudioAnswerFirstResultVersion): boolean {
  return Object.keys(written.fields).every((key) => Object.hasOwn(saved.fields, key)) && distinct(written.conditions) === distinct(saved.conditions);
}

function distinct(conditions: AutomationStudioAnswerFirstResultVersion["conditions"]): number {
  return new Set(conditions.map((condition) => stableJson(condition))).size;
}
