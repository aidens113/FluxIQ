// Marks a paging loop that a later loop over the same list replaced (F5, `run-mwyfoz8o-507c92f6`).
//
// **The failure.** The model looped a read, later moved the result and the loop to a read it made after,
// and never dropped the first loop. Every replay then paged the list twice, about 20 s each. A repeat the
// model wrote makes its span the model's (`../amendment/apply.ts`), so no rule of the draft ever took it
// out, and a read that is not the result's is left out only when the framework placed it.
//
// **The rule.** A paging loop (a span that runs again while its last step succeeds) is superseded when it
// holds no result read and no step that claims an act, and a later paging loop holds a result read of the
// same list (the host's `reads` code). Its kept steps are left out as `repeat`, whoever drafted them, unless
// a step outside the loop names one of them in its own routing. The model keeps the last word: a step it
// puts back in with `keep` has lost `drafted`, and carries `supersededLoop`, so it is never taken out again.
import { automationStudioFlowDraftRepeatIsWhile, automationStudioFlowDraftStepId } from "../routing.ts";
import { automationStudioFlowDraftRoutingReferences } from "../routing.ts";
import type { AutomationStudioFlowDraftStep } from "../step.ts";
import { automationStudioFlowDraftMark } from "./mark.ts";

type Step = AutomationStudioFlowDraftStep;
type Loop = { from: number; to: number; members: Step[] };

/** Marks the kept steps of each paging loop in `ordered` (run order) that a later one over the same list replaced; `framework` names the framework's steps, `resultReads` the result's. */
export function automationStudioFlowDraftMarkSupersededLoops(ordered: readonly Step[], framework: ReadonlySet<Step>, resultReads: ReadonlySet<Step>): void {
  const loops = pagingLoops(ordered);
  for (const loop of loops) {
    const reads = loop.members.filter((step) => step.effect === "observe" && step.reads !== undefined);
    if (!reads.length || loop.members.some((step) => resultReads.has(step) || (step.acts?.length ?? 0) > 0)) continue;
    const replaced = loops.some((later) => later.from > loop.to && later.members.some((step) => resultReads.has(step) && reads.some((read) => read.reads === step.reads)));
    if (!replaced || namedFromOutside(ordered, loop)) continue;
    for (const step of loop.members) {
      // A step the model kept after the framework left it out is its word (header).
      if (!framework.has(step) && step.supersededLoop === true) continue;
      step.supersededLoop = true;
      automationStudioFlowDraftMark(step, "repeat");
    }
  }
}

/** The paging loops of the draft, each with its kept steps, a loop whose steps were all left out dropped. */
function pagingLoops(ordered: readonly Step[]): Loop[] {
  const loops: Loop[] = [];
  ordered.forEach((head, from) => {
    const routing = head.routing;
    if (!inLoop(head) || !automationStudioFlowDraftRepeatIsWhile(routing)) return;
    const to = ordered.findIndex((candidate) => automationStudioFlowDraftStepId(candidate) === routing.through);
    if (to < from) return;
    loops.push({ from, to, members: ordered.slice(from, to + 1).filter(inLoop) });
  });
  return loops;
}

/** Whether the step is in the Flow, or was left out only by this rule (or as a read that is not the result's, which a loop's read becomes once the framework owns it). */
function inLoop(step: Step): boolean {
  return step.disposition === "kept" || (step.supersededLoop === true && (step.drafted === "repeat" || step.drafted === "not_the_result"));
}

/** Whether a kept step outside the loop names one of its steps in its own routing. */
function namedFromOutside(ordered: readonly Step[], loop: Loop): boolean {
  const ids = new Set(loop.members.map(automationStudioFlowDraftStepId));
  return ordered.some((step) => !loop.members.includes(step) && step.disposition === "kept" && step.routing !== undefined
    && automationStudioFlowDraftRoutingReferences(step.routing).some((id) => ids.has(id)));
}
