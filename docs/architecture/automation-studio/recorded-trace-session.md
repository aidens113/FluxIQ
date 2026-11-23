# Recorded trace sessions

`runAutomationStudioRecordedTraceSession` is an additive public runtime entry from `fluxiq/automation`. It runs a caller's actual product entry inside a recorded domain trace's isolated client scope. It does not build a candidate or replace the product's task loop.

The session admits only a live source trace with compatible capture contracts and an attributable client view. A caller-supplied view is used only when the recording omitted it, and is reported as a normalization. Commands match the next recorded operation exactly. There is no reevaluator or live-session fallback on this entry. A changed command closes the matcher; it never searches a later suffix for another match.

The callback receives the typed trace environment, its cancellation signal, and `assertSupported()`. It checks support before consuming a recorded model response. The first evidence gap aborts that signal and latches one fixed `recorded_trace.evidence_gap` error. The caller connects the signal to its existing run/build cancellation and checks it before further work. The wrapper checks support again on completion and reports the first gap as `diverged`; it never reports an unsupported callback result as an accepted reproduction.

Time and channel visibility come from the shared scoped environment. The source trace is installed in derived-source context, all issued gateway commands remain scoped, and the session settles and detaches in `finally`, including when the callback throws. The gateway's existing matcher stays closed after divergence. Unrelated live clients remain attached but unreachable inside this scope.

The candidate and subflow offline trial entries share this lifecycle and retain their existing exploration refusal and private reevaluation behavior. Recorded build-prefix reproduction is a separate diagnostic use. Neither a prefix nor a candidate trial proves a whole task or a four-attempt successor series; those require their own oracle, saved Flow digest, source and accounting evidence. This API grants no provider access and does not replay model responses itself.
