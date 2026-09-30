// Which key a model call made for a person uses, and how it is released.
//
// Provider keys never live in a process's environment here -- the downstream
// launchers strip every provider variable from what they spawn -- so the only
// key there is to use is one a person put into Secret Keys. And Secret Keys
// releases a key only against the live, unlocked session of the user who
// unlocked it (`createSessionRevealAuthorization`). That is the whole rule for
// a call made on a person's behalf -- a chat message, a build, a run's repair or
// the check of its result: the key is theirs, released to them, for this one
// call. There is nothing else to hold: no grant, no lease, no digest.
//
// Structural ports rather than the Secret Keys class: the host passes its
// service, a test passes four functions, and this directory does not depend on
// another program.

/** The Secret Keys operations releasing a person's key needs. */
export type AutomationStudioSessionKeyPorts = {
  /** Every key, most recently changed first, as Secret Keys lists them. */
  snapshot(): Promise<{ keys: Array<{ id: string; kind: string; provider?: string | undefined; enabled: boolean; updatedAtMs: number }> }>;
  createSessionRevealAuthorization(input: { id: string; sessionId: string; userId: string; ttlMs: number }): Promise<{ authorizationId: string; keyId: string; keyUpdatedAtMs: number }>;
  revealKeyWithAuthorization(input: { authorizationId: string; id: string }): Promise<{ value: string }>;
  revokeRevealAuthorization(authorizationId: string): void;
};

/** How long a one-use reveal may wait before it is claimed. It is claimed on the next line. */
const REVEAL_TTL_MS = 10_000;

/**
 * The newest enabled DeepSeek LLM key, released to this person's unlocked
 * session. Throws, in words a person can act on, when there is no such key or
 * the session has not unlocked it.
 */
export async function releaseAutomationStudioSessionDeepSeekKey(ports: AutomationStudioSessionKeyPorts, caller: { userId: string; sessionId: string }): Promise<string> {
  const { keys } = await ports.snapshot();
  const key = keys.find((entry) => entry.enabled && entry.kind === "llm" && (!entry.provider || entry.provider.toLowerCase() === "deepseek"));
  if (!key) throw new Error("There is no enabled DeepSeek key in Secret Keys.");
  const authorization = await ports.createSessionRevealAuthorization({ id: key.id, sessionId: caller.sessionId, userId: caller.userId, ttlMs: REVEAL_TTL_MS });
  if (authorization.keyId !== key.id || authorization.keyUpdatedAtMs !== key.updatedAtMs) {
    ports.revokeRevealAuthorization(authorization.authorizationId);
    throw new Error("The DeepSeek key changed while it was being released.");
  }
  return (await ports.revealKeyWithAuthorization({ authorizationId: authorization.authorizationId, id: key.id })).value;
}
