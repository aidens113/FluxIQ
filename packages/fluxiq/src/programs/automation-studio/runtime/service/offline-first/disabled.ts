import type { ExecutionObservationSource } from "../../../../../runtime/execution-observation/index.ts";
import type { AutomationStudioCandidateTrialSource } from "../../candidate-trials/authority/index.ts";
import type { AutomationStudioTrialOfflineFirstAnswer } from "../../flow-bootstrap/offline-first/index.ts";

const registered = new WeakSet<ExecutionObservationSource>();

async function disabledAnswer(): Promise<AutomationStudioTrialOfflineFirstAnswer<never>> {
  return { kind: "live", note: { outcome: "not_tried", why: "offline_trials_off" } };
}

/** Only this original literal decision is effect free; it is not a Flow or cache lease. */
export async function automationStudioOfflineFirstDisabled(source: AutomationStudioCandidateTrialSource | undefined, signal: AbortSignal): Promise<AutomationStudioTrialOfflineFirstAnswer<never>> {
  signal.throwIfAborted();
  if (!source) return await disabledAnswer();
  if (!registered.has(source.callbacks)) {
    source.callbacks.manage({ receiver: undefined, callback: disabledAnswer, contract: "no_direct_effects" });
    registered.add(source.callbacks);
  }
  return await source.callbacks.invokeReadOnly({ receiver: undefined, callback: disabledAnswer, args: [] }, signal);
}
