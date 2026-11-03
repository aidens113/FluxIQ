import type { SecretKeysOperationContext } from "../owner/index.ts";
import type { SecretKeysExecutionInvocation } from "../invocation.ts";
import { SecretKeysOperationPins } from "../pins.ts";

export function unlockedSecretSession(context: SecretKeysOperationContext, userId: string, nowMs: number, invocation?: SecretKeysExecutionInvocation): string | null {
  if (!userId) return null;
  const pins = new SecretKeysOperationPins(context, invocation !== undefined);
  let best: { sessionId: string; expiresAtMs: number } | null = null;
  const sessions = invocation ? invocation.sync({ receiver: context.heldKeys, callback: pins.sessionsFor, args: [userId] }) : pins.sessionsFor.call(context.heldKeys, userId);
  for (const held of sessions) {
    if (held.expiresAtMs <= nowMs || held.keyCount === 0) continue;
    if (!best || held.expiresAtMs > best.expiresAtMs) best = held;
  }
  return best?.sessionId ?? null;
}
