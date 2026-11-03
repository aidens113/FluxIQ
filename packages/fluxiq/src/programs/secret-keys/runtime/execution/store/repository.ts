import { ExecutionCallbackPolicies, type ExecutionCallbackCall } from "../../../../../runtime/execution-observation/index.ts";
import type { SecretKeysExecutionInvocation } from "../invocation.ts";

/** Native repository frames own their actual SQL child; arbitrary delegates need their own receipt. */
export async function invokeSecretKeysRepository<TReceiver, TArguments extends unknown[], TResult>(invocation: SecretKeysExecutionInvocation, call: ExecutionCallbackCall<TReceiver, TArguments, TResult>): Promise<Awaited<TResult>> {
  invocation.assert();
  if (!ExecutionCallbackPolicies.isOwningFrame(call.receiver, call.callback)) return await invocation.invoke(call);
  const result = await call.callback.apply(call.receiver, call.args);
  invocation.assert();
  return result;
}
