// Resolve the caller used by chat commands. Production composition preserves
// the actual authenticated session (including client-gateway:<session>) and
// authorizes each model use independently. The legacy resolver/check hooks and
// lock-shaped result fields remain for older adapters; production does not bind
// a key lock check or substitute another person's/panel session.

import type { ModelKeyLockReason } from "@fluxiq/contracts/automation";

/** The session prefix a paired client's actor carries. */
export const AUTOMATION_STUDIO_PAIRED_CLIENT_SESSION_PREFIX = "client-gateway:";

/** The unlock this caller may use, or null: a paired client's own, otherwise another of the person's. Compatibility hook for older hosts. */
export type AutomationStudioConversationUnlockedSessionResolver = (userId: string, actorSessionId?: string) => string | null;

/** Why this person's own model key cannot be opened by `sessionId`, or null when it can or they have none. `actorSessionId` says who asks. Compatibility hook for older hosts. */
export type AutomationStudioConversationKeyUnlockCheck = (input: { userId: string; sessionId: string | null; actorSessionId: string }) => ModelKeyLockReason | null;

export type AutomationStudioConversationEffectiveCaller = {
  userId: string;
  /** The session registry calls run under: the request's own, or for a paired client the unlock live now. */
  sessionId: string;
  /** The session a model call tries first; null for a paired client with nothing unlocked, whose calls go straight to the person's live unlock. */
  preferredSessionId: string | null;
  /** True when the request came from a paired client. */
  paired: boolean;
  /** True for a paired client with no unlock of its own. */
  keyLocked: boolean;
  /** True when the person has a model key and what this caller may use cannot open it: a setup step, before a task starts. False for a person with no key at all. */
  keyNeedsUnlock: boolean;
  /** Why, for the words a person reads; null when it needs no unlock. */
  keyLockReason: ModelKeyLockReason | null;
};

export function automationStudioConversationEffectiveCaller(
  actor: { userId: string; sessionId: string },
  resolveUnlockedSession: AutomationStudioConversationUnlockedSessionResolver | null,
  checkKeyUnlock: AutomationStudioConversationKeyUnlockCheck | null = null
): AutomationStudioConversationEffectiveCaller {
  const lockReason = (sessionId: string | null): ModelKeyLockReason | null => checkKeyUnlock?.({ userId: actor.userId, sessionId, actorSessionId: actor.sessionId }) ?? null;
  if (!actor.sessionId.startsWith(AUTOMATION_STUDIO_PAIRED_CLIENT_SESSION_PREFIX)) {
    // A person's own session, which falls back to another live unlock of theirs on each call, so it needs one only when neither opens the key.
    const own = lockReason(actor.sessionId);
    const other = own === null ? null : (resolveUnlockedSession?.(actor.userId, actor.sessionId) ?? null);
    const keyLockReason = own !== null && lockReason(other) !== null ? own : null;
    return { userId: actor.userId, sessionId: actor.sessionId, preferredSessionId: actor.sessionId, paired: false, keyLocked: false, keyNeedsUnlock: keyLockReason !== null, keyLockReason };
  }
  const unlocked = resolveUnlockedSession ? resolveUnlockedSession(actor.userId, actor.sessionId) : null;
  const keyLockReason = lockReason(unlocked);
  return unlocked
    ? { userId: actor.userId, sessionId: unlocked, preferredSessionId: unlocked, paired: true, keyLocked: false, keyNeedsUnlock: keyLockReason !== null, keyLockReason }
    : { userId: actor.userId, sessionId: actor.sessionId, preferredSessionId: null, paired: true, keyLocked: true, keyNeedsUnlock: keyLockReason !== null, keyLockReason };
}
