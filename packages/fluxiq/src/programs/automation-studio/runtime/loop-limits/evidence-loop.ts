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
