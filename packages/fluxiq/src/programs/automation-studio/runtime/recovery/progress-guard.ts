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
// Three ways it can fail to, and they are kept apart because they are three
// different pieces of advice. `repeated_request` is the model asking for
// something it has already asked for -- the evidence loop refuses an identical
// request inside one mutation epoch, and this is the cycle that spans several.
// `repeated_evidence` is a *different* request that came back with an answer
// already held, which is the one nothing else here can see. `no_new_evidence`
// is a step that returned nothing usable at all, refusal included.
//
// **The streak resets.** A guard that counted unproductive steps for the whole
// exploration would stop a loop that spent two turns finding its feet and then
// worked, which is most of them. Only consecutive failures to advance count, so
// the guard fires on a loop that is stuck rather than on one that was slow.

/**
 * Why a step did not advance the exploration. Three reasons rather than one
 * boolean: they are three different things for an operator to do about it.
 */
export const AUTOMATION_STUDIO_EXPLORATION_NO_PROGRESS_REASONS = Object.freeze([
  /** The same request, already made. A cycle the mutation-epoch check cannot see. */
  "repeated_request",
  /** A new request that returned an answer the loop already held. */
  "repeated_evidence",
  /** The step returned nothing usable: empty, or refused. */
  "no_new_evidence"
] as const);

export type AutomationStudioExplorationNoProgressReason = (typeof AUTOMATION_STUDIO_EXPLORATION_NO_PROGRESS_REASONS)[number];

/**
 * Consecutive steps that may fail to advance before the exploration is stopped.
 *
 * Three, not one: a single barren step is ordinary -- an observation that finds
 * the thing absent is a finding -- and a refusal is meant to be feedback the
 * model acts on. Three in a row is a loop that has stopped responding to what
 * it is being told.
 */
export const AUTOMATION_STUDIO_EXPLORATION_DEFAULT_MAX_STEPS_WITHOUT_PROGRESS = 3;

export type AutomationStudioExplorationProgressStep = {
  /** What the step did and with what, independent of call id. */
  signature: string;
  /** A digest of what came back, so a repeat is recognised by content. */
  evidenceDigest: string;
  /** Bytes of evidence the step actually carried. Zero is not an answer. */
  evidenceBytes: number;
  /** Whether the domain refused it. A refusal never counts as progress. */
  refused: boolean;
};

export type AutomationStudioExplorationProgressVerdict =
  | { advanced: true }
  | {
    advanced: false;
    reason: AutomationStudioExplorationNoProgressReason;
    /** True once the streak has reached the limit: the loop should stop. */
    stalled: boolean;
  };

/**
 * One exploration's progress, and the verdict on each step it takes.
 *
 * Deliberately knows nothing about aborting, budgets or outcomes. It is handed
 * a step and answers whether that step advanced anything; the budget ledger
 * owns what to do about the answer, because the ledger is the one place that
 * records why an exploration stopped.
 */
export class AutomationStudioExplorationProgressGuard {
  private readonly limit: number;
  private readonly signatures = new Set<string>();
  private readonly digests = new Set<string>();
  private streak = 0;
  private streakReason: AutomationStudioExplorationNoProgressReason | undefined;

  constructor(input: { maxStepsWithoutProgress: number }) {
    this.limit = Math.max(1, Math.trunc(Number.isFinite(input.maxStepsWithoutProgress) ? input.maxStepsWithoutProgress : AUTOMATION_STUDIO_EXPLORATION_DEFAULT_MAX_STEPS_WITHOUT_PROGRESS));
  }

  /** How many steps in a row have failed to advance. Zero after any that did. */
  get stepsWithoutProgress(): number {
    return this.streak;
  }

  /** Why the current streak is a streak, or absent while the loop is advancing. */
  get reason(): AutomationStudioExplorationNoProgressReason | undefined {
    return this.streakReason;
  }

  /**
   * Judge one completed step.
   *
   * The order of the three checks is the order of how much they explain. A
   * request already made is the clearest thing to report even when the answer
   * also happens to be empty, so it is tested first; a step that carried
   * nothing is next, because a digest of nothing says nothing; and a genuinely
   * new request that returned a held answer is last.
   */
  record(step: AutomationStudioExplorationProgressStep): AutomationStudioExplorationProgressVerdict {
    const repeatedRequest = this.signatures.has(step.signature);
    this.signatures.add(step.signature);
    const barren = step.refused || !(step.evidenceBytes > 0);
    const repeatedEvidence = !barren && this.digests.has(step.evidenceDigest);
    if (!barren) this.digests.add(step.evidenceDigest);
    const reason: AutomationStudioExplorationNoProgressReason | undefined = repeatedRequest
      ? "repeated_request"
      : barren
        ? "no_new_evidence"
        : repeatedEvidence
          ? "repeated_evidence"
          : undefined;
    if (!reason) {
      this.streak = 0;
      this.streakReason = undefined;
      return { advanced: true };
    }
    this.streak += 1;
    this.streakReason = reason;
    return { advanced: false, reason, stalled: this.streak >= this.limit };
  }
}

/**
 * A short, stable digest of what a step returned.
 *
 * FNV-1a over the canonical text, with the byte length carried alongside. Not a
 * cryptographic hash and not trying to be: nothing here is a security boundary,
 * the question is only "have I seen this answer before", and the alternative --
 * keeping every evidence payload an exploration ever collected so they can be
 * compared whole -- is a quarter of a megabyte per step held for the sake of an
 * equality check.
 */
export function automationStudioExplorationEvidenceDigest(canonicalText: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < canonicalText.length; index += 1) {
    hash ^= canonicalText.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${canonicalText.length}:${hash.toString(16)}`;
}
