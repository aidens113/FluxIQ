/**
 * What one message may spend, and has spent, in US dollars: the person's
 * per-message allowance (Settings), and every model call's billed cost,
 * counted as it is told, plus what the message's tool calls committed: the
 * dollars each call's endpoint declares it spends (`spends` on its assistant
 * declaration, read through `PanelAssistantPrograms.projectedCostUsd`), never
 * guessed from a field's name. The only bound on how long a message works
 * besides loop detection: no round or call is counted.
 */
export class PanelAssistantPurse {
  private spentUsd = 0;

  constructor(readonly allowanceUsd: number) {
    if (!Number.isFinite(allowanceUsd) || allowanceUsd < 0) throw new Error("A spending allowance is a number of dollars, zero or more.");
  }

  /** Adds what a call cost. A call with no price adds nothing. */
  paid(costUsd: number): void {
    if (Number.isFinite(costUsd) && costUsd > 0) this.spentUsd += costUsd;
  }

  get spent(): number {
    return this.spentUsd;
  }

  /** What is left, never below zero. */
  get remaining(): number {
    return Math.max(0, this.allowanceUsd - this.spentUsd);
  }

  /** Whether the allowance is used up: no further model call is made for this message. */
  get exhausted(): boolean {
    return this.spentUsd >= this.allowanceUsd;
  }
}
