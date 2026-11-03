import type { ExecutionCallbackIdentity } from "../../../../../runtime/execution-observation/index.ts";
import { ExecutionCallbackPolicies } from "../../../../../runtime/execution-observation/policies/index.ts";
import type { PartialTrialContext } from "./context.ts";
import { partialTrialFrames } from "./frames.ts";
import { managePartialTrialFrame } from "./frame.ts";

/** Apply only the original Core callback's declaration on its current admitted source. */
export function managePartialTrialCallback<TReceiver, TArguments extends unknown[], TResult>(original: PartialTrialContext, identity: ExecutionCallbackIdentity<TReceiver, TArguments, TResult>): void {
  const frame = partialTrialFrames.get(identity.callback);
  if (frame && (!frame.automation || original.automation !== undefined)) managePartialTrialFrame(original.callbacks, identity, frame.automation ? original.automation?.owner : frame.callbacks ? original.callbacks.owner : undefined);
  else if (!frame) ExecutionCallbackPolicies.manage(original.callbacks, identity);
}
