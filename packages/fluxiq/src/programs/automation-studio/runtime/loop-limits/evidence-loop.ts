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

// The most actions one decision may list (`runtime/llm/evidence-batch/`).
//
// A decision used to name exactly one action, so every action was a paid
// provider round trip that re-sent the whole growing context. A decision may
// now list several, run in order in one turn. This bounds the list, not the
// run: the loop's tool-call ceiling above still counts every action, and one
// batch reports back in one evidence entry, whose size is held to the same
// context window a single result is. Sixteen is a form of a dozen fields and
// the controls around them, and past it the per-action outcome lines alone
// start to crowd the page evidence out of the window. A longer list is not
// refused: its first sixteen run and the rest are reported as not run.
export const AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_MAX_ACTIONS_PER_DECISION = 16;
