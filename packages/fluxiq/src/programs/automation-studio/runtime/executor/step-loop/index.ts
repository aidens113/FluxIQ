// The seams of a graph run's step loop (`graph-run.ts`). Each takes the run's
// loop context and hands back what the loop does next; the loop applies it.
export { automationStudioStepArrival } from "./arrival.ts";
export { automationStudioStepAskOrPark } from "./ask-or-park.ts";
export { automationStudioEndedTrace } from "./ended-trace.ts";
export { automationStudioStepFailedAttempt } from "./failed-attempt.ts";
export type { AutomationStudioStepLoopContext } from "./loop-context.ts";
export type { AutomationStudioStepOutcome } from "./loop-outcome.ts";
export { automationStudioStepStateRoute } from "./state-route.ts";
// Lifecycle handlers at the loop's boundaries (state-aware recovery plan, C3-C7, C11).
export { automationStudioStepBeforeNext } from "./before-next.ts";
export { automationStudioStepRetryBeforeRouting } from "./could-not-run-retry.ts";
export { automationStudioStepLifecycle, automationStudioStepLifecycleRegister, type AutomationStudioStepLifecycleOutcome } from "./lifecycle-dispatch.ts";
export { automationStudioStepLifecycleFrame, type AutomationStudioStepLifecycleFrame } from "./lifecycle-frame.ts";
export { automationStudioStepEndFrameIncident } from "./lifecycle-incident.ts";
export { automationStudioTraceWithLifecycle } from "./lifecycle-trace.ts";
// Where a frame begins, a route a child carries up, and the check at a frame's End (C2, C5).
export { automationStudioStepEntry } from "./entry.ts";
export { automationStudioStepCheckpointRoute } from "./checkpoint-route.ts";
export { automationStudioStepFrameSucceeded } from "./success-check.ts";
