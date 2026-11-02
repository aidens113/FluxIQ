import type { ExecutionCallbackCall } from "../../../../execution-observation/index.ts";
import type { OutputExecutionObservation } from "../../observation.ts";
import { OutputAdmissionState } from "../state.ts";
import { OutputPureCallbacks } from "../pure.ts";

export function invokeObservedOutputSync<TReceiver, TArguments extends unknown[], TResult>(observation: OutputExecutionObservation | undefined, call: ExecutionCallbackCall<TReceiver, TArguments, TResult>): TResult {
  if (!observation) return call.callback.apply(call.receiver, call.args);
  const observed = OutputAdmissionState.observations.get(observation);
  if (!observed) throw new Error("execution_observation.foreign_output_binding");
  if (OutputPureCallbacks.has(call.receiver, call.callback) && !observed.state.source.isManaged(call)) observed.state.source.manage({ ...call, contract: "no_direct_effects" });
  return observed.state.source.invokeSync(observed.state.source.forParent(observed.parent), call);
}
