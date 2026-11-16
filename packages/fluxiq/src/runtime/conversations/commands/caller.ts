// Resolve the caller used by chat commands. The actual authenticated session
// (including client-gateway:<session>) is preserved, and each model use is
// authorized independently by that principal: a connected client uses the
// configured key, so there is no unlock to resolve and no session to substitute.

/** The session prefix a paired client's actor carries. */
export const AUTOMATION_STUDIO_PAIRED_CLIENT_SESSION_PREFIX = "client-gateway:";

export type AutomationStudioConversationEffectiveCaller = {
  userId: string;
  /** The session registry calls and model calls run under: the request's own. */
  sessionId: string;
  /** The session a model call tries first: the request's own. */
  preferredSessionId: string;
  /** True when the request came from a paired client. */
  paired: boolean;
};

export function automationStudioConversationEffectiveCaller(actor: { userId: string; sessionId: string }): AutomationStudioConversationEffectiveCaller {
  return { userId: actor.userId, sessionId: actor.sessionId, preferredSessionId: actor.sessionId, paired: actor.sessionId.startsWith(AUTOMATION_STUDIO_PAIRED_CLIENT_SESSION_PREFIX) };
}
