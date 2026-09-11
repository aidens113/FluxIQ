import { randomUUID } from "node:crypto";
import type { IdentityAccessService } from "../../../identity-access/index.ts";
import type { SecretKeysService } from "../../../secret-keys/index.ts";
import { createAutomationStudioDeepSeekProvider } from "./provider-factories.ts";
import {
  AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_ESTIMATED_COST_USD,
  resolveAutomationStudioLlmTokenLimits,
  type AutomationStudioLlmProvider,
  type AutomationStudioLlmTaskKind,
  type AutomationStudioLlmTaskRequest,
  type AutomationStudioLlmTokenLimits
} from "./harness.ts";
import { AUTOMATION_STUDIO_LLM_MAX_TIMEOUT_MS } from "./provider-contract.ts";

const LIMITS: AutomationStudioLlmTokenLimits = { maxInputTokens: 8000, maxOutputTokens: 2000, maxTotalTokens: 10000 };
const TIMEOUT_MS = 20_000;
const COST_USD = 0.25;
const MAX_TTL_MS = 300_000;
export const AUTOMATION_STUDIO_LLM_EXECUTION_GRANT_MAX_CALLS = 8;
const MAX_TOTAL_COST_USD = 2;
export const AUTOMATION_STUDIO_LLM_HIGH_TOKEN_CONFIRMATION_THRESHOLD = 100_000;

export type AutomationStudioLlmExecutionGrantPurpose = "diagnosis_only" | "diagnose_and_adapt" | "build_and_adapt";

export type AutomationStudioLlmExecutionGrantResolvePolicy = {
  allowedTaskKinds?: readonly AutomationStudioLlmTaskKind[];
};

export type AutomationStudioLlmExecutionBinding = {
  executionDigest: string;
  settingsRevision: number;
};

export type AutomationStudioLlmExecutionGrantMetadata = {
  grantId: string;
  keyId: string;
  provider: "deepseek";
  model: "deepseek-chat";
  projectId: string;
  flowId: string;
  executionDigest: string;
  purpose: AutomationStudioLlmExecutionGrantPurpose;
  keyUpdatedAtMs: number;
  settingsRevision?: number;
  tokenLimits: AutomationStudioLlmTokenLimits;
  maxCalls: number;
  maxEstimatedCostUsd: number;
  maxTotalEstimatedCostUsd: number;
  timeoutMs: number;
  providerRetryCount: 0;
  expiresAtMs: number;
  remainingUses: number;
};

type StoredGrant = AutomationStudioLlmExecutionGrantMetadata & {
  actorUserId: string;
  actorSessionId: string;
  revealAuthorizationIds: string[];
  state: "available" | "claimed";
  callInFlight: boolean;
  inFlightAuthorizationId: string | undefined;
  inFlightAbortController: AbortController | undefined;
  committedEstimatedCostUsd: number;
  expiryTimer: ReturnType<typeof setTimeout>;
};

type RequestedExecutionLimits = {
  tokenLimits?: Partial<AutomationStudioLlmTokenLimits>;
  maxCalls?: number;
  maxEstimatedCostUsd?: number;
  maxTotalEstimatedCostUsd?: number;
  timeoutMs?: number;
  providerRetryCount?: number;
  purpose?: AutomationStudioLlmExecutionGrantPurpose;
};

type GrantScope = {
  grantId: string;
  actorUserId: string;
  actorSessionId: string;
  projectId: string;
  flowId: string;
  purpose: AutomationStudioLlmExecutionGrantPurpose;
};

export class AutomationStudioLlmExecutionGrantService {
  private readonly grants = new Map<string, StoredGrant>();

  constructor(private readonly options: {
    identityAccess: IdentityAccessService;
    secretKeys: SecretKeysService;
    resolveExecutionDigest: (projectId: string, flowId: string) => Promise<string | AutomationStudioLlmExecutionBinding>;
    fetchImpl?: typeof fetch;
    now?: () => number;
  }) {}

