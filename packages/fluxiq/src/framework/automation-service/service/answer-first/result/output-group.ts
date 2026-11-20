// The steps whose pages are the answer: the output step (`./output-step.ts`), and before it the read steps that write
// the same named record output in turn, as a run of the saved Flow fills that output.
//
// A read step's `recordOutput` names the dataset its rows go to and how: `append` adds them after what the output
// holds, anything else starts it over. A saved Flow runs its steps in draft order into those outputs, so where the output
// step appends, the output it leaves holds the rows of every earlier step appending to it, back to (and including) the
// last step that started it over. The answer is that output, so it holds the same rows: an answer of the output step
// alone would be another list than the one the saved Flow hands the next attempt (design rationale 2, "the answer and
// the saved Flow can no longer drift"). A check that fails, and a read added to answer it (`fluxiq.run`'s loop), is the
// common case: the model appends what it found next to what it found first.
//
// Only draft read steps take part, so a look never does (D1), and neither does a step marked `purpose: intermediate`.
// A step that names no output, or the output step when it does not append, is the answer alone.
import { automationStudioAnswerFirstResultOutputStep } from "./output-step.ts";
import type { AutomationStudioAnswerFirstResultLedger, AutomationStudioAnswerFirstResultStep } from "./types.ts";

/** The answer's steps in draft order, the output step last; empty where no read step is the result. */
export function automationStudioAnswerFirstResultOutputGroup(ledger: AutomationStudioAnswerFirstResultLedger): readonly AutomationStudioAnswerFirstResultStep[] {
  const output = automationStudioAnswerFirstResultOutputStep(ledger);
  if (!output) return [];
  const writes = output.writes;
  if (!writes?.append) return [output];
  const outputAt = at(output);
  const earlier = ledger.steps
    .filter((step) => step !== output && !step.intermediate && step.writes?.datasetId === writes.datasetId && at(step) < outputAt)
    .sort((one, other) => at(other) - at(one));
  const group: AutomationStudioAnswerFirstResultStep[] = [output];
  for (const step of earlier) {
    group.unshift(step);
    if (!step.writes?.append) break;
  }
  return group;
}

/** Where a step stands in the draft: a step others were folded into stands where the last of them stands. */
function at(step: AutomationStudioAnswerFirstResultStep): number {
  return Math.max(step.position, ...step.folded.map((folded) => folded.position));
}
