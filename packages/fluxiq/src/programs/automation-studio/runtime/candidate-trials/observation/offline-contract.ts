import type { ExecutionObservationSource, ManagedExecutionCallbackRegistration } from "../../../../../runtime/execution-observation/index.ts";
import type { AutomationStudioCandidateTrialRequest, AutomationStudioCandidateTrialResult } from "../../flow-bootstrap/candidate/index.ts";
import type { TrialOfflineRunner } from "./offline-runner.ts";
import { trialOfflineRunners } from "./offline-registry.ts";

/** The actual owner must certify its original raw offline method and all its execution collaborators. */
export function bindTrialOfflineRunnerContract(target: object, callbacks: ExecutionObservationSource, registration: Extract<ManagedExecutionCallbackRegistration<TrialOfflineRunner, [object, AutomationStudioCandidateTrialRequest], Promise<AutomationStudioCandidateTrialResult>>, { contract: "no_direct_effects" }>): void {
  const original = trialOfflineRunners.get(target);
  if (!original || original.contract || registration.receiver !== original.runner || registration.callback !== original.runner.run) throw new Error("candidate.trial_offline_contract_foreign");
  const prototype = Object.getPrototypeOf(target);
  const descriptors = Object.getOwnPropertyDescriptors(target);
  const keys = Reflect.ownKeys(descriptors);
  callbacks.manage(registration);
  original.contract = { callbacks, registration, current: () => {
    if (Object.getPrototypeOf(target) !== prototype) return false;
    const actual = Object.getOwnPropertyDescriptors(target);
    if (Reflect.ownKeys(actual).length !== keys.length) return false;
    return keys.every(key => {
      const before = Reflect.get(descriptors, key);
      const after = Reflect.get(actual, key);
      return before && after && before.value === after.value && before.get === after.get && before.set === after.set;
    });
  } };
}
