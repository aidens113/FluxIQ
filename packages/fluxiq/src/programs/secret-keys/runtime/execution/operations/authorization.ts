import { randomUUID } from "node:crypto";
import { HeldKeys, type HeldRevealAuthorization, type SecretRevealAuthorizationMetadata } from "../../held-keys.ts";
import type { SecretKeysService } from "../../service.ts";
import type { SecretKeysOperationContext } from "../owner/index.ts";
import type { SecretKeysExecutionInvocation } from "../invocation.ts";
import { SecretKeysOperationPins } from "../pins.ts";
import { secretRevealAuthorizationMetadata } from "../metadata/index.ts";
import { MAX_SECRET_REVEAL_AUTHORIZATION_TTL_MS } from "./limits.ts";
import { readSecretKeysClock } from "./clock.ts";

export async function createSessionSecretAuthorization(context: SecretKeysOperationContext, input: Parameters<SecretKeysService["createSessionRevealAuthorization"]>[0], invocation?: SecretKeysExecutionInvocation): Promise<SecretRevealAuthorizationMetadata> {
  const pins = new SecretKeysOperationPins(context, invocation !== undefined);
  const cancelTimer = pins.cancelTimer;
  await context.store.load(invocation);
  const nowMs = input.nowMs ?? readSecretKeysClock(context, invocation);
  const unlock = invocation ? invocation.sync({ receiver: context.heldKeys, callback: pins.session, args: [input.sessionId] }) : pins.session.call(context.heldKeys, input.sessionId);
  if (!unlock || unlock.userId !== input.userId || unlock.expiresAtMs <= nowMs) {
    if (unlock && unlock.userId === input.userId) {
      if (invocation && !pins.nativeMutation(pins.revokeSession)) throw new Error("secret.execution.custody_unverified");
      if (invocation) HeldKeys.revokeOwnedSession(context.heldKeys, unlock, cancelTimer);
      else pins.revokeSession.call(context.heldKeys, input.sessionId);
    }
    throw invocation?.refusal("Secret key session unlock is unavailable") ?? new Error("Secret key session unlock is unavailable");
  }
  const existing = context.store.require(input.id);
  const unlockedKey = unlock.decryptionKeys.get(existing.id);
  if (!unlockedKey || unlockedKey.keyUpdatedAtMs !== existing.updatedAtMs) throw invocation?.refusal("Secret key session unlock is unavailable") ?? new Error("Secret key session unlock is unavailable");
  const requestedTtlMs = input.ttlMs ?? 60_000;
  const ttlMs = Math.min(requestedTtlMs, unlock.expiresAtMs - nowMs);
  if (!Number.isInteger(requestedTtlMs) || requestedTtlMs < 1000 || requestedTtlMs > MAX_SECRET_REVEAL_AUTHORIZATION_TTL_MS || ttlMs < 1) throw invocation?.refusal("Secret reveal authorization TTL is invalid") ?? new Error("Secret reveal authorization TTL is invalid");
  if (invocation && (!pins.nativeMutation(pins.authorizationExpiryTimer) || !pins.nativeMutation(pins.holdAuthorization))) throw new Error("secret.execution.custody_unverified");
  invocation?.assert();
  const authorizationId = `secret-reveal:${randomUUID()}`;
  const expiryTimer = invocation ? HeldKeys.ownedAuthorizationTimer(context.heldKeys, authorizationId, ttlMs, pins.startTimer, cancelTimer) : pins.authorizationExpiryTimer.call(context.heldKeys, authorizationId, ttlMs);
  const authorization: HeldRevealAuthorization = {
    authorizationId, keyId: existing.id, keyUpdatedAtMs: existing.updatedAtMs, expiresAtMs: nowMs + ttlMs,
    remainingUses: 1, decryptionKey: Buffer.from(unlockedKey.decryptionKey), sessionId: input.sessionId, state: "available", expiryTimer
  };
  invocation?.ownGrant(context.heldKeys, authorization, cancelTimer);
  try { pins.holdAuthorization.call(context.heldKeys, authorization); }
  catch (error) {
    try {
      if (invocation) invocation.cleanupGrant();
      else HeldKeys.revokeOwnedAuthorization(context.heldKeys, authorization, cancelTimer);
    }
    catch (cleanup) { throw new AggregateError([error, cleanup], "Secret authorization and owned cleanup failed."); }
    throw error;
  }
  return secretRevealAuthorizationMetadata(authorization);
}
