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
// **Which key (H1 selection fix, H0-S5).** The Flow's own `llmSecretKeyId`
// when it names one; otherwise the caller's own newest enabled DeepSeek key
// (`createdBy` is them), then a legacy key with no owner stamp that their
// unlock actually holds. Never another person's key: this once took the newest
// key of anyone, and the release then refused it, so a member whose key was not
// the newest was locked out of their own. `secrets:UseKey` is asked first,
// through the optional `authorizeUseKey` port; absent allows, and the release
// still needs the caller's own unlock either way.
//
// **Which unlock.** The session the call names (the one the work started from)
// when it is still unlocked and holds the key; otherwise the person's live
// unlock in this workspace (`unlockedSessionFor`), so a sign-out of one browser
// tab does not fail a build another unlock of theirs can pay for. With neither,
// one typed `secrets.locked` error (`secrets-locked-error.ts`).
//
// Structural ports rather than the Secret Keys class: the host passes its
// service, a test passes a few functions, and this directory does not depend on
// another program.

import { AutomationStudioSecretsLockedError } from "./secrets-locked-error.ts";

/** One key as Secret Keys lists it: metadata only, never a value. */
type AutomationStudioSessionKeySummary = { id: string; kind: string; provider?: string | undefined; enabled: boolean; updatedAtMs: number; createdBy?: string | undefined };

/** The Secret Keys operations releasing a person's key needs. */
export type AutomationStudioSessionKeyPorts = {
  /** Every key, most recently changed first, as Secret Keys lists them. */
  snapshot(): Promise<{ keys: AutomationStudioSessionKeySummary[] }>;
  createSessionRevealAuthorization(input: { id: string; sessionId: string; userId: string; ttlMs: number }): Promise<{ authorizationId: string; keyId: string; keyUpdatedAtMs: number }>;
  revealKeyWithAuthorization(input: { authorizationId: string; id: string }): Promise<{ value: string }>;
  revokeRevealAuthorization(authorizationId: string): void;
  /**
   * The person's own live unlock in this workspace that holds a key, or null
   * (Secret Keys' `unlockedSessionFor`). Present, a call whose named session
   * cannot release the key falls back to it; never another user's session.
   */
  unlockedSessionFor?(userId: string): string | null;
  /** `secrets:UseKey` for this person on this key. Absent allows. */
  authorizeUseKey?(userId: string, keyId: string): Promise<boolean>;
};

/** What a call adds to the caller: the Flow's own key, and the host the locked sentence names. */
export type AutomationStudioSessionKeyOptions = {
  /** The Flow's `llmSecretKeyId`, when set: that key and no other. */
  flowKeyId?: string | undefined;
  /** Where the person signs in, for the `secrets.locked` sentence ("app.getfluxiq.com"). */
  instanceHost?: string | undefined;
};

/** How long a one-use reveal may wait before it is claimed. It is claimed on the next line. */
const REVEAL_TTL_MS = 10_000;

/**
 * The key this call may use, released to the caller's own unlock. Throws, in
 * words a person can act on, when there is no such key or `secrets:UseKey`
 * refuses it, and `AutomationStudioSecretsLockedError` when no live unlock of
 * the caller holds it.
 */
export async function releaseAutomationStudioSessionDeepSeekKey(
  ports: AutomationStudioSessionKeyPorts,
  caller: { userId: string; sessionId: string | null },
  options: AutomationStudioSessionKeyOptions = {}
): Promise<string> {
  const { keys } = await ports.snapshot();
  const candidates = options.flowKeyId ? [flowKey(keys, options.flowKeyId, caller.userId)] : callerKeys(keys, caller.userId);
  if (!candidates.length) throw new Error("There is no enabled DeepSeek key of yours in Secret Keys.");
  const fallback = ports.unlockedSessionFor?.(caller.userId) ?? null;
  const sessions = [...new Set([caller.sessionId, fallback].filter((sessionId): sessionId is string => Boolean(sessionId)))];
  let denied = 0;
  let refusal: unknown;
  for (const key of candidates) {
    if (ports.authorizeUseKey && !(await ports.authorizeUseKey(caller.userId, key.id))) {
      denied += 1;
      continue;
    }
    for (const sessionId of sessions) {
      let authorization: { authorizationId: string; keyId: string; keyUpdatedAtMs: number };
      // Any refusal here means this unlock cannot open this key (absent, expired, another user's, or not holding it); the next one is tried.
      try {
        authorization = await ports.createSessionRevealAuthorization({ id: key.id, sessionId, userId: caller.userId, ttlMs: REVEAL_TTL_MS });
      } catch (error) {
        refusal = error;
        continue;
      }
      if (authorization.keyId !== key.id || authorization.keyUpdatedAtMs !== key.updatedAtMs) {
        ports.revokeRevealAuthorization(authorization.authorizationId);
        throw new Error("The DeepSeek key changed while it was being released.");
      }
      return (await ports.revealKeyWithAuthorization({ authorizationId: authorization.authorizationId, id: key.id })).value;
    }
  }
  if (denied === candidates.length) throw new Error("Your permissions do not allow your model key to be used here (secrets:UseKey).");
  throw new AutomationStudioSecretsLockedError({ instanceHost: options.instanceHost, cause: refusal });
}

function isDeepSeekLlmKey(key: AutomationStudioSessionKeySummary): boolean {
  return key.kind === "llm" && (!key.provider || key.provider.toLowerCase() === "deepseek");
}

/** The caller's own enabled DeepSeek keys, newest first, then legacy keys nobody is stamped on: only their unlock decides whether those open. */
function callerKeys(keys: readonly AutomationStudioSessionKeySummary[], userId: string): AutomationStudioSessionKeySummary[] {
  const usable = keys.filter((key) => key.enabled && isDeepSeekLlmKey(key));
  return [...usable.filter((key) => key.createdBy === userId), ...usable.filter((key) => !key.createdBy)];
}

/** The Flow's named key, refused in words when it cannot be the caller's. */
function flowKey(keys: readonly AutomationStudioSessionKeySummary[], keyId: string, userId: string): AutomationStudioSessionKeySummary {
  const key = keys.find((entry) => entry.id === keyId);
  if (!key || !key.enabled) throw new Error("This Flow's model key is missing or turned off in Secret Keys.");
  if (!isDeepSeekLlmKey(key)) throw new Error("This Flow's model key is not a DeepSeek model key.");
  if (key.createdBy && key.createdBy !== userId) throw new Error("This Flow's model key belongs to another person, so it cannot pay for your calls.");
  return key;
}
