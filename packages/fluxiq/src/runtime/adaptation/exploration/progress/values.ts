// Whether a loop that is still allowed to run is still getting anywhere.
//
// Every other bound on an adaptation answers "may it spend more": the run
// budget answers it in money and tokens, the recovery deadline answers it in
// time, the exploration ledger answers it in actions. None of them answers the
// question that actually decides whether another provider call is worth making,
// which is whether the last few did anything.
//
// That question used to be answered by a small call ceiling. It is the wrong
// answer twice over. A loop that is genuinely working through a problem is cut
// off at two calls, and a loop that has been asking the same thing since its
// first call is allowed both of them. Counting calls cannot tell the two apart,
// because the number of calls is not what distinguishes them.
//
// So the ceiling goes and this takes its place: the loop runs for as long as it
// keeps learning something, and stops when it stops. That is what makes
// removing the call caps safe, and it is the only one of the four guards that
// can report "it was going in circles" rather than "it ran out".
//
// **A step advances when it produces something the loop did not already have.**
// Four ways it can fail to, and they are kept apart because they are four
// different pieces of advice. `repeated_request` is the model asking for
// something it has already asked for -- the evidence loop refuses an identical
// request inside one mutation epoch, and this is the cycle that spans several.
// `repeated_evidence` is a *different* request that came back with an answer
// already held, which is the one nothing else here can see. `no_new_evidence`
// is a step that returned nothing usable at all, refusal included.
// `unusable_decision` is a provider call that was made and paid for and came
// back as nothing the loop could act on -- a malformed reply, a timeout -- which
// is a step that did not advance, not a reason to end the exploration outright.
//
// **The streak resets.** A guard that counted unproductive steps for the whole
// exploration would stop a loop that spent two turns finding its feet and then
// worked, which is most of them. Only consecutive failures to advance count, so
// the guard fires on a loop that is stuck rather than on one that was slow.

/**
 * Why a step did not advance the exploration. Four reasons rather than one
 * boolean: they are four different things for an operator to do about it.
 */
export const AUTOMATION_STUDIO_EXPLORATION_NO_PROGRESS_REASONS = Object.freeze([
  /** The same request, already made. A cycle the mutation-epoch check cannot see. */
  "repeated_request",
  /** A new request that returned an answer the loop already held. */
  "repeated_evidence",
  /** The step returned nothing usable: empty, or refused. */
  "no_new_evidence",
  /** The provider was asked what to do next and its answer could not be used. */
  "unusable_decision"
] as const);
