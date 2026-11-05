// Whose session a chat's model calls and commands run under.
//
// A paired client -- the browser extension -- acts as the person who approved
// it, under a session of its own: `client-gateway:<gateway session>`. Secret
// Keys releases a model key only to an unlocked identity session, so under
// that session the chat model always fell back to offline matching and a
// build always failed on the key.
//
// So a paired caller is mapped to its own browser's unlock, which lasts as long
// as that browser's credential (`programs/secret-keys/runtime/unlocks/`),
// for the chat model and for every registry call a command makes. The permissions
// stay the paired set: this changes whose key pays, never what may be done. With
// no unlock the paired session is kept, and a task that needs the key shows a
// setup step before it starts (`./execute.ts`). This is a deliberate change to
// the rule that no token call reaches a model, made because the person asked
// for the extension's chat to build automations; the HTTP allowlist is
// unchanged, so a token still cannot call a build endpoint directly.
//
// **The user plus a preferred session, not a fixed session (H0-S5).** The
// session resolved here is where the work starts, never what pays for all of
// it: every model call the work makes resolves the person's live unlock again
// (`llm/session-key-provider.ts`), preferring `preferredSessionId` and falling
// back to any other unlock of theirs in this workspace. So a sign-out of the
// session a build started from does not end the build while another unlock
// lives, and a person who signs in after a locked message is not stuck with
// the paired session. `sessionId` stays the session registry calls run under.

import type { ModelKeyLockReason } from "@fluxiq/contracts/automation";

/** The session prefix a paired client's actor carries. */
export const AUTOMATION_STUDIO_PAIRED_CLIENT_SESSION_PREFIX = "client-gateway:";

/** The unlock this caller may use, or null: a paired client's own, otherwise another of the person's. Bound to Secret Keys in production. */
export type AutomationStudioConversationUnlockedSessionResolver = (userId: string, actorSessionId?: string) => string | null;

/** Why this person's own model key cannot be opened by `sessionId`, or null when it can or they have none. `actorSessionId` says who asks. Bound to Secret Keys in production. */
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
