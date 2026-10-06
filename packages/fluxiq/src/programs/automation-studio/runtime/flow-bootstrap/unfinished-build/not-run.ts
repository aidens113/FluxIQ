// The steps of a Flow the test cannot run as it stands: carried from an earlier
// Flow by a re-author or an extend, and neither runnable as the Flow saved them
// nor rerun live.
//
// A seed from a stored Flow (`../../llm/node-tools/draft-from-flow.ts`) names
// each step it carries `f<n>`. One left unchanged, whose node declared its
// consequences and whose start the run being repaired captured, holds a
// scheduled candidate, and the test runs it fresh as saved; the Merge an
// optional step joins at is passed through. Anything else carried -- changed
// since it was seeded, declaring nothing, or with no captured start -- the test
// refuses as `not_run_in_this_build` (`../../flow-draft/full-run-required.ts`)
// until it is rerun live, and a rerun is a step of its own (`d<n>`). A round
// whose Flow holds one has no test to measure it by (t194-w70, `./phases.ts`).
//
// The gate and this list ask the same question of a step
// (`../../flow-draft/carried-step/`). They used not to: live run
// `run-muw60j7c-bb7c9a62` had steps 1-5 listed here, and every round told to
// rerun them, while the gate would have run all but the Merge as saved -- and a
// rerun of the carried type step was refused by the domain for naming no handle,
// five rounds running (t274-c4).
import { automationStudioFlowDraftStepNotRunInThisBuild } from "../../flow-draft/carried-step/index.ts";
import { automationStudioFlowDraftStepIsProposed, type AutomationStudioFlowDraftStep } from "../../flow-draft/index.ts";

/**
 * The positions, in `steps`, of the proposed steps carried from an earlier Flow
 * that the test cannot run as saved -- exactly those the test refuses as
 * `not_run_in_this_build`, and the only ones a repair is told to rerun.
 */
export function automationStudioFlowBootstrapStepsNotRunInThisBuild(steps: readonly AutomationStudioFlowDraftStep[]): number[] {
  return steps
    .filter((step) => automationStudioFlowDraftStepIsProposed(step) && automationStudioFlowDraftStepNotRunInThisBuild(step))
    .map((step) => step.position);
}
