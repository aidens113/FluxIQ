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
// **One purse per Flow creation, and the only cost authority (t234).** The
// user's limit is a Flow's: $0.10 (FLUXIQ_LLM_RUN_COST_CEILING_USD) for
// creating it. Two counts used to stop a build -- this purse and the loop's own
// count of decisions left (`../loop-budget.ts`), which held back an extra
// average decision and stopped `run-muqbzu32-8691a65e` with $0.026 unspent and
// no figures -- and every round, the judge and every later build each started
// from a fresh share. Now one purse is opened for a build with what earlier
// builds of the same Flow creation spent (`carriedUsd`), every call the build
// makes is held against it (`./run.ts`, `automationStudioLlmBuildPurseScope`):
// the instruction reading, each round's decisions, the test and the judge. The
// loop's count only tells the model what is left; a refusal here is the only
// cost ending.
//
// A provider that does not price leaves nothing to project. Such a call is held
// at the most any call on this purse has reported costing -- a measured figure,
// nothing until one has reported -- so a run of like calls stops before the one
// that would cross the ceiling, not after it. The loop's own count used to stop
// such a build first, and with that count gone the purse is what holds it
// (t234: a refuted result's repair ladder spent $0.12 of $0.10 without it).
// Holding it at the whole ceiling instead would refuse every call after the
// first one that cost anything.

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
  /** What earlier builds of the same Flow creation had spent, included in `spentUsd`. Absent when none. */
  carriedUsd?: number;
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
  /**
   * What earlier builds of the same Flow creation already spent from this
   * ceiling (`../../flow-bootstrap/creation-spend/`). One purse covers a Flow's
   * creation -- every build of it, their tests, judges and repairs, until the
   * Flow is proposed or declared not doable -- so building again carries the
   * spend on rather than starting a fresh ceiling.
   */
  carriedUsd?: number;
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
  /** What earlier builds of the same Flow creation spent: part of `spentUsd`, never charged again. */
  readonly carriedUsd: number;
  private settledUsd = 0;
  /** The most any call settled on this purse reported costing: what an unpriced call is held at. */
  private largestReportedUsd = 0;
  private readonly pending = new Map<number, number>();
  private holds = 0;

  constructor(private readonly options: AutomationStudioLlmBuildPurseOptions) {
    if (!Number.isFinite(options.ceilingUsd) || options.ceilingUsd < 0) throw new Error("A build purse's ceiling must be a finite, non-negative amount.");
    const carried = options.carriedUsd ?? 0;
    if (!Number.isFinite(carried) || carried < 0) throw new Error("A build purse's carried spend must be a finite, non-negative amount.");
    this.ceilingUsd = options.ceilingUsd;
    this.carriedUsd = carried;
  }

  /** What the Flow's creation has spent: what earlier builds carried, plus this build's accounting or settled calls, whichever is larger. */
  spentUsd(): number {
    const reported = this.options.spentUsd?.() ?? 0;
    return this.carriedUsd + Math.max(this.settledUsd, Number.isFinite(reported) ? reported : 0);
  }

  /** What calls in flight are held at. */
  pendingUsd(): number {
    return [...this.pending.values()].reduce((sum, held) => sum + held, 0);
  }

  /** What is left of the ceiling once what was spent and what is held are taken out; never below nothing. */
  leftUsd(): number {
    return Math.max(0, this.ceilingUsd - this.spentUsd() - this.pendingUsd());
  }

  /**
   * Hold a call's worst case, or refuse it. `projectedCostUsd` is the call's
   * worst case (`./projected-cost.ts`); `undefined` means the provider does not
   * price, and the call is held at the most any call here has reported costing,
   * or refused only once nothing is left while none has.
   */
  hold(call: { projectedCostUsd: number | undefined; estimatedInputTokens: number; maxOutputTokens: number }): { ok: true; hold: AutomationStudioLlmBuildPurseHold } | { ok: false; refusal: AutomationStudioLlmBuildPurseRefusal } {
    const spentUsd = this.spentUsd();
    const pendingUsd = this.pendingUsd();
    const projected = call.projectedCostUsd;
    if (projected !== undefined) this.lastProjectedCostUsd = projected;
    const heldUsd = projected ?? this.largestReportedUsd;
    const over = heldUsd > 0
      ? spentUsd + pendingUsd + heldUsd > this.ceilingUsd + EPSILON_USD
      : spentUsd + pendingUsd >= this.ceilingUsd;
    if (over) {
      this.refusal = {
        code: "llm_budget.run_cost_limit",
        ...(projected !== undefined ? { projectedCostUsd: projected } : {}),
        estimatedInputTokens: call.estimatedInputTokens,
        maxOutputTokens: call.maxOutputTokens,
        spentUsd,
        pendingUsd,
        ceilingUsd: this.ceilingUsd,
        ...(this.carriedUsd > 0 ? { carriedUsd: this.carriedUsd } : {})
      };
      return { ok: false, refusal: this.refusal };
    }
    const id = this.holds += 1;
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
          if (valid) this.largestReportedUsd = Math.max(this.largestReportedUsd, reported);
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
