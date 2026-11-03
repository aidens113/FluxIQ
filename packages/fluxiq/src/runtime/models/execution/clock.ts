import { ExecutionCallbackPolicies, invokeOwnedExecutionCallbackSync } from "../../execution-observation/index.ts";
import type { ModelExecutionOptions } from "./options.ts";
import { ModelExecutionDefaults } from "./defaults.ts";

/** Core delegates to the pinned actual clock; a supplied clock still needs its own contract. */
export function modelExecutionClock(execution: ModelExecutionOptions | undefined, callback: () => number = ModelExecutionDefaults.now, receiver: unknown = undefined): () => number {
  const now = () => invokeOwnedExecutionCallbackSync(execution?.observation, { receiver, callback, args: [] });
  ExecutionCallbackPolicies.rememberLexical(now, "pure");
  return now;
}
