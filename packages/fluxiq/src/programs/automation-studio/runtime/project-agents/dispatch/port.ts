import type { AutomationStudioProjectBuilderReturn, AutomationStudioProjectSubflowBrief } from "../contracts/index.ts";

// What the supervisor's `project.dispatch` asks of the dispatcher
// (automation-project-agents-plan, `Concurrent dispatch`). The dispatcher runs
// each brief under its own allowance, cancellation child and host lease;
// briefs whose entries do not depend on each other run at once, up to the host
// capacity the domain declares, and the rest wait in dependency order. A
// builder that throws, runs out of allowance or is stopped comes back as a
// return (`partial` or `blocked`), never as the dispatcher's failure.

export type AutomationStudioProjectDispatchRequest = {
  /** Briefs already recorded in the build record, under its current plan. */
  briefs: readonly AutomationStudioProjectSubflowBrief[];
  signal: AbortSignal;
};

export type AutomationStudioProjectDispatchResult = {
  /** One return per brief, in the order the briefs were given. */
  returns: readonly AutomationStudioProjectBuilderReturn[];
};

export type AutomationStudioProjectDispatchPort = (request: AutomationStudioProjectDispatchRequest) => Promise<AutomationStudioProjectDispatchResult>;