  async preflight(input: { keyId: string; projectId: string; flowId: string; provider?: string; model?: string } & RequestedExecutionLimits): Promise<Omit<AutomationStudioLlmExecutionGrantMetadata, "grantId" | "expiresAtMs" | "remainingUses">> {
    const key = await this.options.secretKeys.getKeySummary(input.keyId);
    if (!key || !key.enabled || key.kind !== "llm") throw new Error("An enabled LLM key is required.");
    validateKeyCompatibility(key, input);
    const projectId = required(input.projectId);
    const flowId = required(input.flowId);
    const purpose = executionGrantPurpose(input.purpose);
    const binding = executionBinding(await this.options.resolveExecutionDigest(projectId, flowId), purpose);
    const maxCalls = input.maxCalls ?? (purpose === "diagnosis_only" ? 1 : purpose === "diagnose_and_adapt" ? 2 : 4);
    if (!Number.isInteger(maxCalls) || maxCalls <= 0 || maxCalls > AUTOMATION_STUDIO_LLM_EXECUTION_GRANT_MAX_CALLS) throw new Error("LLM execution call limit is invalid.");
    if (purpose === "diagnosis_only" && maxCalls !== 1) throw new Error("diagnosis_only permits exactly one LLM call.");
    if (purpose === "diagnose_and_adapt" && maxCalls !== 2) throw new Error("diagnose_and_adapt permits exactly two LLM calls.");
    if ((input.providerRetryCount ?? 0) !== 0) throw new Error("LLM execution grants do not permit provider retries.");
    const tokenResolution = resolveAutomationStudioLlmTokenLimits(input.tokenLimits ?? LIMITS);
    if (tokenResolution.diagnostics.length) throw new Error("LLM token limits are invalid.");
    const maxEstimatedCostUsd = input.maxEstimatedCostUsd ?? COST_USD;
    if (!Number.isFinite(maxEstimatedCostUsd) || maxEstimatedCostUsd <= 0 || maxEstimatedCostUsd > Math.min(COST_USD, AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_ESTIMATED_COST_USD)) throw new Error("LLM estimated-cost limit is invalid.");
    const defaultTotalCost = Math.min(MAX_TOTAL_COST_USD, maxEstimatedCostUsd * maxCalls);
    const maxTotalEstimatedCostUsd = input.maxTotalEstimatedCostUsd ?? defaultTotalCost;
    if (!Number.isFinite(maxTotalEstimatedCostUsd) || maxTotalEstimatedCostUsd <= 0 || maxTotalEstimatedCostUsd > MAX_TOTAL_COST_USD || maxTotalEstimatedCostUsd < maxEstimatedCostUsd) throw new Error("LLM total estimated-cost limit is invalid.");
    const timeoutMs = input.timeoutMs ?? TIMEOUT_MS;
    if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > AUTOMATION_STUDIO_LLM_MAX_TIMEOUT_MS) throw new Error("LLM timeout limit is invalid.");
    return {
      keyId: key.id,
      provider: "deepseek",
      model: "deepseek-chat",
      projectId,
      flowId,
      executionDigest: binding.executionDigest,
      purpose,
      keyUpdatedAtMs: key.updatedAtMs,
      ...(binding.settingsRevision !== undefined ? { settingsRevision: binding.settingsRevision } : {}),
      tokenLimits: tokenResolution.limits,
      maxCalls,
      maxEstimatedCostUsd,
      maxTotalEstimatedCostUsd,
      timeoutMs,
      providerRetryCount: 0
    };
  }

  async issue(input: {
    actorUserId: string;
    actorSessionId: string;
    highTokenConfirmation?: boolean;
    keyId: string;
    projectId: string;
    flowId: string;
    provider?: string;
    model?: string;
    ttlMs?: number;
    maxUses?: number;
  } & RequestedExecutionLimits): Promise<AutomationStudioLlmExecutionGrantMetadata> {
    if ((input.purpose ?? "diagnosis_only") === "diagnosis_only" && (input.maxUses ?? 1) !== 1) throw new Error("LLM execution grants are one-use.");
    const session = await this.options.identityAccess.validateSession(input.actorSessionId, this.now());
    if (!session || session.user.id !== input.actorUserId) throw new Error("LLM execution actor session is unavailable.");
    const safe = await this.preflight(input);
    const aggregateAuthorizedTokens = safe.tokenLimits.maxTotalTokens * safe.maxCalls;
    if (aggregateAuthorizedTokens > AUTOMATION_STUDIO_LLM_HIGH_TOKEN_CONFIRMATION_THRESHOLD && input.highTokenConfirmation !== true) {
      throw new Error("High-token LLM execution requires explicit confirmation.");
    }
    if (input.maxUses !== undefined && input.maxUses !== safe.maxCalls) throw new Error("LLM execution grant uses must match its call limit.");
    const ttlMs = input.ttlMs ?? 60_000;
    if (!Number.isInteger(ttlMs) || ttlMs < 1000 || ttlMs > MAX_TTL_MS) throw new Error("LLM execution grant TTL is invalid.");
    const authorizedKey = await this.options.secretKeys.getKeySummary(input.keyId);
    if (!authorizedKey || authorizedKey.updatedAtMs !== safe.keyUpdatedAtMs) throw new Error("LLM key changed during grant authorization.");
    validateKeyCompatibility(authorizedKey, safe);
    const revealAuthorizationIds: string[] = [];
    const revealAuthorizationExpiryTimes: number[] = [];
    try {
      for (let index = 0; index < safe.maxCalls; index += 1) {
        const authorization = await this.options.secretKeys.createSessionRevealAuthorization({
          id: input.keyId,
          sessionId: input.actorSessionId,
          userId: input.actorUserId,
          ttlMs,
          nowMs: this.now()
        });
        if (authorization.keyId !== authorizedKey.id || authorization.keyUpdatedAtMs !== authorizedKey.updatedAtMs) {
          this.options.secretKeys.revokeRevealAuthorization(authorization.authorizationId);
          throw new Error("LLM key changed during grant authorization.");
        }
        revealAuthorizationIds.push(authorization.authorizationId);
        revealAuthorizationExpiryTimes.push(authorization.expiresAtMs);
      }
      const currentBinding = executionBinding(await this.options.resolveExecutionDigest(safe.projectId, safe.flowId), safe.purpose);
      if (currentBinding.executionDigest !== safe.executionDigest || currentBinding.settingsRevision !== safe.settingsRevision) {
        throw new Error("Flow or settings changed during grant authorization.");
      }
    } catch (error) {
      for (const authorizationId of revealAuthorizationIds) this.options.secretKeys.revokeRevealAuthorization(authorizationId);
      throw error;
    }
    const grantId = `llm-grant:${randomUUID()}`;
    const expiresAtMs = Math.min(...revealAuthorizationExpiryTimes);
    const remainingTtlMs = expiresAtMs - this.now();
    if (!Number.isFinite(expiresAtMs) || remainingTtlMs <= 0) {
      for (const authorizationId of revealAuthorizationIds) this.options.secretKeys.revokeRevealAuthorization(authorizationId);
      throw new Error("LLM execution grant expired during authorization.");
    }
    const expiryTimer = setTimeout(() => this.revoke(grantId, new DOMException("LLM execution grant deadline exceeded.", "TimeoutError")), remainingTtlMs);
    expiryTimer.unref?.();
    const grant: StoredGrant = {
      ...safe,
      grantId,
      expiresAtMs,
      remainingUses: safe.maxCalls,
      actorUserId: input.actorUserId,
      actorSessionId: input.actorSessionId,
      revealAuthorizationIds,
      state: "available",
      callInFlight: false,
      inFlightAuthorizationId: undefined,
      inFlightAbortController: undefined,
      committedEstimatedCostUsd: 0,
      expiryTimer
    };
    this.grants.set(grantId, grant);
    return publicGrant(grant);
  }

  async inspectAvailable(input: GrantScope): Promise<AutomationStudioLlmExecutionGrantMetadata> {
    executionGrantPurpose(input.purpose);
    const grant = this.grants.get(input.grantId);
    if (!grant || grant.state !== "available" || grant.expiresAtMs <= this.now()) {
      this.revoke(input.grantId);
      throw new Error("LLM execution grant is unavailable.");
    }
    if (!sameScope(grant, input)) {
      this.revoke(input.grantId);
      throw new Error("LLM execution grant scope mismatch.");
    }
    const [session, key, unresolvedBinding] = await Promise.all([
      this.options.identityAccess.validateSession(input.actorSessionId, this.now()),
      this.options.secretKeys.getKeySummary(grant.keyId),
      this.options.resolveExecutionDigest(grant.projectId, grant.flowId)
    ]);
    const binding = executionBinding(unresolvedBinding, grant.purpose);
    if (this.grants.get(grant.grantId) !== grant || grant.state !== "available" || grant.expiresAtMs <= this.now()) {
      this.revoke(input.grantId);
      throw new Error("LLM execution grant is unavailable.");
    }
    if (!session || session.user.id !== input.actorUserId
      || !key || !key.enabled || key.kind !== "llm" || key.updatedAtMs !== grant.keyUpdatedAtMs
      || binding.executionDigest !== grant.executionDigest || binding.settingsRevision !== grant.settingsRevision) {
      this.revoke(input.grantId);
      throw new Error("LLM execution grant is no longer valid.");
    }
    validateKeyCompatibility(key, grant);
    return publicGrant(grant);
  }

  async resolve(input: GrantScope, policy: AutomationStudioLlmExecutionGrantResolvePolicy = {}): Promise<{
    provider: AutomationStudioLlmProvider;
    tokenLimits: AutomationStudioLlmTokenLimits;
    maxCallsPerRun: number;
    maxEstimatedCostUsd: number;
    maxTotalEstimatedCostUsd: number;
    timeoutMs: number;
    providerRetryCount: 0;
  }> {
    try {
      executionGrantPurpose(input.purpose);
    } catch (error) {
      this.revoke(input.grantId);
      throw error;
    }
    const grant = this.claimGrant(input);
    try {
      await this.validateClaimedGrant(grant, input);
    } catch (error) {
      this.revoke(grant.grantId);
      throw error;
    }
    const provider: AutomationStudioLlmProvider = {
      metadata: { provider: grant.provider, model: grant.model },
      runTask: async (request, execution) => {
        const call = this.claimCall(grant, input, request, policy);
        const cancellation = () => this.revoke(grant.grantId);
        if (execution?.signal?.aborted) {
          cancellation();
          throw new Error("LLM execution grant was cancelled.");
        }
        execution?.signal?.addEventListener("abort", cancellation, { once: true });
        try {
          await this.validateClaimedGrant(grant, input);
          const delegate = createAutomationStudioDeepSeekProvider({
            secretReference: { kind: "secret_reference", id: grant.keyId },
            ...(this.options.fetchImpl ? { fetchImpl: this.options.fetchImpl } : {}),
            resolveSecret: async (secretRequest) => {
              try {
                await this.validateClaimedGrant(grant, input);
                if (secretRequest.projectId !== grant.projectId || secretRequest.flowId !== grant.flowId) throw new Error("LLM execution scope mismatch.");
                const revealed = await this.options.secretKeys.revealKeyWithAuthorization({ authorizationId: call.authorizationId, id: grant.keyId });
                validateRevealedKey(revealed.key, grant);
                await this.validateClaimedGrant(grant, input);
                if (call.signal.aborted || this.grants.get(grant.grantId) !== grant || grant.state !== "claimed" || grant.expiresAtMs <= this.now()) {
                  revealed.value = "";
                  throw new Error("LLM execution grant is unavailable.");
                }
                const secret = revealed.value;
                if (secretRequest.outboundBody.includes(secret)) {
                  revealed.value = "";
                  throw new Error("LLM execution request contains the configured credential.");
                }
                return secret;
              } catch (error) {
                this.revoke(grant.grantId);
                throw error;
              }
            }
          });
          const result = await delegate.runTask(request, { signal: call.signal });
          await this.commitCall(grant, input, call.controller);
          return result;
        } catch (error) {
          this.revoke(grant.grantId);
          throw error;
        } finally {
          execution?.signal?.removeEventListener("abort", cancellation);
        }
      }
    };
    return {
      provider,
      tokenLimits: grant.tokenLimits,
      maxCallsPerRun: grant.maxCalls,
      maxEstimatedCostUsd: grant.maxEstimatedCostUsd,
      maxTotalEstimatedCostUsd: grant.maxTotalEstimatedCostUsd,
      timeoutMs: grant.timeoutMs,
      providerRetryCount: 0
    };
  }
  revoke(grantId: string, reason?: unknown): void {
    const grant = this.grants.get(grantId);
    if (!grant) return;
    clearTimeout(grant.expiryTimer);
    grant.inFlightAbortController?.abort(reason);
    grant.inFlightAbortController = undefined;
    for (const authorizationId of grant.revealAuthorizationIds) this.options.secretKeys.revokeRevealAuthorization(authorizationId);
    if (grant.inFlightAuthorizationId) this.options.secretKeys.revokeRevealAuthorization(grant.inFlightAuthorizationId);
    grant.revealAuthorizationIds.length = 0;
    grant.inFlightAuthorizationId = undefined;
    grant.remainingUses = 0;
    this.grants.delete(grantId);
  }

  cancel(grantId: string): void { this.revoke(grantId); }

  revokeForUser(actorUserId: string): void {
    for (const grant of [...this.grants.values()]) if (grant.actorUserId === actorUserId) this.revoke(grant.grantId);
  }

  revokeForSession(actorSessionId: string): void {
    for (const grant of [...this.grants.values()]) if (grant.actorSessionId === actorSessionId) this.revoke(grant.grantId);
  }

  activeGrantCount(): number { return this.grants.size; }

  close(): void {
    for (const grantId of [...this.grants.keys()]) this.revoke(grantId);
  }
  private claimGrant(input: GrantScope): StoredGrant {
    const grant = this.grants.get(input.grantId);
    if (!grant || grant.state !== "available") throw new Error("LLM execution grant is unavailable.");
    if (grant.expiresAtMs <= this.now()) {
      this.revoke(input.grantId);
      throw new Error("LLM execution grant is unavailable.");
    }
    if (!sameScope(grant, input)) {
      this.revoke(input.grantId);
      throw new Error("LLM execution grant scope mismatch.");
    }
    grant.state = "claimed";
    return grant;
  }

  private claimCall(grant: StoredGrant, input: GrantScope, request: AutomationStudioLlmTaskRequest, policy: AutomationStudioLlmExecutionGrantResolvePolicy): { authorizationId: string; controller: AbortController; signal: AbortSignal } {
    if (this.grants.get(grant.grantId) !== grant || grant.state !== "claimed" || grant.expiresAtMs <= this.now() || grant.remainingUses <= 0) {
      throw new Error("LLM execution grant is unavailable.");
    }
    if (!sameScope(grant, input)) throw new Error("LLM execution grant scope mismatch.");
    if (grant.callInFlight) throw new Error("LLM execution grant already has a call in progress.");
    if (!requestMatchesGrant(request, grant, policy)) {
      this.revoke(grant.grantId);
      throw new Error("LLM execution request mismatch.");
    }
    if (roundedCost(grant.committedEstimatedCostUsd + request.maxEstimatedCostUsd) > grant.maxTotalEstimatedCostUsd) {
      this.revoke(grant.grantId);
      throw new Error("LLM execution total estimated-cost limit exceeded.");
    }
    const authorizationId = grant.revealAuthorizationIds.shift();
    if (!authorizationId) {
      this.revoke(grant.grantId);
      throw new Error("LLM execution grant is unavailable.");
    }
    const controller = new AbortController();
    grant.callInFlight = true;
    grant.inFlightAuthorizationId = authorizationId;
    grant.inFlightAbortController = controller;
    grant.remainingUses -= 1;
    grant.committedEstimatedCostUsd = roundedCost(grant.committedEstimatedCostUsd + request.maxEstimatedCostUsd);
    return { authorizationId, controller, signal: controller.signal };
  }

  private async commitCall(grant: StoredGrant, input: GrantScope, controller: AbortController): Promise<void> {
    if (controller.signal.aborted || grant.inFlightAbortController !== controller) throw new Error("LLM execution grant is unavailable.");
    await this.validateClaimedGrant(grant, input);
    if (controller.signal.aborted || this.grants.get(grant.grantId) !== grant || grant.inFlightAbortController !== controller) {
      throw new Error("LLM execution grant is unavailable.");
    }
    grant.callInFlight = false;
    grant.inFlightAuthorizationId = undefined;
    grant.inFlightAbortController = undefined;
    if (grant.remainingUses === 0) this.revoke(grant.grantId);
  }

  private async validateClaimedGrant(grant: StoredGrant, input: GrantScope): Promise<void> {
    if (this.grants.get(grant.grantId) !== grant || grant.state !== "claimed" || grant.expiresAtMs <= this.now()) throw new Error("LLM execution grant is unavailable.");
    if (!sameScope(grant, input)) throw new Error("LLM execution grant scope mismatch.");
    const [session, key, unresolvedBinding] = await Promise.all([
      this.options.identityAccess.validateSession(input.actorSessionId, this.now()),
      this.options.secretKeys.getKeySummary(grant.keyId),
      this.options.resolveExecutionDigest(grant.projectId, grant.flowId)
    ]);
    const binding = executionBinding(unresolvedBinding, grant.purpose);
    if (this.grants.get(grant.grantId) !== grant || grant.state !== "claimed" || grant.expiresAtMs <= this.now()) throw new Error("LLM execution grant is unavailable.");
    if (!session || session.user.id !== input.actorUserId
      || !key || !key.enabled || key.kind !== "llm" || key.updatedAtMs !== grant.keyUpdatedAtMs
      || binding.executionDigest !== grant.executionDigest || binding.settingsRevision !== grant.settingsRevision) {
      throw new Error("LLM execution grant is no longer valid.");
    }
    validateKeyCompatibility(key, grant);
  }

  private now(): number { return (this.options.now ?? Date.now)(); }
}

