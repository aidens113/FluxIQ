// Whose session a chat's model calls and commands run under.
//
// A paired client -- the browser extension -- acts as the person who approved
// it, under a session of its own: `client-gateway:<gateway session>`. Secret
// Keys releases a model key only to an unlocked identity session, so under
// that session the chat model always fell back to offline matching and a
// build always failed on the key.
//
// So a paired caller is mapped to the approving person's live unlocked
// session, when they have one, for the chat model and for every registry call
// a command makes. The permissions stay the paired set: this changes whose key
// pays, never what may be done. With no unlocked session the paired session is
// kept, and the thread says the key is locked. This is a deliberate change to
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

/** The session prefix a paired client's actor carries. */
export const AUTOMATION_STUDIO_PAIRED_CLIENT_SESSION_PREFIX = "client-gateway:";

/** The person's live unlocked session, or null. Bound to Secret Keys in production. */
export type AutomationStudioConversationUnlockedSessionResolver = (userId: string) => string | null;

export type AutomationStudioConversationEffectiveCaller = {
  userId: string;
  /** The session registry calls run under: the request's own, or for a paired client the unlock live now. */
  sessionId: string;
  /** The session a model call tries first; null for a paired client with nothing unlocked, whose calls go straight to the person's live unlock. */
  preferredSessionId: string | null;
  /** True when the request came from a paired client. */
  paired: boolean;
  /** True for a paired client whose person has no unlocked session. */
  keyLocked: boolean;
};

export function automationStudioConversationEffectiveCaller(
  actor: { userId: string; sessionId: string },
  resolveUnlockedSession: AutomationStudioConversationUnlockedSessionResolver | null
): AutomationStudioConversationEffectiveCaller {
  if (!actor.sessionId.startsWith(AUTOMATION_STUDIO_PAIRED_CLIENT_SESSION_PREFIX)) return { userId: actor.userId, sessionId: actor.sessionId, preferredSessionId: actor.sessionId, paired: false, keyLocked: false };
  const unlocked = resolveUnlockedSession ? resolveUnlockedSession(actor.userId) : null;
  return unlocked
    ? { userId: actor.userId, sessionId: unlocked, preferredSessionId: unlocked, paired: true, keyLocked: false }
    : { userId: actor.userId, sessionId: actor.sessionId, preferredSessionId: null, paired: true, keyLocked: true };
}
