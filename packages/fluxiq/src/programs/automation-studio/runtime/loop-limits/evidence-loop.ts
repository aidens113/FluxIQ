// The hard ceilings on a bounded evidence loop.
//
// These three numbers are Core's, not the harness's and not recovery's. Two
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
// with the cap replaced by a cost, a token and a no-progress guard, a bounded
// exploration that is still learning has to be able to keep going, and a
// ceiling of sixteen would simply have become the next hard limit underneath
// the ones that were removed.
export const AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS = {
  maxIterations: 64,
  maxToolCalls: 64,
  maxEvidenceBytes: 1_048_576
} as const;

// How many decisions in a row may come back unusable -- a malformed reply, a
// timeout -- before a loop that asks again stops asking. It is the same number
// as the runtime exploration's no-progress streak
// (`AUTOMATION_STUDIO_EXPLORATION_DEFAULT_MAX_STEPS_WITHOUT_PROGRESS`), which a
// test pins: a single bad reply is ordinary, three in a row is a model or a
// provider that has stopped answering usefully. It lives here rather than in
// `runtime/recovery/` because `runtime/llm/` may not read a value from there.
export const AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_MAX_CONSECUTIVE_UNUSABLE_DECISIONS = 3;

// Steps in a row that give a loop nothing new, after which it stops.
//
// Three was the number, and a build that met a setback, looked at the page
// again and tried another way had taken two steps that gathered nothing new
// while doing exactly the right thing; the third ended it. So it became
// twenty-four -- and twenty-four is at or above `maxIterations` on every run
// the Lab makes, because `maxStepsWithoutProgress` is held to `maxIterations`
// and a creation run is given 26 or 48 calls. **No stall guard could fire
// before the iterations did.** Every stall therefore arrived as an exhaustion,
// which is why `../llm/evidence-loop.ts`'s `exhausted()` was written to borrow
// the stall's code: it was papering over a guard that structurally could not
// bite.
//
// Eight is read off the traces rather than chosen. On
// `run-mulum3x7-18ceeb75` (2026-09-28, 35 iterations, 34 paid decisions, 24
// tool calls, no Flow):
//
//   - the longest run of steps that gave the loop nothing new and was still
//     followed by new work was **six** -- six `draft_unchanged` amendments,
//     iterations 14-19, after which the model did try to complete and then
//     detected a structure it had not seen. A guard at six or seven would have
//     ended a build that still had something to give;
//   - the longest run that was *not* followed by new work was **fifteen** --
//     iterations 20 to 34, four refusals answered `answered_the_same_again`
//     and five reruns of one inspection returning the same 8,960 bytes each
//     time, ending at the model's own dry-run refusal;
//   - the longest run of *productive* iterations was seven (1-7).
//
// So eight is the first number above every observed recovery and below every
// observed stall, and a sixth of a 48-call creation run rather than all of it.
// The stop is also no longer the loop's first answer to a stall: from
// `AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_REDIRECT_AT_STEPS_WITHOUT_PROGRESS` the
// loop redirects the model instead, five times over, before this number is
// reached (`../llm/evidence-loop/stall-redirect.ts`).
//
// What bounds a build is still what it spends -- the run's cost, its tokens and
// its deadline, which the loop is handed as its `budget`. This is only the stop
// for a loop that has been told four times that it is repeating itself and has
// gone on repeating itself.
//
// It lives beside the ceilings rather than in `runtime/llm/` because
// `runtime/loop-limits/` may not read a value from there, and the Flow
// Bootstrap limits in this directory are what hand it to the loop.
export const AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_DEFAULT_MAX_STEPS_WITHOUT_PROGRESS = 8;

// Steps in a row that give a loop nothing new, after which it **changes what it
// is asking for** rather than stopping.
//
// The stop above is the last resort; this is the first response, and it costs
// no provider call and no iteration. At three the loop pushes a plain statement
// of what the model already holds, what its draft has in it, what refused its
// last attempt to finish, and how many steps remain before it stops
// (`../llm/evidence-loop/stall-redirect.ts`), and it does so again on every
// further step without progress until either the model does something new or
// the stop is reached.
//
// Three, for the reason three was once the stop and was wrong as one: two steps
// that gather nothing new are an ordinary recovery -- a setback, a second look,
// another way -- and the third is the first step that recovery does not
// explain. What was wrong was ending the build there. Saying so there is right:
// replayed over `run-mulum3x7-18ceeb75`'s recorded trace, the redirection fires
// eleven times from iteration 11 of 34 -- the first of them before two thirds
// of that run's wasted work -- and the stop above is reached at iteration 32.
// The replay is of the trace as recorded, so everything after the first
// redirection is a run that would not have happened the same way; what it
// establishes is that both thresholds are reachable on real traces, which
// twenty-four was not.
export const AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_REDIRECT_AT_STEPS_WITHOUT_PROGRESS = 3;
