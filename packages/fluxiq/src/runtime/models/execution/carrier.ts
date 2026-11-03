import { readObservedExecutionCallbackCarrier } from "../../execution-observation/index.ts";
import type { ModelExecutionOptions } from "./options.ts";

/** Internal Core forwarding only: the raw provider execution object keeps its original shape. */
export function modelExecutionFromCarrier(carrier: object | undefined, receiver: unknown, callback: object): ModelExecutionOptions | undefined {
  const observation = readObservedExecutionCallbackCarrier(carrier, receiver, callback);
  return observation ? Object.freeze({ observation }) : undefined;
}
