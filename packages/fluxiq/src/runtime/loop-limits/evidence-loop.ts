// The hard ceilings on a bounded evidence loop.
//
// These numbers are Core's, not the harness's and not recovery's. Two
// directories are bounded by them and neither owns them: `runtime/llm/` runs
// the loop and refuses a configuration that asks for more, and
// `runtime/recovery/` spends the same budget through its exploration ledger.
//
// They sit in a directory of their own because a constant that both sides read
// is exactly the kind of thing that grows an import edge between them, and one
// such edge -- `runtime/llm/harness/intervention.ts` reaching into
// `runtime/recovery/` for a value while `runtime/recovery/` already imports the
// evidence loop back out -- closed a module cycle twice in one day. A cycle
// leaves a module-evaluation-time constant holding `undefined` with a clean
// type check: the provider's own schema constants evaluated early and the
// opaque handle's `pattern`, `maxLength` and `maxProperties` silently vanished
// from the JSON schema sent to the provider. The `imports` structure-audit rule
// now fails the build on a value import in that direction; this module is where
// a shared value goes instead of provoking one.
//
// They are ceilings on what a caller may configure, not defaults: the loop
// still starts from eight of each unless it is told otherwise. Sixteen was the
// ceiling while a recovery was capped at a handful of provider calls anyway;
// with the cap replaced by a cost and a token bound, a bounded
// exploration that is still learning has to be able to keep going, and a
// ceiling of sixteen would simply have become the next hard limit underneath
// the ones that were removed.
//
// `maxEvidenceBytes` is no longer a limit on anything. It was a 1 MiB backstop
// on everything a loop gathered, which ended a loop `evidence_limit`; a
// whole-page packet can be that size on its own, and the model is now shown
// every entry with the model's context window as the only bound on a request
// (`../llm/context-window.ts`). It stays, at the largest safe integer, only
// because readers of a recorded trace hold an accounted byte count to it.
export const AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS = {
  maxIterations: 64,
  maxToolCalls: 64,
  maxEvidenceBytes: Number.MAX_SAFE_INTEGER
} as const;

// **No longer read by any loop (t1049).** It was the count of steps in a row
// without progress that ended a loop, and no such count ends anything now (user,
// 2026-11-24: "THERE SHOULDNT BE ANY ARBITRARY FUCKING CALL LIMIT THAT RANDOMLY
// JUST RESETS EVERYTHING"): a stall is steered from
// `AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_REDIRECT_AT_STEPS_WITHOUT_PROGRESS` on,
// a repeat is loop detection's, and only the result, the purse or a person's
// Stop ends a task. It is kept only because callers still pass it as
// `unusableDecisions.maxConsecutive`, which the loop ignores
// (`../llm/loop-configuration.ts`); remove it with them.
/** @deprecated Read by no loop since t1049; see the comment above. */
export const AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_DEFAULT_MAX_STEPS_WITHOUT_PROGRESS = 8;

// Steps in a row that give a loop nothing new, after which it **changes what it
// is asking for**.
//
// It is the loop's whole response to a stall, and it costs
// no provider call and no iteration. At three the loop pushes a plain statement
// of what the model already holds, what its draft has in it, what it keeps
// repeating and what refused its last attempt to finish
// (`../llm/evidence-progress/stall-redirect.ts`), and it does so again on every
// further step without progress until the model does something new. Nothing
// stops it: no count of steps without progress ends a loop (t1049).
//
// Three, for the reason three was once the stop and was wrong as one: two steps
// that gather nothing new are an ordinary recovery -- a setback, a second look,
// another way -- and the third is the first step that recovery does not
// explain. What was wrong was ending the build there. Saying so there is right:
// replayed over `run-mulum3x7-18ceeb75`'s recorded trace, the redirection fires
// eleven times from iteration 11 of 34 -- the first of them before two thirds
// of that run's wasted work. The replay is of the trace as recorded, so
// everything after the first redirection is a run that would not have happened
// the same way.
export const AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_REDIRECT_AT_STEPS_WITHOUT_PROGRESS = 3;
