// The steps of a Flow that have not run in this build: carried from an earlier
// Flow by a re-author or an extend, and never rerun live.
//
// A seed from a stored Flow (`../../llm/node-tools/draft-from-flow.ts`) names
// each step it carries `f<n>` and gives it nothing it ran with and nothing to
// put the target back with. Core must not run such a step itself -- the
// permission gate reads its absent consequence declaration as "none" -- so the
// test refuses a Flow holding one as `not_run_in_this_build`
// (`../../flow-draft/full-run-required.ts`) until each is rerun live, and a
// rerun is a step of its own (`d<n>`). A round whose Flow holds one therefore
// has no test to measure it by (t194-w70, `./phases.ts`).
import { automationStudioFlowDraftStepIsProposed, type AutomationStudioFlowDraftStep } from "../../flow-draft/index.ts";

/**
 * A carried step's own name: the same test as `automationStudioFlowDraftStepCarried`
 * (`../../llm/node-tools/draft-from-flow.ts`), held to it by
 * `./tests/never-run-whole.test.ts`. Not imported: the node-tools barrel
 * imports this directory's barrel, and a value edge back would close a module
 * cycle.
 */
const CARRIED_STEP_ID = /^f[1-9][0-9]*$/u;

/**
 * The positions, in `steps`, of the proposed steps carried from an earlier Flow
 * with no argument they ran with or nothing to put the target back with --
 * exactly those the test refuses as `not_run_in_this_build`.
 */
export function automationStudioFlowBootstrapStepsNotRunInThisBuild(steps: readonly AutomationStudioFlowDraftStep[]): number[] {
  return steps
    .filter((step) => automationStudioFlowDraftStepIsProposed(step) && typeof step.id === "string" && CARRIED_STEP_ID.test(step.id) && (step.ranWith === undefined || step.replay === undefined))
    .map((step) => step.position);
}
