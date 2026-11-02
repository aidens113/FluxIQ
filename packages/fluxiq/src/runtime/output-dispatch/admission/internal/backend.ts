import type { ClientGatewayCommandContext } from "../../../../client-gateway/service/command-ledger/index.ts";
import type { ExecutionCallbackIdentity } from "../../../execution-observation/index.ts";
import type { OutputExecutionObservation } from "../observation.ts";
import { OutputAdmissionState } from "./state.ts";
import { prepareOutputInvocation } from "./prepare.ts";

/** Only actual IO/transport backend dispatch invokes this retry-series fence. */
export async function prepareOutputBackend<TReceiver, TArguments extends unknown[], TResult>(observation: OutputExecutionObservation, identity: ExecutionCallbackIdentity<TReceiver, TArguments, TResult>, signal?: AbortSignal, context?: ClientGatewayCommandContext) {
  const observed = OutputAdmissionState.observations.get(observation);
  if (!observed) throw new Error("execution_observation.foreign_output_binding");
  observed.state.backends.begin(observed.series);
  const invocation = await prepareOutputInvocation(observation, identity, signal, context);
  observed.state.backends.entered(observed.series, observed.state.operation(invocation).prepared);
  return invocation;
}
