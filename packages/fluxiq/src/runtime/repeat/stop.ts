/** Public description only: these fields never grant a terminal disposition. */
export const AUTOMATION_STUDIO_RUNTIME_REPEAT_STOP = Object.freeze({
  message: "Two completed visits left the observed runtime unchanged; the next identical visit was not run.",
  failure: Object.freeze({ category: "unexpected_state", code: "executor.runtime.unchanged_repeat", retryable: false, stage: "dispatch", effect: "unacted" } as const)
});
