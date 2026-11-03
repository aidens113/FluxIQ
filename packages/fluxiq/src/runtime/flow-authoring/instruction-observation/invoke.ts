import type { ExecutionCallbackObservation, ExecutionObservationSource, OwnedExecutionCallback } from "../../execution-observation/index.ts";
import type { ModelExecutionOptions } from "../../models/execution/index.ts";
import { prepareInstructionModelRun } from "./prepare.ts";
import { invokePreparedInstructionModelRun } from "./execute.ts";

/** The actual runner receives its own entered child before any model or queued work begins. */
export async function invokeInstructionModelRun<TReceiver, TRequest, TResult>(observation: ExecutionCallbackObservation | undefined, receiver: TReceiver, callback: (this: TReceiver, request: TRequest, execution?: ModelExecutionOptions) => Promise<TResult>, request: TRequest, expected?: ExecutionObservationSource): Promise<{
  answer: Awaited<TResult>;
  invocation: OwnedExecutionCallback<TReceiver, [TRequest, ModelExecutionOptions?], Promise<TResult>> | undefined;
}> {
  // The legacy call still starts synchronously and receives its original one argument.
  if (!observation) {
    if (expected) throw new Error("instruction_observation.current_scope_required");
    return { answer: await callback.call(receiver, request), invocation: undefined };
  }
  const invocation = await prepareInstructionModelRun(observation, receiver, callback, request, expected);
  const answer = await invokePreparedInstructionModelRun(invocation);
  return { answer, invocation };
}