function validateKeyCompatibility(key: { provider?: string | undefined; scope: string; scopeRef?: string | undefined; metadata?: Record<string, unknown> | undefined }, input: { provider?: string; model?: string; flowId: string }): void {
  if ((input.provider ?? key.provider)?.trim().toLowerCase() !== "deepseek" || (key.provider && key.provider.trim().toLowerCase() !== "deepseek")) throw new Error("LLM provider mismatch.");
  const model = input.model ?? (typeof key.metadata?.model === "string" ? key.metadata.model : "deepseek-chat");
  if (model !== "deepseek-chat" || (typeof key.metadata?.model === "string" && key.metadata.model !== "deepseek-chat")) throw new Error("LLM model mismatch.");
  if (key.scope === "flow" && key.scopeRef !== input.flowId) throw new Error("LLM key Flow scope mismatch.");
  if (key.scope !== "global" && key.scope !== "flow") throw new Error("LLM key scope is incompatible.");
}

function validateRevealedKey(key: { id: string; enabled: boolean; kind: string; provider?: string | undefined; scope: string; scopeRef?: string | undefined; updatedAtMs: number; metadata?: Record<string, unknown> | undefined }, expected: { keyId: string; provider: string; model: string; flowId: string; keyUpdatedAtMs?: number }): void {
  if (key.id !== expected.keyId || !key.enabled || key.kind !== "llm" || (expected.keyUpdatedAtMs !== undefined && key.updatedAtMs !== expected.keyUpdatedAtMs)) throw new Error("LLM key changed during grant authorization.");
  validateKeyCompatibility(key, { provider: expected.provider, model: expected.model, flowId: expected.flowId });
}

