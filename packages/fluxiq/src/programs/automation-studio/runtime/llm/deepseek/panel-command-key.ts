// Which key the chat window's model call uses, and how it is released.
//
// Provider keys never live in a process's environment here -- the downstream
// launchers strip every provider variable from what they spawn -- so the only
// key there is to use is one a person put into Secret Keys. And Secret Keys
// releases a key only against the live, unlocked session of the user who
// unlocked it (`createSessionRevealAuthorization`). That is exactly the right
// rule for a message a person just typed: the key is theirs, released to them,
// for this one call, and a person whose keys are locked is told so in the
// thread instead of their message being read with somebody else's credential.
//
// Structural ports rather than the Secret Keys class, as the result-check
// provider does (`result-check-authorization/provider-contract.ts`): the host
// passes its service, a test passes four functions, and this directory does not
// depend on another program.

import type { AutomationStudioConversationCaller } from "../../conversations/index.ts";

export type AutomationStudioPanelCommandKeyPorts = {
  /** Every key, most recently changed first, as Secret Keys lists them. */
  snapshot(): Promise<{ keys: Array<{ id: string; kind: string; provider?: string | undefined; enabled: boolean; updatedAtMs: number }> }>;
  createSessionRevealAuthorization(input: { id: string; sessionId: string; userId: string; ttlMs: number }): Promise<{ authorizationId: string; keyId: string; keyUpdatedAtMs: number }>;
  revealKeyWithAuthorization(input: { authorizationId: string; id: string }): Promise<{ value: string }>;
  revokeRevealAuthorization(authorizationId: string): void;
};

/** How long a one-use reveal may wait before it is claimed. It is claimed on the next line. */
const REVEAL_TTL_MS = 10_000;

/**
 * A `resolveKey` for `createAutomationStudioDeepSeekPanelCommandModel`: the
 * newest enabled DeepSeek LLM key, released to the caller's unlocked session.
 * Throws, in words a person can act on, when there is no caller, no such key,
 * or the session has not unlocked it.
 */
export function automationStudioPanelCommandKeyFromSecretKeys(ports: AutomationStudioPanelCommandKeyPorts): (caller: AutomationStudioConversationCaller | null) => Promise<string> {
  return async (caller) => {
    if (!caller) throw new Error("No signed-in person sent this message, so no model key can be released for it.");
    const { keys } = await ports.snapshot();
    const key = keys.find((entry) => entry.enabled && entry.kind === "llm" && (!entry.provider || entry.provider.toLowerCase() === "deepseek"));
    if (!key) throw new Error("There is no enabled DeepSeek key in Secret Keys.");
    const authorization = await ports.createSessionRevealAuthorization({ id: key.id, sessionId: caller.sessionId, userId: caller.userId, ttlMs: REVEAL_TTL_MS });
    if (authorization.keyId !== key.id || authorization.keyUpdatedAtMs !== key.updatedAtMs) {
      ports.revokeRevealAuthorization(authorization.authorizationId);
      throw new Error("The DeepSeek key changed while it was being released.");
    }
    return (await ports.revealKeyWithAuthorization({ authorizationId: authorization.authorizationId, id: key.id })).value;
  };
}
