import type { ExecutionObservationContext } from "../../execution-admission/index.ts";
import type { ExecutionCallbackCall, ExecutionObservationSource } from "../../execution-observation/index.ts";
import { ExecutionCallbackPolicies } from "../../execution-observation/policies/index.ts";
import type { AutomationStudioParkingPort } from "../index.ts";

/** Observe the exact original port under an entered parent without scoping its host. */
export function observeExecutionParkingPort(callbacks: ExecutionObservationSource, parent: ExecutionObservationContext, port: AutomationStudioParkingPort): AutomationStudioParkingPort {
  const open = port.open;
  const awaitAnswer = port.awaitAnswer;
  const invoke = async <TArguments extends unknown[], TResult>(call: ExecutionCallbackCall<AutomationStudioParkingPort, TArguments, TResult>): Promise<Awaited<TResult>> => {
    const pinned = { receiver: call.receiver, callback: call.callback, args: [...call.args] as TArguments };
    ExecutionCallbackPolicies.manage(callbacks, pinned);
    const managed = callbacks.isManaged(pinned);
    const prepared = await callbacks.prepare(callbacks.forParent(parent), pinned);
    const returned = await callbacks.invoke(prepared, pinned);
    if (!managed) callbacks.unknown(prepared);
    await callbacks.flush();
    return returned;
  };
  return {
    open: ask => invoke({ receiver: port, callback: open, args: [ask] }),
    ...(awaitAnswer ? { awaitAnswer: (ask, wait) => invoke({ receiver: port, callback: awaitAnswer, args: [ask, wait] }) } : {})
  };
}