function sameScope(grant: StoredGrant, input: GrantScope): boolean {
  return grant.actorUserId === input.actorUserId && grant.actorSessionId === input.actorSessionId && grant.projectId === input.projectId
    && grant.flowId === input.flowId && grant.purpose === input.purpose;
}

function publicGrant(grant: StoredGrant): AutomationStudioLlmExecutionGrantMetadata {
  return {
    grantId: grant.grantId,
    keyId: grant.keyId,
    provider: grant.provider,
    model: grant.model,
    projectId: grant.projectId,
    flowId: grant.flowId,
    executionDigest: grant.executionDigest,
    purpose: grant.purpose,
    keyUpdatedAtMs: grant.keyUpdatedAtMs,
    ...(grant.settingsRevision !== undefined ? { settingsRevision: grant.settingsRevision } : {}),
    tokenLimits: grant.tokenLimits,
    maxCalls: grant.maxCalls,
    maxEstimatedCostUsd: grant.maxEstimatedCostUsd,
    maxTotalEstimatedCostUsd: grant.maxTotalEstimatedCostUsd,
    timeoutMs: grant.timeoutMs,
    providerRetryCount: 0,
    expiresAtMs: grant.expiresAtMs,
    remainingUses: grant.remainingUses
  };
}

function executionGrantPurpose(value: unknown): AutomationStudioLlmExecutionGrantPurpose {
  if (value === undefined || value === "diagnosis_only") return "diagnosis_only";
  if (value === "diagnose_and_adapt") return "diagnose_and_adapt";
  if (value === "build_and_adapt") return "build_and_adapt";
  throw new Error("LLM execution grant purpose is unsupported.");
}

