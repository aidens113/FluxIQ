import { automationStudioLlmProviderLabel, type AutomationStudioLlmProviderId } from "../catalog/index.ts";

/** One key as Secret Keys lists it: metadata only, never a value. */
export type AutomationStudioSessionKeySummary = { id: string; name?: string | undefined; kind: string; provider?: string | undefined; enabled: boolean; updatedAtMs: number; createdBy?: string | undefined; metadata?: { model?: unknown } | undefined };

/** The Secret Keys operations releasing a person's key needs. */
export type AutomationStudioSessionKeyPorts = {
  /** Current authenticated principal authorizes use; the host's protection key opens the stored key, so no held session is needed. Required: ports without it are refused. */
  createUseAuthorization(input: { id: string; userId: string; sessionId: string; ttlMs: number; workspaceAssistant?: true }): Promise<{ authorizationId: string; keyId: string; keyUpdatedAtMs: number }>;
  /** Every key, most recently changed first, as Secret Keys lists them. */
  snapshot(): Promise<{ keys: AutomationStudioSessionKeySummary[] }>;
  revealKeyWithAuthorization(input: { authorizationId: string; id: string }): Promise<{ value: string }>;
  revokeRevealAuthorization(authorizationId: string): void;
  /** `secrets:UseKey` for this person on this key. Absent allows. */
  authorizeUseKey?(userId: string, keyId: string): Promise<boolean>;
};

/** What a call adds to the caller: the Flow's own key and the workspace payer. */
export type AutomationStudioSessionKeyOptions = {
  /** The Flow's `llmSecretKeyId`, when set: that key and no other. */
  flowKeyId?: string | undefined;
  /** Host-selected workspace payer; use authority must independently verify the owner offer and workspace choice. */
  keyOwnerUserId?: string | undefined;
};

/** How long a one-use reveal may wait before it is claimed. It is claimed on the next line. */
const REVEAL_TTL_MS = 10_000;

/**
 * The key this call may use, released to the caller's own authenticated
 * principal. Throws, in words a person can act on, when there is no such key,
 * `secrets:UseKey` refuses it, or the saved key needs recovery.
 */
export async function releaseAutomationStudioSessionProviderKey(
  ports: AutomationStudioSessionKeyPorts,
  caller: { userId: string; sessionId: string | null },
  options: AutomationStudioSessionKeyOptions & { provider: AutomationStudioLlmProviderId; model?: string }
): Promise<string> {
  const { keys } = await ports.snapshot();
  const label = automationStudioLlmProviderLabel(options.provider);
  const candidates = options.flowKeyId ? [flowKey(keys, options.flowKeyId, options.keyOwnerUserId ?? caller.userId, options.provider, options.model)] : callerKeys(keys, caller.userId, options.provider, options.model);
  if (!candidates.length) throw new Error(`There is no enabled ${label} key of yours in Secret Keys.`);
  let denied = 0;
  let refusal: unknown;
  for (const key of candidates) {
    if (ports.authorizeUseKey && !(await ports.authorizeUseKey(caller.userId, key.id))) {
      denied += 1;
      continue;
    }
    if (!caller.sessionId) throw new Error("A current authenticated principal is required to use a model key.");
    let authorization: { authorizationId: string; keyId: string; keyUpdatedAtMs: number };
    try {
      authorization = await ports.createUseAuthorization({ id: key.id, userId: caller.userId, sessionId: caller.sessionId, ttlMs: REVEAL_TTL_MS, ...(options.keyOwnerUserId ? { workspaceAssistant: true as const } : {}) });
    } catch (error) {
      const code = error instanceof Error ? (error as Error & { code?: unknown }).code : undefined;
      if (options.flowKeyId || !["legacy_recovery_required", "host_protection_unavailable", "ciphertext_invalid"].includes(String(code))) throw error;
      refusal = error;
      continue;
    }
    if (authorization.keyId !== key.id || authorization.keyUpdatedAtMs !== key.updatedAtMs) {
      ports.revokeRevealAuthorization(authorization.authorizationId);
      throw new Error(`The ${label} key changed while it was being released.`);
    }
    return (await ports.revealKeyWithAuthorization({ authorizationId: authorization.authorizationId, id: key.id })).value;
  }
  if (denied === candidates.length) throw new Error("Your permissions do not allow your model key to be used here (secrets:UseKey).");
  throw refusal ?? new Error("No configured model key is available for this request.");
}

export function automationStudioSessionKeyProvider(key: AutomationStudioSessionKeySummary): AutomationStudioLlmProviderId | undefined {
  if (key.kind !== "llm") return undefined;
  const provider = (key.provider ?? "deepseek").toLowerCase().replace(/[^a-z0-9]/g, "");
  return provider === "anthropic" || provider === "anthropicclaude" ? "anthropic" : provider === "deepseek" ? "deepseek" : undefined;
}

function isProviderLlmKey(key: AutomationStudioSessionKeySummary, provider: AutomationStudioLlmProviderId, model?: string): boolean {
  return automationStudioSessionKeyProvider(key) === provider && (!model || !key.metadata?.model || key.metadata.model === model);
}

/** The caller's own enabled DeepSeek keys, newest first, then legacy keys nobody is stamped on. */
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
