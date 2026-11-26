// The figures one evidence loop shares between the directories that run it.
//
// These numbers are Core's, not the harness's and not recovery's. Two
// directories read them and neither owns them: `runtime/llm/` runs the loop,
// and `runtime/recovery/` spends its budget through its exploration ledger.
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
// **There is no ceiling on a loop's turns or calls (t1056).** The loop limits
// this module once held -- the most a caller could configure, 64 of each -- are
// gone, with every reader (user, 2026-11-24: "THERE SHOULDNT BE ANY ARBITRARY
// FUCKING CALL LIMIT THAT RANDOMLY JUST RESETS EVERYTHING"). The bound readers
// of a recorded trace hold an accounted byte count to is `./evidence-bytes.ts`.

// Steps in a row that give a loop nothing new, after which it **changes what it
// is asking for**.
//
// It is the loop's whole response to a stall, and it costs
// no provider call and no iteration. At three the loop pushes a plain statement
// of what the model already holds, what its draft has in it, what it keeps
// repeating and what refused its last attempt to finish
// (`../llm/evidence-progress/stall-redirect.ts`), and it does so again on every
// further step without progress until the model does something new. Nothing
// stops it: no count of steps without progress ends a loop (t1049), and no other
// count does either (t1056).
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
