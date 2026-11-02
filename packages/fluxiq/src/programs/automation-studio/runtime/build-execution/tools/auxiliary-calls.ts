import type { ExecutionCallbackCall } from "../../../../../runtime/execution-observation/index.ts";
import { AutomationStudioBuildToolCallbackContexts } from "./callback-context.ts";
import { AutomationStudioBuildToolRequests } from "./request.ts";

/** An original internal producer call, distinct from its containing tool's retry series. */
export class AutomationStudioBuildToolAuxiliaryCalls {
  private static readonly originals = new WeakMap<object, { readonly request: object | undefined; readonly observer: object | undefined }>();

  static create(originalCoreAnchor: object): object {
    const request = AutomationStudioBuildToolRequests.of(originalCoreAnchor) ? originalCoreAnchor : AutomationStudioBuildToolCallbackContexts.request(originalCoreAnchor);
    const original = request && AutomationStudioBuildToolRequests.of(request);
    const invocation = Object.freeze({});
    this.originals.set(invocation, { request, observer: original?.observer });
    return invocation;
  }

  static require(invocation: object, observer: object, originalRequest: object): void {
    const original = this.originals.get(invocation);
    if (!original || original.observer !== observer || original.request !== originalRequest) throw new Error("execution_observation.foreign_auxiliary_invocation");
  }

  static async invoke<TReceiver, TArguments extends unknown[], TResult>(invocation: object, call: ExecutionCallbackCall<TReceiver, TArguments, TResult>, signal?: AbortSignal): Promise<Awaited<TResult>> {
    const original = this.originals.get(invocation);
    if (!original) throw new Error("execution_observation.foreign_auxiliary_invocation");
    const binding = call.binding;
    const pinned = { receiver: call.receiver, callback: call.callback, args: [...call.args] as TArguments, ...(binding ? { binding } : {}) };
    const state = original.request && AutomationStudioBuildToolRequests.of(original.request);
    if (!state || !original.request) return await pinned.callback.apply(pinned.receiver, pinned.args);
    if (state.observer !== original.observer) throw new Error("execution_observation.foreign_auxiliary_invocation");
    state.observer.bindAuxiliary(original.request, invocation);
    return await state.observer.invokeCallback(invocation, pinned, signal);
  }
}
