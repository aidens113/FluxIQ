import { AUTOMATION_STUDIO_EXPLORATION_DEFAULT_MAX_STEPS_WITHOUT_PROGRESS } from "./limit.ts";
import type { AutomationStudioExplorationNoProgressReason } from "./reason.ts";
import type { AutomationStudioExplorationProgressStep } from "./step.ts";
import type { AutomationStudioExplorationProgressVerdict } from "./verdict.ts";

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
    return this.unadvanced(reason);
  }

  /**
   * Judge a decision call that came back unusable.
   *
   * It joins the same streak as a barren action, and deliberately so: the
   * question is whether the last few steps did anything, and a reply that could
   * not be used did nothing. It asked for nothing, so it leaves the request and
   * evidence records alone and cannot make a later step read as a repeat.
   */
  recordUnusableDecision(): Extract<AutomationStudioExplorationProgressVerdict, { advanced: false }> {
    return this.unadvanced("unusable_decision");
  }

  private unadvanced(reason: AutomationStudioExplorationNoProgressReason): Extract<AutomationStudioExplorationProgressVerdict, { advanced: false }> {
    this.streak += 1;
    this.streakReason = reason;
    return { advanced: false, reason, stalled: this.streak >= this.limit };
  }
}
