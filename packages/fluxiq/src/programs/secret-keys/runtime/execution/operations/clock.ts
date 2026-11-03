import type { SecretKeysOperationContext } from "../owner/index.ts";
import type { SecretKeysExecutionInvocation } from "../invocation.ts";

export function readSecretKeysClock(context: SecretKeysOperationContext, invocation?: SecretKeysExecutionInvocation): number {
  return invocation ? invocation.sync({ receiver: context.original, callback: context.now, args: [] }) : context.now.call(context.original);
}
