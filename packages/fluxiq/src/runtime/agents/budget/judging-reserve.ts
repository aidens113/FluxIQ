// Judging, kept back from every call that is not a judge's (t254, `./purse.ts`).
//
// A build with a judge ends every round by judging its Flow, a pair of calls (a
// first answer, then a second that confirms a yes or asks a non-yes again).
// `run-murzln6g` spent $0.089 of $0.10 over thirty exploration decisions and
// reached its judgement with nothing left for a repair. So once the build's
// phases ask for it (`keepBackForJudging`), every call that is not a judge's --
// each decision, the instruction reading -- is held as if the judging pair were
// already in flight: refused when what is spent, what is in flight, the judging
// pair and its own worst case would cross the ceiling. A judge's call draws on
// that reserve rather than leaving it. The pair is held at the largest judge
// call priced so far, or, before any has been, at the provider's price for the
// standing judge allowance the phases name. The reserve is never charged: spend
// is still only what calls settle at, so it shows in no accounting, only in
// what the loop is told is left (`../loop-budget.ts`) and in a refusal's
// `keptBackUsd`.

import type { AutomationStudioLlmBuildPurseCall, AutomationStudioLlmBuildPurseJudging, AutomationStudioLlmBuildPursePrice } from "./types.ts";

export class AutomationStudioLlmBuildPurseJudgingReserve {
  /** Judging kept back from every other call, once the build's phases ask for it. */
  private judging: AutomationStudioLlmBuildPurseJudging | undefined;
  /** The largest worst case of a judge call priced on the purse: what each judge call of the reserve is held at. */
  private largestJudgeHoldUsd: number | undefined;
  /** The provider's price, from the last call that brought one. */
  private price: AutomationStudioLlmBuildPursePrice | undefined;

  /** Keep `judging` back from every call that is not a judge's, from now on. */
  keepBack(judging: AutomationStudioLlmBuildPurseJudging): void {
    this.judging = { calls: judging.calls, unpriced: { ...judging.unpriced } };
  }

  /** Whether anything is kept back. */
  isKept(): boolean {
    return this.judging !== undefined;
  }

  /** The judge calls kept back; none when nothing is. */
  calls(): number {
    return this.judging?.calls ?? 0;
  }

  /** Learn from a call about to be held: the provider's price it brings, and, as a judge's, its worst case. */
  note(call: AutomationStudioLlmBuildPurseCall): void {
    if (call.price) this.price = call.price;
    const projected = call.projectedCostUsd;
    if (call.judge && projected !== undefined) this.largestJudgeHoldUsd = Math.max(this.largestJudgeHoldUsd ?? 0, projected);
  }

  /** The provider's price, at the rate in force now, for a request of `inputTokens` and a reply of `outputTokens`, all uncached; `undefined` before any call brought a price, or where it prices nonsense. */
  priceUsd(inputTokens: number, outputTokens: number): number | undefined {
    let priced: number | undefined;
    try {
      priced = this.price?.(inputTokens, outputTokens);
    } catch {
      priced = undefined;
    }
    return typeof priced === "number" && Number.isFinite(priced) && priced > 0 ? priced : undefined;
  }

  /** What judging is held at; `undefined` where nothing is kept back or nothing can be priced. */
  holdUsd(): number | undefined {
    if (!this.judging) return undefined;
    const each = this.largestJudgeHoldUsd ?? this.priceUsd(this.judging.unpriced.inputTokens, this.judging.unpriced.outputTokens);
    return each === undefined ? undefined : this.judging.calls * each;
  }
}
