import type { ClientGatewayCommandContext } from "../../../../client-gateway/service/command-ledger/index.ts";
import type { ExecutionCallbackIdentity } from "../../../execution-observation/index.ts";
import type { OutputExecutionObservation } from "../observation.ts";
import type { PreparedOutputInvocation } from "./prepared.ts";
import { OutputAdmissionState } from "./state.ts";
import { OutputOrchestrationCallbacks } from "./callbacks.ts";
import { OutputPureCallbacks } from "./pure.ts";

export async function prepareOutputInvocation<TReceiver, TArguments extends unknown[], TResult>(observation: OutputExecutionObservation, identity: ExecutionCallbackIdentity<TReceiver, TArguments, TResult>, signal?: AbortSignal, context?: ClientGatewayCommandContext): Promise<PreparedOutputInvocation> {
  const observed = OutputAdmissionState.observations.get(observation);
  if (!observed) throw new Error("execution_observation.foreign_output_binding");
  const receiver = identity.receiver;
  const callback = identity.callback;
  const binding = identity.binding;
  const selected = { receiver, callback, ...(binding ? { binding } : {}) };
  if (observed.state.isGatewayTarget(receiver, callback) && observed.state.readCompletion && !observed.state.source.isManaged(selected)) {
    observed.state.source.manage({ ...selected, contract: "managed_direct_effects", consumeCompletion: ({ invocation }) => observed.state.completion(invocation) });
  } else if (OutputPureCallbacks.has(receiver, callback) && !observed.state.source.isManaged(selected)) {
    observed.state.source.manage({ ...selected, contract: "no_direct_effects" });
  } else if (OutputOrchestrationCallbacks.has(receiver, callback) && !observed.state.source.isManaged(selected)) {
    observed.state.source.manage({ ...selected, contract: "managed_direct_effects", consumeCompletion: ({ invocation }) => observed.state.source.frameCompletion(invocation) });
  }
  const prepared = await observed.state.source.prepare(observed.state.source.forParent(observed.parent), selected, signal);
  const handle = Object.freeze({}) as PreparedOutputInvocation;
  const operation = { prepared, parent: observed.state.source.context(prepared), origin: observed.origin, receiver, callback, binding, context, series: observed.series };
  observed.state.prepared.set(prepared, operation);
  OutputAdmissionState.invocations.set(handle, { state: observed.state, operation });
  return handle;
}
