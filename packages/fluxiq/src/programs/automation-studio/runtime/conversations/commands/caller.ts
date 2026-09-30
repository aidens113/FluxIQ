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

/** The session prefix a paired client's actor carries. */
export const AUTOMATION_STUDIO_PAIRED_CLIENT_SESSION_PREFIX = "client-gateway:";

/** The person's live unlocked session, or null. Bound to Secret Keys in production. */
export type AutomationStudioConversationUnlockedSessionResolver = (userId: string) => string | null;

export type AutomationStudioConversationEffectiveCaller = {
  userId: string;
  sessionId: string;
  /** True when the request came from a paired client. */
  paired: boolean;
  /** True for a paired client whose person has no unlocked session. */
  keyLocked: boolean;
};

export function automationStudioConversationEffectiveCaller(
  actor: { userId: string; sessionId: string },
  resolveUnlockedSession: AutomationStudioConversationUnlockedSessionResolver | null
): AutomationStudioConversationEffectiveCaller {
  if (!actor.sessionId.startsWith(AUTOMATION_STUDIO_PAIRED_CLIENT_SESSION_PREFIX)) return { userId: actor.userId, sessionId: actor.sessionId, paired: false, keyLocked: false };
  const unlocked = resolveUnlockedSession ? resolveUnlockedSession(actor.userId) : null;
  return unlocked
    ? { userId: actor.userId, sessionId: unlocked, paired: true, keyLocked: false }
    : { userId: actor.userId, sessionId: actor.sessionId, paired: true, keyLocked: true };
}
