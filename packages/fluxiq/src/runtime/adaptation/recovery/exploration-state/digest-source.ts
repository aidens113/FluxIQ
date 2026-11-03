// What "the state" is for an exploration, and the hook whoever owns the medium
// answers it through.
//
// The reduction in `runtime/exploration-reduction/` is a statement about a
// chain of state digests: it keeps the step that produced the state success was
// observed in, and drops the step whose state came back to where it started.
// Core cannot compute such a digest. It does not know what is being automated,
// and the one digest the exploration already computes --
// `automationStudioExplorationEvidenceDigest`, inside the budget ledger -- is a
// digest of *what the step said*, not of *what the world was*. Those are
// different facts and they disagree in both directions: a step can return the
// same bytes twice having changed something both times, and a step can return
// new bytes having changed nothing. So the digest comes from outside, through
// this hook, once before each step and once after it.
//
// ## The digest contract
//
// **A digest must be stable across a step that changed nothing the automation
// depends on, and different after a step that did.** That is the whole of it,
// and both halves are load-bearing:
//
//   - *Too coarse* -- equal digests either side of a step that did change
//     something the automation depends on -- and the reduction reads that step
//     as `changed_nothing` and drops it. The "minimum sequence" then leaves out
//     the step the success actually depended on, and replaying it does nothing.
//
//   - *Too fine* -- digests that differ when nothing the automation depends on
//     changed -- and two things break. An undo stops being recognisable: the
//     reduction spots a reversal only by the state coming back to a value it
//     already held, so a digest that carries a counter, a clock, a recency
//     ranking or "how this page was reached" never comes back, the wrong step
//     and its undo are both kept, and nothing is reduced. And the precondition,
//     which is equality on the digest, then names a state that will never
//     occur again, so a replay that would have worked is refused.
//
// The practical test for an implementer is one question per field: *if this
// were the only thing that differed between two moments, would the same
// sequence of actions do the same thing?* If yes, the field is noise and must
// stay out of the digest. If no, it belongs in.
//
// Two consequences worth stating plainly.
//
// **The digest is opaque and is only ever compared for equality.** Core never
// parses it, never orders it and never reads a field out of it, so its
// spelling is entirely the implementer's business. It must be deterministic for
// one state: two digests of the same unchanged world must be byte-identical,
// which rules out anything derived from a timestamp, a random id or an
// iteration counter.
//
// **The "after" of one step and the "before" of the next are asked for
// separately, and deliberately.** They will usually be equal, and the reduction
// reports `stateChainIntact: false` when they are not -- something moved the
// state between two steps, so the reduction may be missing a step that
// mattered. Deriving one from the other would make that check vacuous and turn
// a doubt Core can report into a silence.
//
// **It is computed from what has already been sanitized.** The digest exists to
// be compared, so a digest over raw, unsanitized material buys nothing and
// widens what leaves the domain. An implementer computes it from the packet it
// would have been willing to publish anyway.

/** Which side of a step a digest describes. */
export type AutomationStudioExplorationStateDigestPhase = "before" | "after";

/** The moment a digest is being asked for, named by the step it brackets. */
export type AutomationStudioExplorationStateDigestRequest = {
  /** The step's call id, the same one the exploration trace carries. */
  callId: string;
  /** Which action is about to run, or has just run. Opaque to Core. */
  toolId: string;
  phase: AutomationStudioExplorationStateDigestPhase;
  /** Cancellation, so a capture stops with the exploration rather than after it. */
  signal?: AbortSignal;
};

/**
 * How the caller answers what the state was at one moment.
 *
 * Returning nothing is the honest answer for a moment the caller could not
 * observe: the step is then recorded without digests, the reduction reports it
 * as a gap, and nothing is guessed at. Throwing is also allowed and is recorded
 * as a failure against that moment; it never fails the step, because a step
 * that ran and did something is a fact whether or not the bookkeeping around it
 * worked.
 */
export type AutomationStudioExplorationStateDigestSource = (
  request: AutomationStudioExplorationStateDigestRequest
) => Promise<string | undefined> | string | undefined;

/** One moment whose digest was asked for and came back as a thrown error. */
export type AutomationStudioExplorationStateDigestFailure = {
  callId: string;
  toolId: string;
  phase: AutomationStudioExplorationStateDigestPhase;
  /** What was thrown, as text. Never the state itself. */
  reason: string;
};
