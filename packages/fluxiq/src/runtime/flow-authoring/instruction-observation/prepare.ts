import { isExecutionCallbackObservationFrom, prepareObservedExecutionCallback, type ExecutionCallbackObservation, type ExecutionObservationSource, type OwnedExecutionCallback } from "../../execution-observation/index.ts";
import type { ModelExecutionOptions } from "../../models/execution/index.ts";

/** Pins the real runner tuple, then seals its same internal carrier to the actual entered child. */
export async function prepareInstructionModelRun<TReceiver, TRequest, TResult>(observation: ExecutionCallbackObservation, receiver: TReceiver, callback: (this: TReceiver, request: TRequest, execution?: ModelExecutionOptions) => Promise<TResult>, request: TRequest, expected?: ExecutionObservationSource): Promise<OwnedExecutionCallback<TReceiver, [TRequest, ModelExecutionOptions?], Promise<TResult>>> {
  if (expected && !isExecutionCallbackObservationFrom(observation, expected)) throw new Error("instruction_observation.foreign_source");
  const carrier: { observation: ModelExecutionOptions["observation"] } = { observation: undefined };
  const args: [TRequest, ModelExecutionOptions?] = [request, carrier];
  const invocation = await prepareObservedExecutionCallback(observation, { receiver, callback, args });
  if (expected && !invocation.isFrom(expected)) {
    invocation.unknown();
    await invocation.flush();
    throw new Error("instruction_observation.foreign_source");
  }
  carrier.observation = invocation.observation;
  Object.freeze(carrier);
  return invocation;
}
