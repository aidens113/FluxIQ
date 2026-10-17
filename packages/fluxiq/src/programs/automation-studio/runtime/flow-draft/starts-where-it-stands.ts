// A carried Flow whose first step has no start captured is tested from where
// the target stands, as that Flow's own playback runs it.
//
// **The failure this closes (live run `run-mvblov2i-abb7d82e`, t688).** The
// saved Flow's playback was rightly judged no, and its repair seeded the draft
// from the Flow (`../llm/node-tools/draft-from-flow.ts`). Every unchanged step
// was scheduled to run as saved (`./scheduled-candidate/`), but the run being
// repaired had captured no start for the Flow's first node -- a navigate -- so
// the test had nothing to put the target back to. Its completion was refused
// `full_run_required`, step 1 `cannot_run_again` (steps 0080, 0086), the round
// stalled, and the model then reran the saved steps one at a time, some of them
// as new steps with `add` (0088-0120): about fifteen decisions, two duplicated
// steps at the end of the Flow, and nothing the test could not have done itself.
// The rerun the refusal asked for ran step 1 where the page stood
// (`start_page_unknown`, `../llm/node-tools/step-place.ts`) and recorded that page
// as its start, so the test it unlocked reset to an arbitrary page and ran the
// same step from there.
//
// **The rule.** When the first step the test sends is a carried step still as
// its Flow saved it, run as its scheduled candidate, and the run being repaired
// captured no start for it, the test sends it from where the target stands,
// with no reset: that is how the saved Flow's own playback starts it. Only that
// step is excused a start. A step the build ran itself keeps its own recorded
// start, and one with none is still refused `cannot_run_again`: its run is the
// evidence of where the Flow begins, and nothing else says it.

import { automationStudioFlowDraftStepCarried, automationStudioFlowDraftStepCarriedJoin } from "./carried-step/index.ts";
import { automationStudioFlowDraftScheduledCandidateCall } from "./scheduled-candidate/index.ts";
import { automationStudioFlowDraftStepIsProposed, type AutomationStudioFlowDraftStep } from "./step.ts";

/**
 * Whether the test of this draft starts where the target stands: its first
 * sent step (a carried join is not sent) is an unchanged carried step run as its
 * scheduled candidate, with no start the run being repaired captured (header).
 */
export function automationStudioFlowDraftStartsWhereItStands(steps: readonly AutomationStudioFlowDraftStep[]): boolean {
  const first = steps.find((step) => automationStudioFlowDraftStepIsProposed(step) && !automationStudioFlowDraftStepCarriedJoin(step));
  if (!first || !automationStudioFlowDraftStepCarried(first) || first.scheduledCandidate === undefined) return false;
  const call = automationStudioFlowDraftScheduledCandidateCall(first);
  return call !== undefined && call.from === undefined;
}
