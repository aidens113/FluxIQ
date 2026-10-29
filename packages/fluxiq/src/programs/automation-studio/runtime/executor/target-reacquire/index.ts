// A stale target found again from the step that found it (t786): the host
// seam's request and answer, the gone code, and what a host or a domain asks
// of Core about one -- the step's lineage, whether a failure lost its target
// without acting, which attempt a re-acquire comes before, and whether a source
// may be re-run -- and the graph run's own re-acquire, the seam
// `../step-loop/arrival.ts` calls at the arrival of the attempt it comes before.
export * from "./contracts.ts";
export { automationStudioReacquireBeforeAttempt } from "./before-attempt.ts";
export { AUTOMATION_STUDIO_TARGET_GONE_CODE } from "./gone-code.ts";
export { automationStudioTargetLineage } from "./lineage.ts";
export { automationStudioReacquireSourceReadOnly } from "./read-only-source.ts";
export { automationStudioStaleTargetFailure } from "./stale-failure.ts";
export { automationStudioStepReacquire, type AutomationStudioStepReacquired } from "./step-reacquire.ts";
