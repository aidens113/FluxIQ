import type { ExecutionCallbackCall } from "../../../../execution-observation/index.ts";
import type { PreparedOutputInvocation } from "../prepared.ts";
import { OutputAdmissionState } from "../state.ts";

export async function invokeOutputInvocation<TReceiver, TArguments extends unknown[], TResult>(handle: PreparedOutputInvocation, call: ExecutionCallbackCall<TReceiver, TArguments, TResult>): Promise<Awaited<TResult>> {
  const state = OutputAdmissionState.invocations.get(handle);
  if (!state) throw new Error("execution_observation.foreign_output_invocation");
  return await state.state.source.invoke(state.operation.prepared, call);
}
