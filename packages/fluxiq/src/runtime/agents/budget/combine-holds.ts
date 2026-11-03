import type { AutomationStudioLlmUsageSummary } from "../../models/contracts/index.ts";
import type { ModelExecutionOptions } from "../../models/execution/index.ts";
import { ExecutionCallbackPolicies } from "../../execution-observation/policies/index.ts";
import { prepareObservedExecutionCallback, invokeOwnedExecutionCallbackSync } from "../../execution-observation/owned/index.ts";
import type { AutomationStudioLlmBuildPurseHold } from "./types.ts";

/** One call's actual holds, retaining legacy order and draining every observed settlement. */
export function combineAutomationStudioLlmBuildPurseHolds(holds: readonly AutomationStudioLlmBuildPurseHold[], execution?: ModelExecutionOptions): AutomationStudioLlmBuildPurseHold {
  const originals = [...holds];
  const observation = execution?.observation;
  const captured = observation ? Object.freeze({ observation }) satisfies ModelExecutionOptions : undefined;
  const releases = observation ? originals.map(hold => ({ hold, callback: hold.release })) : undefined;
  let observed: Promise<void> | undefined;
  const combined: AutomationStudioLlmBuildPurseHold = {
    settle: usage => {
      for (const hold of originals) hold.settle(usage);
    },
    release: () => {
      if (observation && releases) {
        for (const { hold, callback } of releases) invokeOwnedExecutionCallbackSync(observation, { receiver: hold, callback, args: [] });
      } else {
        for (const hold of originals) hold.release();
      }
    },
    settleObserved: (usage: AutomationStudioLlmUsageSummary | undefined, current?: ModelExecutionOptions): Promise<void> => {
      if (current?.observation && current.observation !== observation) return Promise.reject(new Error("llm_budget.foreign_settlement_observation"));
      if (observed) return observed;
      let resolve!: () => void;
      let reject!: (error: unknown) => void;
      // Retain the original Promise before a getter or delegated callback can reenter.
      observed = new Promise<void>((fulfilled, rejected) => {
        resolve = fulfilled;
        reject = rejected;
      });
      try {
        // Pin every original method/receiver before any one of them may await.
        const callbacks = originals.map(hold => ({ hold, callback: hold.settleObserved }));
        const work = callbacks.map(({ hold, callback }) => {
          try {
            if (callback) {
              if (!observation || ExecutionCallbackPolicies.isOwningFrame(hold, callback)) return callback.call(hold, usage, captured);
              return invokeSuppliedSettlement(hold, callback, usage, observation);
            }
            if (observation) return Promise.reject(new Error("llm_budget.settlement_observation_unavailable"));
            hold.settle(usage);
            return Promise.resolve();
          } catch (error) {
            return Promise.reject(error);
          }
        });
        void Promise.allSettled(work).then(results => {
          const failures = results.filter((result): result is PromiseRejectedResult => result.status === "rejected").map(result => result.reason);
          if (failures.length === 1) reject(failures[0]);
          else if (failures.length > 1) reject(new AggregateError(failures, "Multiple owned budget settlements failed.", { cause: failures[0] }));
          else resolve();
        });
      } catch (error) {
        reject(error);
      }
      return observed;
    }
  };
  ExecutionCallbackPolicies.remember(combined, combined.settleObserved!, "frame");
  if (observation) ExecutionCallbackPolicies.remember(combined, combined.release, "pure");
  return combined;
}

async function invokeSuppliedSettlement(hold: AutomationStudioLlmBuildPurseHold, callback: NonNullable<AutomationStudioLlmBuildPurseHold["settleObserved"]>, usage: AutomationStudioLlmUsageSummary | undefined, observation: NonNullable<ModelExecutionOptions["observation"]>): Promise<void> {
  const carrier: ModelExecutionOptions = {};
  const owned = await prepareObservedExecutionCallback(observation, { receiver: hold, callback, args: [usage, carrier] });
  if (owned.observation) Object.defineProperty(carrier, "observation", { value: owned.observation, enumerable: true });
  Object.freeze(carrier);
  let primary: { error: unknown } | undefined;
  try {
    await owned.invoke();
    if (owned.completion() !== "settled") {
      if (owned.completion() !== "unknown") owned.unknown();
      throw new Error("llm_budget.settlement_callback_unverified");
    }
  } catch (error) {
    primary = { error };
  }
  try {
    await owned.flush();
  } catch (error) {
    if (primary && primary.error !== error) throw new AggregateError([primary.error, error], "Budget settlement and observation drain failed.", { cause: primary.error });
    throw error;
  }
  if (primary) throw primary.error;
}