function executionBinding(value: string | AutomationStudioLlmExecutionBinding, purpose: AutomationStudioLlmExecutionGrantPurpose): { executionDigest: string; settingsRevision?: number } {
  if (typeof value === "string") {
    if (purpose !== "diagnosis_only") throw new Error(`${purpose} requires an exact Flow settings revision.`);
    return { executionDigest: requiredDigest(value) };
  }
  const executionDigest = requiredDigest(value.executionDigest);
  if (!Number.isInteger(value.settingsRevision) || value.settingsRevision < 0) throw new Error("LLM Flow settings revision is invalid.");
  return { executionDigest, settingsRevision: value.settingsRevision };
}

function requestMatchesGrant(request: AutomationStudioLlmTaskRequest, grant: StoredGrant, policy: AutomationStudioLlmExecutionGrantResolvePolicy): boolean {
  if (policy.allowedTaskKinds && !policy.allowedTaskKinds.includes(request.taskKind)) return false;
  let taskAllowed: boolean;
  switch (grant.purpose) {
    case "diagnosis_only":
      taskAllowed = request.taskKind === "runtime_diagnosis" && request.expectedOutput === "diagnosis";
      break;
    case "diagnose_and_adapt":
      taskAllowed = (request.taskKind === "runtime_diagnosis" && request.expectedOutput === "diagnosis")
        || (request.taskKind === "runtime_patch" && request.expectedOutput === "runtime_patch");
      break;
    case "build_and_adapt":
      taskAllowed = (request.taskKind === "flow_bootstrap" && request.expectedOutput === "flow_bootstrap")
        || (request.taskKind === "evidence_tool_decision" && request.expectedOutput === "evidence_tool_decision")
        || (request.taskKind === "runtime_diagnosis" && request.expectedOutput === "diagnosis")
        || (request.taskKind === "runtime_patch" && request.expectedOutput === "runtime_patch")
        || (request.taskKind === "instruction_suggestion" && request.expectedOutput === "instruction_suggestion")
        || (["router_patch", "subflow_patch", "expectation_action_target_patch", "change_proposal_generation"].includes(request.taskKind) && request.expectedOutput === "change_proposal");
      break;
    default: {
      const unsupported: never = grant.purpose;
      return unsupported;
    }
  }
  return taskAllowed
    && request.context.projectId === grant.projectId
    && request.context.flowId === grant.flowId
    && Number.isInteger(request.timeoutMs) && request.timeoutMs > 0 && request.timeoutMs <= grant.timeoutMs
    && Number.isFinite(request.maxEstimatedCostUsd) && request.maxEstimatedCostUsd > 0 && request.maxEstimatedCostUsd <= grant.maxEstimatedCostUsd
    && request.tokenLimits.maxInputTokens <= grant.tokenLimits.maxInputTokens
    && request.tokenLimits.maxOutputTokens <= grant.tokenLimits.maxOutputTokens
    && request.tokenLimits.maxTotalTokens <= grant.tokenLimits.maxTotalTokens;
}
function roundedCost(value: number): number {
  return Math.round(value * 1_000_000_000) / 1_000_000_000;
}

function requiredDigest(value: string): string {
  const clean = value.trim();
  if (!clean) throw new Error("Flow execution dependency digest is required.");
  return clean;
}
function required(value: string): string {
  const clean = value.trim();
  if (!clean) throw new Error("Project and Flow are required.");
  return clean;
}
