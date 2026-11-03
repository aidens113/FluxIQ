import { automationStudioLlmProviderLabel, type AutomationStudioLlmProviderId } from "../catalog/index.ts";
import { AutomationStudioSecretsLockedError } from "./locked-error.ts";
import type { ModelExecutionOptions } from "../execution/index.ts";
import { invokeOwnedExecutionCallbackSync } from "../../execution-observation/index.ts";
import type { SessionProviderKeyExecutionPorts } from "./execution/index.ts";
import { SessionProviderKeyExecution } from "./execution/dispatch/index.ts";

/** One key as Secret Keys lists it: metadata only, never a value. */
export type AutomationStudioSessionKeySummary = { id: string; kind: string; provider?: string | undefined; enabled: boolean; updatedAtMs: number; createdBy?: string | undefined; metadata?: { model?: unknown } | undefined };

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
export async function releaseAutomationStudioSessionProviderKey(
  ports: AutomationStudioSessionKeyPorts,
  caller: { userId: string; sessionId: string | null },
  options: AutomationStudioSessionKeyOptions & { provider: AutomationStudioLlmProviderId; model?: string },
  execution?: ModelExecutionOptions,
  native?: SessionProviderKeyExecutionPorts
): Promise<string> {
  const observed = new SessionProviderKeyExecution(ports, native, execution);
  const snapshot = observed.pin("snapshot");
  const unlockedSessionFor = observed.pin("unlockedSessionFor");
  const authorizeUseKey = observed.pin("authorizeUseKey");
  const createAuthorization = observed.pin("createSessionRevealAuthorization");
  const revokeAuthorization = observed.pin("revokeRevealAuthorization");
  const reveal = observed.pin("revealKeyWithAuthorization");
  const nativeSnapshot = observed.snapshot;
  const nativeCreate = observed.create;
  const nativeReveal = observed.reveal;
  const nativeRevoke = observed.revoke;
  const nativeUnlocked = observed.unlocked;
  const { keys } = nativeSnapshot && observed.matches(snapshot, nativeSnapshot)
    ? await observed.invoke({ receiver: observed.native, callback: nativeSnapshot, args: [observed.observation] })
    : await observed.originalCall({ receiver: ports, callback: snapshot, args: [] });
  const label = automationStudioLlmProviderLabel(options.provider);
  const candidates = options.flowKeyId ? [flowKey(keys, options.flowKeyId, caller.userId, options.provider, options.model)] : callerKeys(keys, caller.userId, options.provider, options.model);
  if (!candidates.length) throw new Error(`There is no enabled ${label} key of yours in Secret Keys.`);
  const fallback = !unlockedSessionFor ? null : nativeUnlocked && observed.matches(unlockedSessionFor, nativeUnlocked)
    ? await observed.invoke({ receiver: observed.native, callback: nativeUnlocked, args: [caller.userId, observed.observation] })
    : invokeOwnedExecutionCallbackSync(execution?.observation, { receiver: ports, callback: unlockedSessionFor, args: [caller.userId] });
  const sessions = [...new Set([caller.sessionId, fallback].filter((sessionId): sessionId is string => Boolean(sessionId)))];
  let denied = 0;
  let refusal: unknown;
  for (const key of candidates) {
    if (authorizeUseKey && !(await observed.originalCall({ receiver: ports, callback: authorizeUseKey, args: [caller.userId, key.id] }))) {
      denied += 1;
      continue;
    }
    for (const sessionId of sessions) {
      let authorization: { authorizationId: string; keyId: string; keyUpdatedAtMs: number };
      let originalNative: Promise<{ authorizationId: string; keyId: string; keyUpdatedAtMs: number }> | undefined;
      // Any refusal here means this unlock cannot open this key (absent, expired, another user's, or not holding it); the next one is tried.
      try {
        const input = { id: key.id, sessionId, userId: caller.userId, ttlMs: REVEAL_TTL_MS };
        if (nativeCreate && observed.matches(createAuthorization, nativeCreate)) {
          originalNative = observed.start({ receiver: observed.native, callback: nativeCreate, args: [input, observed.observation] });
          authorization = await observed.awaited(originalNative);
        } else authorization = await observed.originalCall({ receiver: ports, callback: createAuthorization, args: [input] });
      } catch (error) {
        if (execution?.observation && (!originalNative || !observed.completedRefusal(error, originalNative))) throw error;
        refusal = error;
        continue;
      }
      if (authorization.keyId !== key.id || authorization.keyUpdatedAtMs !== key.updatedAtMs) {
        if (nativeRevoke && observed.matches(revokeAuthorization, nativeRevoke)) await observed.invoke({ receiver: observed.native, callback: nativeRevoke, args: [authorization.authorizationId, observed.observation] });
        else invokeOwnedExecutionCallbackSync(execution?.observation, { receiver: ports, callback: revokeAuthorization, args: [authorization.authorizationId] });
        throw new Error(`The ${label} key changed while it was being released.`);
      }
      const input = { authorizationId: authorization.authorizationId, id: key.id };
      return (nativeReveal && observed.matches(reveal, nativeReveal)
        ? await observed.invoke({ receiver: observed.native, callback: nativeReveal, args: [input, observed.observation] })
        : await observed.originalCall({ receiver: ports, callback: reveal, args: [input] })).value;
    }
  }
  if (denied === candidates.length) throw new Error("Your permissions do not allow your model key to be used here (secrets:UseKey).");
  throw new AutomationStudioSecretsLockedError({ instanceHost: options.instanceHost, cause: refusal });
}

export function automationStudioSessionKeyProvider(key: AutomationStudioSessionKeySummary): AutomationStudioLlmProviderId | undefined {
  if (key.kind !== "llm") return undefined;
  const provider = (key.provider ?? "deepseek").toLowerCase().replace(/[^a-z0-9]/g, "");
  return provider === "anthropic" || provider === "anthropicclaude" ? "anthropic" : provider === "deepseek" ? "deepseek" : undefined;
}

function isProviderLlmKey(key: AutomationStudioSessionKeySummary, provider: AutomationStudioLlmProviderId, model?: string): boolean {
  return automationStudioSessionKeyProvider(key) === provider && (!model || !key.metadata?.model || key.metadata.model === model);
}

/** The caller's own enabled DeepSeek keys, newest first, then legacy keys nobody is stamped on: only their unlock decides whether those open. */
function callerKeys(keys: readonly AutomationStudioSessionKeySummary[], userId: string, provider: AutomationStudioLlmProviderId, model?: string): AutomationStudioSessionKeySummary[] {
  const usable = keys.filter((key) => key.enabled && isProviderLlmKey(key, provider, model));
  return [...usable.filter((key) => key.createdBy === userId), ...usable.filter((key) => !key.createdBy)];
}

/** The Flow's named key, refused in words when it cannot be the caller's. */
function flowKey(keys: readonly AutomationStudioSessionKeySummary[], keyId: string, userId: string, provider: AutomationStudioLlmProviderId, model?: string): AutomationStudioSessionKeySummary {
  const key = keys.find((entry) => entry.id === keyId);
  if (!key || !key.enabled) throw new Error("This Flow's model key is missing or turned off in Secret Keys.");
  if (!isProviderLlmKey(key, provider, model)) throw new Error(`This Flow's model key is not a matching ${automationStudioLlmProviderLabel(provider)} model key.`);
  if (key.createdBy && key.createdBy !== userId) throw new Error("This Flow's model key belongs to another person, so it cannot pay for your calls.");
  return key;
}
