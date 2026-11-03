// Which repeat span each written step stands in, read before any statement is
// lowered, so the statements that care -- an optional step and the steps that
// run only after it, a pace written under a member -- can ask whether two
// steps share a span.
//
// A span starts at a step that says `repeat over:`, `repeat while:` or `repeat
// through:` and runs through the step its `repeat while:` or `repeat through:`
// names, or is that step alone (`../authoring/draft-routing.ts`, `scriptSpan`). A step
// whose only repeat lines are `repeat most:` or `repeat pace:` starts nothing:
// each is a statement about the span it is written in, moved to the span's
// first step or refused (`./repeat-bound.ts`, `./repeat-pace.ts`). A span whose
// end names no step at or after it is the repeat's own refusal, and is read
// here as its first step alone. Spans do not nest; a step a span already took
// keeps that span.
import type { AutomationStudioFlowScriptStep } from "../authoring/index.ts";

/** One span: its first and last step's index in the block, and whether it repeats while its last step succeeds. */
export type AutomationStudioFlowScriptSpan = { head: number; end: number; repeatsWhile: boolean };

/** The span each step of one block stands in, by the step's index; `undefined` for a step outside every span. */
export function automationStudioFlowScriptSpans(steps: readonly AutomationStudioFlowScriptStep[]): ReadonlyArray<AutomationStudioFlowScriptSpan | undefined> {
  const spans: Array<AutomationStudioFlowScriptSpan | undefined> = steps.map(() => undefined);
  for (const [head, step] of steps.entries()) {
    const repeat = step.repeat;
    if (!repeat || (repeat.over === undefined && repeat.while === undefined && repeat.through === undefined) || spans[head]) continue;
    const endLabel = repeat.while ?? repeat.through;
    const found = endLabel === undefined ? head : steps.findIndex((candidate) => candidate.label === endLabel);
    const span: AutomationStudioFlowScriptSpan = { head, end: found >= head ? found : head, repeatsWhile: repeat.while !== undefined && repeat.over === undefined };
    for (let member = head; member <= span.end; member += 1) spans[member] ??= span;
  }
  return spans;
}
