// What one purse has charged and what it holds in flight: each call's hold,
// settled once by whichever of settle or release comes first (`./purse.ts`).
//
// **A reply is held at a reserve, not a cap (user, 2026-10-03, t254).** No
// request sends `max_tokens`, so a call's hold is its sent input all uncached,
// at the rate in force when it is held, plus the largest reply observed for its
// kind with a margin (`./build-call-reserves.ts`). The hold is no longer a
// proof: a reply longer than its reserve costs more than it was held at, and the
// Flow's ceiling can be crossed -- only by the part of that one reply beyond its
// reservation, since calls are held one at a time and nothing fits once one has
// overshot. Each such call is a breach, its overshoot added to `overshootUsd`,
// and both reach the loop's accounting (`../evidence-loop/cost-purse.ts`). What
// a settled call is charged is what the provider billed: its cached input at
// the cached rate and off-peak calls at half (`../deepseek/pricing.ts`).

import { AutomationStudioLlmBuildCallAllowance } from "./call-allowance.ts";
import { AUTOMATION_STUDIO_LLM_BUILD_PURSE_EPSILON_USD } from "./epsilon.ts";
import type { AutomationStudioLlmBuildPurseHold, AutomationStudioLlmBuildPurseOptions } from "./types.ts";

export class AutomationStudioLlmBuildPurseLedger {
  /** Settled calls whose zero charge came from an unpriced hold, never a reported free call. */
  unreportedZeroChargeCalls = 0;
  /** Calls that reported costing more than they were held at. */
  breaches = 0;
  /** What those calls cost beyond their holds, summed. */
  overshootUsd = 0;
  /** The purse's logical-question slots, held and settled with each call. */
  readonly calls: AutomationStudioLlmBuildCallAllowance;
  private settled = 0;
  /** The most any settled call reported costing. */
  private largestReported = 0;
  private readonly pending = new Map<number, number>();
  private holds = 0;

  constructor(maxCalls: number | undefined, private readonly events: Pick<AutomationStudioLlmBuildPurseOptions, "onSettled" | "onBreach">) {
    this.calls = new AutomationStudioLlmBuildCallAllowance(maxCalls);
  }

  /** What settled calls were charged, summed. */
  settledUsd(): number {
    return this.settled;
  }

  /** The most any settled call reported costing: what an unpriced call is held at. */
  largestReportedUsd(): number {
    return this.largestReported;
  }

  /** What calls in flight are held at. */
  pendingUsd(): number {
    return [...this.pending.values()].reduce((sum, held) => sum + held, 0);
  }

  /** Put `heldUsd` in flight, settled once by whichever comes first; `projected` is the call's priced worst case, without which no overshoot is a breach; `judge` says the call is a judge's, which `onSettled` is told. */
  hold(heldUsd: number, projected: number | undefined, judge = false): AutomationStudioLlmBuildPurseHold {
    const callHold = this.calls.hold();
    const id = this.holds += 1;
    this.pending.set(id, heldUsd);
    let settled = false;
    return {
      settle: (usage) => {
        if (settled) return;
        settled = true;
        this.pending.delete(id);
        callHold.settle();
        const reported = usage?.estimatedCostUsd;
        const valid = typeof reported === "number" && Number.isFinite(reported) && reported >= 0;
        const chargedUsd = valid ? reported : heldUsd;
        if (!valid && chargedUsd === 0) this.unreportedZeroChargeCalls += 1;
        this.settled += chargedUsd;
        this.events.onSettled?.(chargedUsd, { judge });
        if (valid) this.largestReported = Math.max(this.largestReported, reported);
        if (valid && projected !== undefined && reported > heldUsd + AUTOMATION_STUDIO_LLM_BUILD_PURSE_EPSILON_USD) {
          this.breaches += 1;
          this.overshootUsd += reported - heldUsd;
          this.events.onBreach?.();
        }
      },
      release: () => {
        if (settled) return;
        settled = true;
        this.pending.delete(id);
        callHold.release();
      }
    };
  }
}
