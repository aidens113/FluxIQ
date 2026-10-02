// A build's purse: its cost ceiling, held against every call before it is sent.
//
// **Why a build needs one of its own.** A build has no run ledger
// (`../run-budget.ts`); its ceiling -- $0.25, or the Flow's lower setting -- was
// held only by the loop's arithmetic (`../loop-budget.ts`), which counts
// decisions left at the *average* reported cost of the ones before. Reported
// costs are cache-discounted and the request grows every decision, so the
// average says nothing about the next call. On `run-mup2u8o3-6697c4be` eight
// decisions averaged $0.019; the ninth was sent with $0.154 spent, re-read
// 475,714 of its 477,506 input tokens uncached, and cost $0.1429: $0.297 against
// $0.25, and nothing in Core counted it as a breach.
//
// So before a call goes out its worst case is projected from the request
// actually about to be sent (`./projected-cost.ts`, priced by the harness from
// its own measure of that request), and a call that would take what was spent,
// what is in flight and its own worst case past the ceiling is refused, never
// sent. A call that then reports costing more than it was held at is a breach,
// counted, because the projection is meant to be the most it can cost.
//
// A provider that does not price leaves nothing to project. Such a call is held
// at nothing and refused only once the purse is already spent; holding it at
// the whole ceiling instead would refuse every call after the first one that
// cost anything.

import type { AutomationStudioLlmUsageSummary } from "../harness/index.ts";

/** Why a call was not sent, in figures. */
export type AutomationStudioLlmBuildPurseRefusal = {
  code: "llm_budget.run_cost_limit";
  /** The call's worst case: every input token uncached, its whole reply allowance. Absent where the provider does not price. */
  projectedCostUsd?: number;
  estimatedInputTokens: number;
  maxOutputTokens: number;
  /** What the build had spent when the call was refused. */
  spentUsd: number;
  /** What calls still in flight were held at. */
  pendingUsd: number;
  ceilingUsd: number;
  /**
   * Absent for the purse's own refusal (`hold`). `"loop_budget"` where the
   * loop's count of decisions left (`../loop-budget.ts`) stopped before the
   * call reached the purse (`standing`): the call was never priced, so
   * `projectedCostUsd`, `estimatedInputTokens` and `maxOutputTokens` are the
   * last call priced -- the least the next, larger request can cost at worst --
   * and the tokens are zero where nothing was priced. `run-muqbzu32-8691a65e`
   * ended that way with $0.074 of $0.10 spent and said no figures (t194-w47).
   */
  declinedBy?: "loop_budget";
};

/** One call's hold on the purse, settled once by whichever comes first. */
export type AutomationStudioLlmBuildPurseHold = {
  /** The call was made: charge what it reported, or what it was held at when it reported nothing. */
  settle(usage?: AutomationStudioLlmUsageSummary): void;
  /** The call was never sent: charge nothing. */
  release(): void;
};

export type AutomationStudioLlmBuildPurseOptions = {
  /** The most the build may spend from here. */
  ceilingUsd: number;
  /**
   * What the build's own accounting says it has spent, where it keeps one. The
   * purse charges the larger of this and what its own calls settled at, so a
   * call the accounting saw and the purse did not is never forgotten, and one
   * both saw is never charged twice.
   */
  spentUsd?: () => number;
  /** Told of each call that reported costing more than it was held at. */
  onBreach?: () => void;
};

/** Floating-point slack, so a call that lands exactly on the ceiling is allowed. */
const EPSILON_USD = 1e-9;

export class AutomationStudioLlmBuildPurse {
  readonly ceilingUsd: number;
  /** Calls that reported costing more than they were held at. */
  breaches = 0;
  /** The last call this purse refused; cleared before each call `./run.ts` wraps. */
  refusal: AutomationStudioLlmBuildPurseRefusal | undefined;
  /** The worst case of the last call it priced: the least the next, larger request can cost at worst. */
  lastProjectedCostUsd: number | undefined;
  private lastPriced: { estimatedInputTokens: number; maxOutputTokens: number } | undefined;
  private settledUsd = 0;
  private readonly pending = new Map<number, number>();
  private holds = 0;

