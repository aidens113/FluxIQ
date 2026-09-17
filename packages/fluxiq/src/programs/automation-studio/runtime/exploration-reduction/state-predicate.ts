// What must be true of the state for a reduced sequence to apply, and what is
// true of it once the sequence has run.
//
// A reduction that is only a list of actions is not reusable: run it from the
// wrong starting state and it does something else, and there is no way to tell
// afterwards whether it worked. The two predicates are what turn the list into
// a fix -- a guard on the way in and a check on the way out.
//
// **Equality on an opaque digest is the only sound predicate here, and it is a
// strict one.** The caller hands the reducer one digest per moment, so the only
// question Core can answer about a state is whether it is the same state. That
// is exactly right as a postcondition -- the replay reached the state in which
// success was observed, or it did not -- and it is stricter than it should be
// as a precondition, because a digest over the whole state changes when
// anything at all in it changes, including things the reduced sequence does not
// depend on. Narrowing the precondition needs the caller to hand over the state
// as separable facts rather than one digest; that is a contract change upstream
// of here, and until it happens a precondition that is too strict refuses a
// replay that would have worked rather than admitting one that would not.

/**
 * A condition on one state, in the only vocabulary an opaque digest supports.
 *
 * `any_state` is not a weaker equality: it is what a reduction with nothing to
 * replay carries, and it says the sequence needs no particular state because it
 * does nothing.
 */
export type AutomationStudioExplorationStatePredicate =
  | { kind: "state_digest_equals"; digest: string }
  | { kind: "any_state" };

/** The predicate that nothing has to satisfy. */
export const AUTOMATION_STUDIO_EXPLORATION_ANY_STATE: AutomationStudioExplorationStatePredicate = Object.freeze({ kind: "any_state" });

/** The predicate that only one state satisfies. */
export function automationStudioExplorationStateDigestEquals(digest: string): AutomationStudioExplorationStatePredicate {
  return { kind: "state_digest_equals", digest };
}

/** Whether a state, given as its digest, satisfies the predicate. */
export function automationStudioExplorationStateSatisfies(
  predicate: AutomationStudioExplorationStatePredicate,
  digest: string
): boolean {
  return predicate.kind === "any_state" || predicate.digest === digest;
}
