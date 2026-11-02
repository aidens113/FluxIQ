import type { ExecutionCallbackCall } from "../../../../../runtime/execution-observation/index.ts";
import { partialTrialFrames } from "./frames.ts";
import { managePartialTrialFrame } from "./frame.ts";
import { partialTrialContext } from "./of.ts";
import { partialTrialContexts } from "./contexts.ts";
import type { ExecutionObservationContext } from "../../../../../runtime/execution-admission/index.ts";

/** Observe the original method, receiver and tuple under the exact admitted parent. */
export async function observePartialTrialCallback<TReceiver, TArguments extends unknown[], TResult>(input: object, call: ExecutionCallbackCall<TReceiver, TArguments, TResult>, signal?: AbortSignal, contextArgument?: object, bindPrepared?: (originalContext: ExecutionObservationContext) => void | Promise<void>): Promise<Awaited<TResult>> {
  const original = partialTrialContext(input);
  if (!original) return await call.callback.apply(call.receiver, call.args);
  const frame = partialTrialFrames.get(call.callback);
  if (frame && (!frame.automation || original.automation !== undefined)) managePartialTrialFrame(original.callbacks, call, frame.automation ? original.automation?.owner : undefined);
  const pinned = { receiver: call.receiver, callback: call.callback, args: [...call.args] as TArguments, ...(call.binding ? { binding: call.binding } : {}) };
  const managed = original.callbacks.isManaged(pinned);
  const prepared = await original.callbacks.prepare(original.callbacks.forParent(original.parent), pinned, signal);
  const prior = contextArgument ? partialTrialContexts.get(contextArgument) : undefined;
  if (contextArgument) partialTrialContexts.set(contextArgument, { ...original, parent: original.callbacks.context(prepared) });
  try {
    signal?.throwIfAborted();
    await bindPrepared?.(original.callbacks.context(prepared));
    const returned = await original.callbacks.invoke(prepared, pinned);
    if (!managed) original.callbacks.unknown(prepared);
    await original.callbacks.flush();
    return returned;
  }
  finally {
    if (contextArgument) {
      if (prior) partialTrialContexts.set(contextArgument, prior);
      else partialTrialContexts.delete(contextArgument);
    }
  }
}
