import type { AutomationNodeExecutionResult } from "../../../components/automation/index.ts";
import type { AutomationStudioNativeNodeContext } from "../../../components/automation/importer/index.ts";
import type { NativeAdmissionBinding } from "./binding.ts";
import type { NativeExecutionObservation } from "./observation.ts";
import { NativeAdmissionState } from "./state.ts";
import type { NativeObservedPending } from "./pending.ts";
import { NativeInvocationResults } from "./results.ts";

export function executeObservedNative(observation: NativeExecutionObservation, binding: NativeAdmissionBinding, context: AutomationStudioNativeNodeContext, signal?: AbortSignal): Promise<AutomationNodeExecutionResult> {
  const observed = NativeAdmissionState.observations.get(observation);
  if (!observed || !observed.state.registrations.has(binding.runtime)) throw new Error("execution_observation.foreign_native_binding");
  const state = observed.state;
  if (!state.managed.has(binding.receiver)) {
    const contract = state.registrations.get(binding.runtime)!.find(value => value.implementation === binding.implementation && value.packageId === binding.packageId && value.packageVersion === binding.packageVersion && value.definitionId === binding.definitionId && value.definitionVersion === binding.definitionVersion);
    if (contract?.contract === "no_direct_effects") {
      state.source.manage({ receiver: binding.receiver, callback: binding.implementation, binding: binding.receiver, contract: "no_direct_effects" });
    } else if (contract) {
      const consumeCompletion = contract.consumeCompletion.bind(contract);
      state.source.manage({ receiver: binding.receiver, callback: binding.implementation, binding: binding.receiver, contract: "managed_direct_effects", consumeCompletion });
    }
    state.managed.add(binding.receiver);
  }
  const pending: NativeObservedPending = { state, parent: observed.parent };
  const executing = (async () => {
    state.backends.begin(observed.series);
    const invocation = await state.source.prepare(state.source.forParent(observed.parent), { receiver: binding.receiver, callback: binding.implementation, binding: binding.receiver }, signal);
    state.backends.entered(observed.series, invocation);
    pending.invocation = invocation;
    return await state.source.invoke(invocation, { receiver: binding.receiver, callback: binding.implementation, binding: binding.receiver, args: [context] });
  })();
  NativeInvocationResults.start(executing, pending);
  return executing;
}
