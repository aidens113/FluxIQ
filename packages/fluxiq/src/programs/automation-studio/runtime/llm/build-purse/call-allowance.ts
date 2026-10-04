/** Independent logical-question slots: a pending hold cannot be sent twice. */
export class AutomationStudioLlmBuildCallAllowance {
  private spent = 0;
  private pending = 0;
  constructor(readonly maxCalls?: number) {
    if (maxCalls !== undefined && (!Number.isSafeInteger(maxCalls) || maxCalls < 1)) throw new Error("A build call allowance must be a positive safe integer.");
  }
  spentCalls(): number { return this.spent; }
  pendingCalls(): number { return this.pending; }
  canHold(keptBackCalls: number): boolean { return this.maxCalls === undefined || this.spent + this.pending + keptBackCalls < this.maxCalls; }
  hold(): { settle(): void; release(): void } {
    this.pending += 1;
    let ended = false;
    return {
      settle: () => { if (ended) return; ended = true; this.pending -= 1; this.spent += 1; },
      release: () => { if (ended) return; ended = true; this.pending -= 1; }
    };
  }
}
