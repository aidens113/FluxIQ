// What a run's detail keeps of state-aware recovery (state-aware recovery plan,
// C6, C11): the lifecycle handler an attempt ran, where a frame began, what a
// failure counted as, and the record of each handler execution the runtime
// stream holds. Ids, closed codes and times only: never page text, a value
// read from the page, or a handler's resolved outputs. The executor's trace
// (`runtime/executor/contracts.ts`) holds the same shapes; the run detail is
// projected from it (`runtime/service/summaries/recovery-trace.ts`).

/** A lifecycle boundary a handler may fire at (C3). */
export type AutomationStudioFlowRunLifecycleEvent = "start" | "before" | "retry" | "fail" | "before_next";
