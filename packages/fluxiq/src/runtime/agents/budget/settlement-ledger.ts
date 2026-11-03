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
import type { ModelExecutionOptions } from "../../models/execution/index.ts";
import type { ExecutionCallbackCall } from "../../execution-observation/index.ts";
import { prepareObservedExecutionCallback } from "../../execution-observation/owned/index.ts";
import { ExecutionCallbackPolicies } from "../../execution-observation/policies/index.ts";

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
  hold(heldUsd: number, projected: number | undefined, judge = false, execution?: ModelExecutionOptions): AutomationStudioLlmBuildPurseHold {
    const callHold = this.calls.hold();
    const id = this.holds += 1;
    this.pending.set(id, heldUsd);
    const observation = execution?.observation;
    let settled = false;
    let legacy = false;
    let released = false;
    let observed: Promise<void> | undefined;
    const commit = (usage: Parameters<AutomationStudioLlmBuildPurseHold["settle"]>[0], notify: NonNullable<AutomationStudioLlmBuildPurseOptions["onSettled"]>, breached: () => void): void => {
      if (settled) return;
      settled = true;
      this.pending.delete(id);
      callHold.settle();
      const reported = usage?.estimatedCostUsd;
      const valid = typeof reported === "number" && Number.isFinite(reported) && reported >= 0;
      const chargedUsd = valid ? reported : heldUsd;
      if (!valid && chargedUsd === 0) this.unreportedZeroChargeCalls += 1;
      this.settled += chargedUsd;
      notify(chargedUsd, { judge, inputTokens: inputTokensOf(usage) });
      if (valid) this.largestReported = Math.max(this.largestReported, reported);
      if (valid && projected !== undefined && reported > heldUsd + AUTOMATION_STUDIO_LLM_BUILD_PURSE_EPSILON_USD) {
        this.breaches += 1;
        this.overshootUsd += reported - heldUsd;
        breached();
      }
    };
    const hold: AutomationStudioLlmBuildPurseHold = {
      settle: (usage) => {
        if (settled) return;
        legacy = true;
        commit(usage, (charged, call) => this.events.onSettled?.(charged, call), () => this.events.onBreach?.());
      },
      settleObserved: (usage, current) => {
        if (current?.observation && current.observation !== observation) return Promise.reject(new Error("llm_budget.foreign_settlement_observation"));
        if (observed) return observed;
        if (released) return Promise.resolve();
        if (legacy) return observation ? Promise.reject(new Error("llm_budget.settlement_already_unobserved")) : Promise.resolve();
        let resolve!: () => void;
        let reject!: (error: unknown) => void;
        observed = new Promise<void>((fulfilled, rejected) => {
          resolve = fulfilled;
          reject = rejected;
        });
        let notification: Parameters<NonNullable<AutomationStudioLlmBuildPurseOptions["onSettled"]>> | undefined;
        let breach = false;
        let onSettled: AutomationStudioLlmBuildPurseOptions["onSettled"];
        let onBreach: AutomationStudioLlmBuildPurseOptions["onBreach"];
        try {
          onSettled = this.events.onSettled;
          onBreach = this.events.onBreach;
          commit(usage, (charged, call) => { notification = [charged, call]; }, () => { breach = true; });
        } catch (error) {
          reject(error);
          return observed;
        }
        const work = async (): Promise<void> => {
          const failures: unknown[] = [];
          if (onSettled && notification) {
            const carrier: ModelExecutionOptions = {};
            const args: Parameters<NonNullable<AutomationStudioLlmBuildPurseOptions["onSettled"]>> = observation ? [notification[0], notification[1], carrier] : [notification[0], notification[1]];
            try {
              await invokeSettlementCallback(observation, { receiver: this.events, callback: onSettled, args }, carrier);
            } catch (error) {
              failures.push(error);
            }
          }
          if (onBreach && breach) {
            try {
              await invokeSettlementCallback(observation, { receiver: this.events, callback: onBreach, args: [] });
            } catch (error) {
              failures.push(error);
            }
          }
          if (failures.length === 1) throw failures[0];
          if (failures.length > 1) throw new AggregateError(failures, "Owned settlement callbacks failed.", { cause: failures[0] });
        };
        void Promise.resolve().then(work).then(resolve, reject);
        return observed;
      },
      release: () => {
        if (settled) return;
        settled = true;
        released = true;
        this.pending.delete(id);
        callHold.release();
      }
    };
    ExecutionCallbackPolicies.remember(hold, hold.settleObserved!, "frame");
    ExecutionCallbackPolicies.remember(hold, hold.release, "pure");
    return hold;
  }
}

async function invokeSettlementCallback<TReceiver, TArguments extends unknown[], TResult>(observation: ModelExecutionOptions["observation"], call: ExecutionCallbackCall<TReceiver, TArguments, TResult>, carrier?: ModelExecutionOptions): Promise<void> {
  const owned = await prepareObservedExecutionCallback(observation, call);
  if (carrier) {
    if (owned.observation) Object.defineProperty(carrier, "observation", { value: owned.observation, enumerable: true });
    Object.freeze(carrier);
  }
  let primary: { error: unknown } | undefined;
  try {
    await owned.invoke();
    if (observation && owned.completion() !== "settled") {
      if (owned.completion() !== "unknown") owned.unknown();
      throw new Error("llm_budget.settlement_callback_unverified");
    }
  } catch (error) {
    primary = { error };
  }
  try {
    await owned.flush();
  } catch (error) {
    if (primary && primary.error !== error) throw new AggregateError([primary.error, error], "Settlement callback and observation drain failed.", { cause: primary.error });
    throw error;
  }
  if (primary) throw primary.error;
}

/** The input tokens a settled call reported, or `null` when it reported no whole count. */
function inputTokensOf(usage: { inputTokens?: number } | undefined): number | null {
  const tokens = usage?.inputTokens;
  return Number.isSafeInteger(tokens) && (tokens as number) >= 0 ? tokens as number : null;
}
