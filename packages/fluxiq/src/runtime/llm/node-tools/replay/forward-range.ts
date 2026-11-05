// Which steps a forward run walks (t869, `./forward.ts`).
//
// A model runs "the loop" by its first step. Paid run `run-mw37vz9n-a77a02c2` asked `{from: 23}`, where 23 opened a
// row and 17 read the list, and a repeat whose list is not in the walk has no rows to walk, so the steps went once,
// with no row, on whatever page stood there. So a forward run takes the whole repeat and its list, whatever range it
// was asked for: a range that starts inside a repeat starts at the repeat's first step, and a list before the range is
// read just before the repeat, on its own page (`listsBroughtIn`, `AUTOMATION_STUDIO_NODE_REPLAY_REACH_KEY`).
// A do-while names no earlier step, so nothing is brought in for one.

import { automationStudioFlowDraftRepeatIsWhile, automationStudioFlowDraftStepId, automationStudioFlowDraftStepIsProposed, type AutomationStudioFlowDraftStep } from "../../../flow-authoring/draft/index.ts";

/** The steps a forward run walks, and the lists among them that were before the range it was asked for. */
export function automationStudioFlowDraftReplayForwardRange(steps: readonly AutomationStudioFlowDraftStep[], run: readonly AutomationStudioFlowDraftStep[]): { run: AutomationStudioFlowDraftStep[]; listsBroughtIn: ReadonlySet<AutomationStudioFlowDraftStep> } {
  const proposed = steps.filter(automationStudioFlowDraftStepIsProposed);
  const atOf = (id: string): number => proposed.findIndex((step) => automationStudioFlowDraftStepId(step) === id);
  const spans = proposed.flatMap((step, start) => {
    const routing = step.routing;
    if (routing?.kind !== "repeat" || automationStudioFlowDraftRepeatIsWhile(routing)) return [];
    return [{ start, end: Math.max(start, atOf(routing.through)), over: atOf(routing.over) }];
  });
  const first = run[0] ? proposed.indexOf(run[0]) : -1;
  const inside = spans.find((span) => span.start < first && first <= span.end);
  const walked = inside ? [...proposed.slice(inside.start, first), ...run] : [...run];
  const listsBroughtIn = new Set<AutomationStudioFlowDraftStep>();
  for (const span of spans) {
    const list = proposed[span.over];
    const at = walked.indexOf(proposed[span.start]!);
    if (!list || at < 0 || span.over >= span.start || walked.includes(list)) continue;
    walked.splice(at, 0, list);
    listsBroughtIn.add(list);
  }
  return { run: walked, listsBroughtIn };
}
