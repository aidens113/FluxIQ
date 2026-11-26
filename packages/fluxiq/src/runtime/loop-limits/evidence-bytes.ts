// The bound readers of a recorded evidence trace hold an accounted byte count to.
//
// It is no longer a limit on anything a loop does. It was a 1 MiB backstop on everything a loop gathered, which ended a
// loop `evidence_limit`; a whole-page packet can be that size on its own, and the model is now shown every entry with
// the model's context window as the only bound on a request (`../llm/context-window.ts`). It stays, at the largest safe
// integer, only so a reader can refuse a recorded figure that is not a safe whole number. It was the loop limits'
// `maxEvidenceBytes` until t1056 removed those limits.
export const AUTOMATION_STUDIO_LLM_EVIDENCE_ACCOUNTED_BYTES_MAX = Number.MAX_SAFE_INTEGER;
