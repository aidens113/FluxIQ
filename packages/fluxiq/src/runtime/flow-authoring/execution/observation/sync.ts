import type { ExecutionCallbackCall } from "../../../execution-observation/index.ts";
import { ExecutionCallbackPolicies } from "../../../execution-observation/policies/index.ts";
import { AuthoringExecutionScope } from "./scope.ts";

/** Synchronous data callbacks stay synchronous; unsupported effects mark the actual durable frame. */
export function invokeAuthoringExecutionSync<TReceiver, TArguments extends unknown[], TResult>(invocation: object | undefined, call: ExecutionCallbackCall<TReceiver, TArguments, TResult>): TResult {
  const pinned = { receiver: call.receiver, callback: call.callback, args: [...call.args] as TArguments, ...(call.binding ? { binding: call.binding } : {}) };
  const original = AuthoringExecutionScope.of(invocation);
  if (!original) return pinned.callback.apply(pinned.receiver, pinned.args);
  const callbacks = original.context.callbacks;
  ExecutionCallbackPolicies.manage(callbacks, pinned);
  const supported = callbacks.isReadOnly(pinned);
  const observation = callbacks.forParent(original.context.parent);
  const targets = AuthoringExecutionScope.targets(pinned.receiver).map(target => ({ target, previous: AuthoringExecutionScope.of(target) }));
  const children: AuthoringExecutionScope[] = [];
  try {
    for (const target of targets) children.push(new AuthoringExecutionScope(target.target, original.context, original.options, target.previous));
    const returned = callbacks.invokeSync(observation, pinned);
    if (!supported) callbacks.markFrameUnknown(observation);
    return returned;
  } finally { for (const child of children.reverse()) child.close(); }
}
