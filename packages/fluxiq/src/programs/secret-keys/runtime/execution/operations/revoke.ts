import type { SecretKeysOperationContext } from "../owner/index.ts";
import type { SecretKeysExecutionInvocation } from "../invocation.ts";
import { SecretKeysOperationPins } from "../pins.ts";
import { HeldKeys } from "../../held-keys.ts";

export function revokeSessionSecretAuthorization(context: SecretKeysOperationContext, id: string, invocation?: SecretKeysExecutionInvocation): void {
  const pins = new SecretKeysOperationPins(context, invocation !== undefined);
  if (invocation && !pins.nativeMutation(pins.revokeAuthorization)) throw new Error("secret.execution.custody_unverified");
  invocation?.assert();
  if (!invocation) pins.revokeAuthorization.call(context.heldKeys, id);
  else {
    const authorization = invocation.sync({ receiver: context.heldKeys, callback: pins.authorization, args: [id] });
    if (authorization) HeldKeys.revokeOwnedAuthorization(context.heldKeys, authorization, pins.cancelTimer);
  }
}
