import type { SecretKeyRecord, SecretKeySummary } from "../../../types.ts";
import type { SecretKeyValue } from "../../value-sealer.ts";
import type { SecretKeysService } from "../../service.ts";
import type { SecretKeysOperationContext } from "../owner/index.ts";
import type { SecretKeysExecutionInvocation } from "../invocation.ts";
import { SecretKeysOperationPins } from "../pins.ts";
import { secretKeySummary } from "../metadata/index.ts";
import { readSecretKeysClock } from "./clock.ts";
import { HeldKeys } from "../../held-keys.ts";

export async function revealSessionSecret(context: SecretKeysOperationContext, input: Parameters<SecretKeysService["revealKeyWithAuthorization"]>[0], invocation?: SecretKeysExecutionInvocation): Promise<{ key: SecretKeySummary; value: string }> {
  const pins = new SecretKeysOperationPins(context, invocation !== undefined);
  if (invocation && !pins.nativeMutation(pins.revokeAuthorization)) throw new Error("secret.execution.custody_unverified");
  const authorization = invocation ? invocation.sync({ receiver: context.heldKeys, callback: pins.authorization, args: [input.authorizationId] }) : pins.authorization.call(context.heldKeys, input.authorizationId);
  const nowMs = input.nowMs ?? readSecretKeysClock(context, invocation);
  if (!authorization || authorization.state !== "available" || authorization.keyId !== input.id) throw invocation?.refusal("Secret reveal authorization is unavailable") ?? new Error("Secret reveal authorization is unavailable");
  if (authorization.expiresAtMs <= nowMs) {
    if (invocation) HeldKeys.revokeOwnedAuthorization(context.heldKeys, authorization, pins.cancelTimer);
    else pins.revokeAuthorization.call(context.heldKeys, input.authorizationId);
    throw invocation?.refusal("Secret reveal authorization is unavailable") ?? new Error("Secret reveal authorization is unavailable");
  }
  authorization.state = "claimed";
  let secret: SecretKeyValue | null = null;
  try {
    await context.store.load(invocation);
    const existing = context.store.require(input.id);
    if (existing.updatedAtMs !== authorization.keyUpdatedAtMs) throw invocation?.refusal("Secret reveal authorization is no longer valid") ?? new Error("Secret reveal authorization is no longer valid");
    if (invocation) pins.assertSealer();
    secret = invocation ? invocation.sync({ receiver: context.sealer, callback: pins.openRecordWithKey, args: [existing, authorization.decryptionKey] }) : pins.openRecordWithKey.call(context.sealer, existing, authorization.decryptionKey);
    if (!secret) throw invocation?.refusal("Invalid secret key payload") ?? new Error("Invalid secret key payload");
    const next: SecretKeyRecord = { ...existing, lastRevealedAtMs: nowMs };
    context.store.set(next);
    await context.store.persist(existing.id, invocation);
    const active = invocation ? invocation.sync({ receiver: context.heldKeys, callback: pins.authorization, args: [input.authorizationId] }) : pins.authorization.call(context.heldKeys, input.authorizationId);
    if (active !== authorization || authorization.state !== "claimed" || authorization.expiresAtMs <= readSecretKeysClock(context, invocation)) {
      secret.value = "";
      throw invocation?.refusal("Secret reveal authorization is unavailable") ?? new Error("Secret reveal authorization is unavailable");
    }
    const value = secret.value;
    if (invocation) HeldKeys.revokeOwnedAuthorization(context.heldKeys, authorization, pins.cancelTimer);
    else pins.revokeAuthorization.call(context.heldKeys, input.authorizationId);
    return { key: secretKeySummary(next), value };
  } catch (error) {
    if (secret) secret.value = "";
    try {
      if (invocation) HeldKeys.revokeOwnedAuthorization(context.heldKeys, authorization, pins.cancelTimer);
      else pins.revokeAuthorization.call(context.heldKeys, input.authorizationId);
    }
    catch (cleanup) { throw new AggregateError([error, cleanup], "Secret reveal and owned cleanup failed."); }
    throw error;
  }
}