  constructor(private readonly options: AutomationStudioLlmBuildPurseOptions) {
    if (!Number.isFinite(options.ceilingUsd) || options.ceilingUsd < 0) throw new Error("A build purse's ceiling must be a finite, non-negative amount.");
    this.ceilingUsd = options.ceilingUsd;
  }

  /** What the build has spent: its accounting's figure or its settled calls', whichever is larger. */
  spentUsd(): number {
    const reported = this.options.spentUsd?.() ?? 0;
    return Math.max(this.settledUsd, Number.isFinite(reported) ? reported : 0);
  }

  /** What calls in flight are held at. */
  pendingUsd(): number {
    return [...this.pending.values()].reduce((sum, held) => sum + held, 0);
  }

  /**
   * Where the purse stands, in a refusal's figures, for a call something other
   * than the purse declined to send (`declinedBy`): what was spent and held,
   * and the last call's worst case. Information only: it holds and refuses
   * nothing.
   */
  standing(): AutomationStudioLlmBuildPurseRefusal {
    return {
      code: "llm_budget.run_cost_limit",
      ...(this.lastProjectedCostUsd !== undefined ? { projectedCostUsd: this.lastProjectedCostUsd } : {}),
      estimatedInputTokens: this.lastPriced?.estimatedInputTokens ?? 0,
      maxOutputTokens: this.lastPriced?.maxOutputTokens ?? 0,
      spentUsd: this.spentUsd(),
      pendingUsd: this.pendingUsd(),
      ceilingUsd: this.ceilingUsd,
      declinedBy: "loop_budget"
    };
  }

  /**
   * Hold a call's worst case, or refuse it. `projectedCostUsd` is the call's
   * worst case (`./projected-cost.ts`); `undefined` means the provider does not
   * price, and the call is refused only once nothing is left.
   */
  hold(call: { projectedCostUsd: number | undefined; estimatedInputTokens: number; maxOutputTokens: number }): { ok: true; hold: AutomationStudioLlmBuildPurseHold } | { ok: false; refusal: AutomationStudioLlmBuildPurseRefusal } {
    const spentUsd = this.spentUsd();
    const pendingUsd = this.pendingUsd();
    const projected = call.projectedCostUsd;
    if (projected !== undefined) {
      this.lastProjectedCostUsd = projected;
      this.lastPriced = { estimatedInputTokens: call.estimatedInputTokens, maxOutputTokens: call.maxOutputTokens };
    }
    const over = projected !== undefined
      ? spentUsd + pendingUsd + projected > this.ceilingUsd + EPSILON_USD
      : spentUsd + pendingUsd >= this.ceilingUsd;
    if (over) {
      this.refusal = {
        code: "llm_budget.run_cost_limit",
        ...(projected !== undefined ? { projectedCostUsd: projected } : {}),
        estimatedInputTokens: call.estimatedInputTokens,
        maxOutputTokens: call.maxOutputTokens,
        spentUsd,
        pendingUsd,
        ceilingUsd: this.ceilingUsd
      };
      return { ok: false, refusal: this.refusal };
    }
    const id = this.holds += 1;
    const heldUsd = projected ?? 0;
    this.pending.set(id, heldUsd);
    let settled = false;
    return {
      ok: true,
      hold: {
        settle: (usage) => {
          if (settled) return;
          settled = true;
          this.pending.delete(id);
          const reported = usage?.estimatedCostUsd;
          const valid = typeof reported === "number" && Number.isFinite(reported) && reported >= 0;
          this.settledUsd += valid ? reported : heldUsd;
          if (valid && projected !== undefined && reported > heldUsd + EPSILON_USD) {
            this.breaches += 1;
            this.options.onBreach?.();
          }
        },
        release: () => {
          if (settled) return;
          settled = true;
          this.pending.delete(id);
        }
      }
    };
  }
}
