import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioSubflowTrialRequest, AutomationStudioSubflowTrialResult } from "../../flow-bootstrap/subflow-candidate/index.ts";
import type { AutomationStudioProjectBuilderReturn, AutomationStudioProjectSubflowBrief } from "../contracts/index.ts";

// What the supervisor's `project.dispatch` asks of the dispatcher
// (automation-project-agents-plan, `Concurrent dispatch`). The dispatcher runs
// each brief under its own allowance, cancellation child and host lease;
// briefs whose entries do not depend on each other run at once, up to the host
// capacity the domain declares, and the rest wait in dependency order. A
// builder that throws, runs out of allowance or is stopped comes back as a
// return (`partial` or `blocked`), never as the dispatcher's failure.
//
// **A single-subflow plan's test is the judged whole run (t679).** While the
// plan in force is one subflow the router runs, the supervisor hands the
// dispatch its whole test (`wholeTrial`, `../single-subflow/single-subflow-trial.ts`):
// a build or repair brief's `core.test_subflow` then assembles the proposal
// under test, as `project.assemble` would, and tests that whole revision with
// the supervisor's gate and judge, after the brief's own gate has put the site
// back (`./run-brief.ts`). A reset brief never gets it.

/**
 * One test of a single-subflow brief as the build's judged whole run (header):
 * the whole trial's answer in a subflow trial's terms, bound to the proposal
 * under test, or why it could not run (`refused`), in a builder's terms.
 */
export type AutomationStudioProjectDispatchWholeTrial = (request: AutomationStudioSubflowTrialRequest) => Promise<AutomationStudioProjectDispatchWholeTrialAnswer>;

export type AutomationStudioProjectDispatchWholeTrialAnswer =
  | { trial: AutomationStudioSubflowTrialResult }
  /** No trial ran: the code, what the builder is to do, what else it is shown, and whether the same test may reach the gate again. */
  | { refused: { code: string; instruction: string; detail: JsonObject; retry: boolean } };

export type AutomationStudioProjectDispatchRequest = {
  /** Briefs already recorded in the build record, under its current plan. */
  briefs: readonly AutomationStudioProjectSubflowBrief[];
  signal: AbortSignal;
  /** The single-subflow plan's whole test (header); absent for every other plan. */
  wholeTrial?: AutomationStudioProjectDispatchWholeTrial | undefined;
};

export type AutomationStudioProjectDispatchResult = {
  /** One return per brief, in the order the briefs were given. */
  returns: readonly AutomationStudioProjectBuilderReturn[];
};

export type AutomationStudioProjectDispatchPort = (request: AutomationStudioProjectDispatchRequest) => Promise<AutomationStudioProjectDispatchResult>;
