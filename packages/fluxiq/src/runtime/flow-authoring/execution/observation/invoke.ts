import type { ExecutionCallbackCall } from "../../../execution-observation/index.ts";
import { ExecutionCallbackPolicies } from "../../../execution-observation/policies/index.ts";
import { AuthoringExecutionScope } from "./scope.ts";

/** Invokes the pinned original Core method; its optional fresh argument carries only a private child. */
export async function invokeAuthoringExecutionCallback<TReceiver, TArguments extends unknown[], TResult>(invocation: object | undefined, call: ExecutionCallbackCall<TReceiver, TArguments, TResult>, signal?: AbortSignal, freshInvocation?: object): Promise<Awaited<TResult>> {
  const pinned = { receiver: call.receiver, callback: call.callback, args: [...call.args] as TArguments, ...(call.binding ? { binding: call.binding } : {}) };
  const original = AuthoringExecutionScope.of(invocation);
  if (!original) return await pinned.callback.apply(pinned.receiver, pinned.args);
  if (freshInvocation && pinned.receiver !== freshInvocation && !pinned.args.includes(freshInvocation)) throw new Error("site_reset.invocation_argument_missing");
  const callbacks = original.context.callbacks;
  const targets = AuthoringExecutionScope.targets(pinned.receiver, freshInvocation).map(target => ({ target, previous: AuthoringExecutionScope.of(target) }));
  ExecutionCallbackPolicies.manage(callbacks, pinned);
  const managed = callbacks.isManaged(pinned);
  const prepared = await callbacks.prepare(callbacks.forParent(original.context.parent), pinned, signal);
  const children: AuthoringExecutionScope[] = [];
  try {
    for (const target of targets) children.push(new AuthoringExecutionScope(target.target, { ...original.context, parent: callbacks.context(prepared) }, original.options, target.previous));
    signal?.throwIfAborted();
    const returned = await callbacks.invoke(prepared, pinned);
    if (!managed) {
      callbacks.unknown(prepared);
    }
    await callbacks.flush();
    return returned;
  } finally { for (const child of children.reverse()) child.close(); }
}
