import { randomUUID } from "node:crypto";
import { parseAutomationStudioPermittedConsequences, type AutomationStudioActionConsequence } from "../action-permissions/index.ts";
import type { IdentityAccessService } from "../../../identity-access/index.ts";
import type { SecretKeysService } from "../../../secret-keys/index.ts";
import { createAutomationStudioDeepSeekProvider } from "./provider-factories.ts";
import {
  AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_ESTIMATED_COST_USD,
  resolveAutomationStudioLlmTokenLimits,
  type AutomationStudioLlmProvider,
  type AutomationStudioLlmTaskRequest,
  type AutomationStudioLlmTokenLimits
} from "./harness.ts";
import { AUTOMATION_STUDIO_LLM_MAX_TIMEOUT_MS, automationStudioLlmSignalTimedOut } from "./provider-contract.ts";
import { automationStudioLlmProviderErrorSpendsCall } from "./failure-disposition.ts";
import { automationStudioLlmExecutionGrantMetadata, type AutomationStudioLlmExecutionGrantMetadata } from "./execution-grant-metadata.ts";
import {
  automationStudioLlmExecutionGrantFixedCalls,
  automationStudioLlmExecutionGrantIterates,
  automationStudioLlmRequestMatchesGrant,
  parseAutomationStudioLlmExecutionGrantPurpose,
  type AutomationStudioLlmExecutionGrantPurpose,
  type AutomationStudioLlmExecutionGrantResolvePolicy
} from "./grant-capabilities.ts";

// Sized to deepseek-chat's real 64k context, less room for the reply, rather
// than to a number nobody chose. At 8000 in and 10000 total, describing a real
// page did not fit: measured 2026-09-17, the input guard fired before the
// request was sent on every realistic page in the live corpus -- an infinite
// feed, a multi-tab lookup, an auth gate, an admin console with a virtualised
// list -- and the grant ends on that error, so those runs built nothing at all.
// An empty table tripped it too. A run is bounded by cost, its per-run token
// budget and its deadline; never by a per-request ceiling that makes a real
// page impossible to describe.
const LIMITS: AutomationStudioLlmTokenLimits = { maxInputTokens: 48_000, maxOutputTokens: 8_000, maxTotalTokens: 56_000 };
const TIMEOUT_MS = 20_000;
const COST_USD = 0.25;
const MAX_TTL_MS = 300_000;
/**
 * The absolute backstop on a grant's provider calls.
 *
 * It exists for one thing only: stopping a loop that has genuinely run away. It
 * is deliberately far above what any adaptation needs, so that in normal
 * operation it never binds and never decides anything. The bounds that are meant
 * to decide are cost, tokens, the recovery deadline and a lack of progress, and
 * they live with the run, not with the grant. It is one number for every
 * purpose: a per-mode call count is exactly the coupling this file used to have,
 * where "which mode" silently meant "how many calls", and a recovery that needed
 * a third call was refused because of the name on its grant.
 */
export const AUTOMATION_STUDIO_LLM_EXECUTION_GRANT_MAX_CALLS = 64;

/**
 * What an iterating grant gets when the caller names no number.
 *
 * Configuration, not a property of the purpose. It is a diagnosis, a patch, and
 * the exploration's own default ceiling of twenty-four decisions
 * (`AUTOMATION_STUDIO_EXPLORATION_BUDGET_DEFAULTS.maxProviderCalls`), so the
 * grant is never the thing that stops a recovery which is still learning -- the
 * run's cost, tokens, clock and progress guard are. It is written as a literal
 * because `runtime/llm/` may not import a value out of `runtime/recovery/`; a
 * recovery test pins the two together.
 *
 * Twenty-six calls no longer means twenty-six times the per-call token limit.
 * A grant carries its own whole-run token budget, `maxTotalTokensPerRun`, which
 * defaults to the high-token confirmation threshold, so an ordinary adapting
 * grant needs no confirmation however many calls it may make. A caller that
 * wants a larger run budget asks for one, and confirms it.
 */
export const AUTOMATION_STUDIO_LLM_EXECUTION_GRANT_DEFAULT_MAX_CALLS = 26;
const MAX_TOTAL_COST_USD = 2;
/**
 * When a run's token budget is large enough to be worth confirming.
 *
 * Ten full calls, derived from the per-call limit rather than written down as
 * an absolute, because an absolute silently changes meaning the moment a call
 * gets bigger. It was 100_000 beside a 10_000-token call -- ten calls. When the
 * per-call limit rose to deepseek-chat's real context it became under two
 * calls, and that broke recovery outright: the ledger's pot is capped by this
 * threshold, the patch reserve holds one call's worth of it, and each
 * exploration decision reserves another, so ZERO decisions could fit and every
 * default-grant recovery stopped without exploring. The campaign never saw it,
 * because it passes its own larger run budget.
 *
 * Cost remains the real bound: a grant may not exceed MAX_TOTAL_COST_USD
 * whatever its token budget allows.
 */
export const AUTOMATION_STUDIO_LLM_HIGH_TOKEN_CONFIRMATION_THRESHOLD = LIMITS.maxTotalTokens * 10;

/**
 * How long a claimed grant may keep making calls.
 *
 * A grant has two lifetimes, and they protect different things. The TTL it is
 * issued with is the window in which it may be *claimed*: an authorization
 * nobody picked up must die promptly, so it stays short. Once a run has claimed
 * it, the run is bounded by its own recovery deadline, cost, tokens and
 * no-progress guard, and the claim window has nothing left to protect -- holding
 * a claimed grant to it only turned a sixty-second TTL into a hidden cap on how
 * long an adaptation could iterate. So a claim starts this lease instead.
 *
 * It is a backstop, not the working limit. The host revokes the grant when the
 * run ends; this is what still kills a claimed grant whose run never said so.
 * It matches `AUTOMATION_STUDIO_RECOVERY_MAX_DURATION_CEILING_MS`, and a
 * recovery test pins it at or above that, because the recovery clock starts
 * before the grant is claimed and must be the one that ends a recovery.
 */
export const AUTOMATION_STUDIO_LLM_EXECUTION_GRANT_MAX_RUN_MS = 600_000;

/** The shortest a Secret Keys reveal authorization may be asked to live. */
const MIN_REVEAL_AUTHORIZATION_TTL_MS = 1_000;

export type AutomationStudioLlmExecutionBinding = {
  executionDigest: string;
  settingsRevision: number;
};

export type { AutomationStudioLlmExecutionGrantMetadata } from "./execution-grant-metadata.ts";

type StoredGrant = AutomationStudioLlmExecutionGrantMetadata & {
  actorUserId: string;
  actorSessionId: string;
  /** Minted at issue, one per call, and all live until at least `authorizationsExpireAtMs`. */
  revealAuthorizationIds: string[];
  /** When the authorizations minted at issue lapse: the issue TTL, which a hold does not extend. */
  authorizationsExpireAtMs: number;
  /** Whether a run has started under this grant and holds it (`holdForRun`). */
  heldForRun: boolean;
  state: "available" | "claimed";
  /** When a claimed grant's run lease ends. Absent until it is claimed. */
  runExpiresAtMs: number | undefined;
  callInFlight: boolean;
  inFlightAuthorizationId: string | undefined;
  inFlightAbortController: AbortController | undefined;
  committedEstimatedCostUsd: number;
  committedTotalTokens: number;
  expiryTimer: ReturnType<typeof setTimeout>;
};

/**
 * One call in flight. Its authorization may be exchanged before it is used.
 * `credentialReleased` is set the moment the key is handed to the provider for
 * this call, and `settled` once the call is counted as finished either way.
 */
type ClaimedCall = { authorizationId: string; controller: AbortController; signal: AbortSignal; worstCaseTokens: number; credentialReleased: boolean; settled: boolean };

type RequestedExecutionLimits = {
  tokenLimits?: Partial<AutomationStudioLlmTokenLimits>;
  maxCalls?: number;
  /** The whole run's token budget. Absent means the per-call limit times the
   * calls, held to the high-token confirmation threshold. */
  maxTotalTokensPerRun?: number;
  maxEstimatedCostUsd?: number;
  maxTotalEstimatedCostUsd?: number;
  timeoutMs?: number;
  providerRetryCount?: number;
  purpose?: AutomationStudioLlmExecutionGrantPurpose;
  /** What the person allows the run's actions to do. Absent is none; an unrecognised class refuses the grant. */
  permittedConsequences?: AutomationStudioActionConsequence[];
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
    const purpose = parseAutomationStudioLlmExecutionGrantPurpose(input.purpose);
    const binding = executionBinding(await this.options.resolveExecutionDigest(projectId, flowId), purpose);
    // A purpose that cannot iterate makes the requests its question takes --
    // one, or two for a `verify_result` whose first answer is not `yes` --
    // and a caller may ask for that allowance or for one call. Everything that
    // iterates takes its number from the caller, or from the single configured
    // default.
    const iterates = automationStudioLlmExecutionGrantIterates(purpose);
    const fixedCalls = automationStudioLlmExecutionGrantFixedCalls(purpose);
    const maxCalls = iterates ? input.maxCalls ?? AUTOMATION_STUDIO_LLM_EXECUTION_GRANT_DEFAULT_MAX_CALLS : input.maxCalls ?? fixedCalls;
    if (!iterates && input.maxCalls !== undefined && input.maxCalls !== 1 && input.maxCalls !== fixedCalls) {
      throw new Error(fixedCalls === 1 ? `${purpose} permits exactly one LLM call.` : `${purpose} permits one LLM call or ${fixedCalls}.`);
    }
    if (!Number.isInteger(maxCalls) || maxCalls <= 0 || maxCalls > AUTOMATION_STUDIO_LLM_EXECUTION_GRANT_MAX_CALLS) throw new Error("LLM execution call limit is invalid.");
    if ((input.providerRetryCount ?? 0) !== 0) throw new Error("LLM execution grants do not permit provider retries.");
    const tokenResolution = resolveAutomationStudioLlmTokenLimits(input.tokenLimits ?? LIMITS);
    if (tokenResolution.diagnostics.length) throw new Error("LLM token limits are invalid.");
    // The run's token budget is its own number, not calls times the per-call
    // limit. By default it is that product held to the confirmation threshold,
    // so a grant that may make many calls is not by that fact a high-token one;
    // it can never be less than one call's limit, nor more than every call's.
    const perCallTokens = tokenResolution.limits.maxTotalTokens;
    const callTokenExposure = perCallTokens * maxCalls;
    const maxTotalTokensPerRun = input.maxTotalTokensPerRun
      ?? Math.max(perCallTokens, Math.min(callTokenExposure, AUTOMATION_STUDIO_LLM_HIGH_TOKEN_CONFIRMATION_THRESHOLD));
    if (!Number.isSafeInteger(maxTotalTokensPerRun) || maxTotalTokensPerRun < perCallTokens || maxTotalTokensPerRun > callTokenExposure) {
      throw new Error("LLM total token limit is invalid.");
    }
    const maxEstimatedCostUsd = input.maxEstimatedCostUsd ?? COST_USD;
    if (!Number.isFinite(maxEstimatedCostUsd) || maxEstimatedCostUsd <= 0 || maxEstimatedCostUsd > Math.min(COST_USD, AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_ESTIMATED_COST_USD)) throw new Error("LLM estimated-cost limit is invalid.");
    const defaultTotalCost = Math.min(MAX_TOTAL_COST_USD, maxEstimatedCostUsd * maxCalls);
    const maxTotalEstimatedCostUsd = input.maxTotalEstimatedCostUsd ?? defaultTotalCost;
    if (!Number.isFinite(maxTotalEstimatedCostUsd) || maxTotalEstimatedCostUsd <= 0 || maxTotalEstimatedCostUsd > MAX_TOTAL_COST_USD || maxTotalEstimatedCostUsd < maxEstimatedCostUsd) throw new Error("LLM total estimated-cost limit is invalid.");
    const timeoutMs = input.timeoutMs ?? TIMEOUT_MS;
    if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > AUTOMATION_STUDIO_LLM_MAX_TIMEOUT_MS) throw new Error("LLM timeout limit is invalid.");
    const permittedConsequences = parseAutomationStudioPermittedConsequences(input.permittedConsequences);
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
      maxTotalTokensPerRun,
      maxEstimatedCostUsd,
      maxTotalEstimatedCostUsd,
      timeoutMs,
      providerRetryCount: 0,
      permittedConsequences
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
    // What the person is agreeing the run may spend in tokens. The per-call
    // limit is included so that a single call above the threshold still asks,
    // whatever the run budget says.
    const aggregateAuthorizedTokens = Math.max(safe.maxTotalTokensPerRun, safe.tokenLimits.maxTotalTokens);
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
      authorizationsExpireAtMs: expiresAtMs,
      heldForRun: false,
      remainingUses: safe.maxCalls,
      actorUserId: input.actorUserId,
      actorSessionId: input.actorSessionId,
      revealAuthorizationIds,
      state: "available",
      runExpiresAtMs: undefined,
      callInFlight: false,
      inFlightAuthorizationId: undefined,
      inFlightAbortController: undefined,
      committedEstimatedCostUsd: 0,
      committedTotalTokens: 0,
      expiryTimer
    };
    this.grants.set(grantId, grant);
    return automationStudioLlmExecutionGrantMetadata(grant);
  }

  /**
   * Hold a runtime grant for the run that has just started under it.
   *
   * The claim window protects an authorization nobody picked up, and a started
   * run has picked it up: its recovery claims the grant only once a step fails,
   * which can be minutes in. Measured live on 2026-09-21, a recorded Flow failed
   * 87 s after it started, the sixty-second window had closed, and its recovery
   * ended `llm.provider_resolution_failed` with no call. Held, the window runs
   * to the run's own lease instead, and the host still revokes the grant when
   * the run ends. A grant is held once, by one run, while it is available.
   */
  async holdForRun(input: GrantScope): Promise<void> {
    await this.inspectAvailable(input);
    const grant = this.grants.get(input.grantId);
    if (!grant || grant.state !== "available" || grant.heldForRun) {
      this.revoke(input.grantId);
      throw new Error("LLM execution grant is unavailable.");
    }
    grant.heldForRun = true;
    grant.expiresAtMs = Math.max(grant.expiresAtMs, this.now() + AUTOMATION_STUDIO_LLM_EXECUTION_GRANT_MAX_RUN_MS);
    clearTimeout(grant.expiryTimer);
    grant.expiryTimer = setTimeout(() => this.revoke(grant.grantId, new DOMException("LLM execution grant deadline exceeded.", "TimeoutError")), grant.expiresAtMs - this.now());
    grant.expiryTimer.unref?.();
  }

  async inspectAvailable(input: GrantScope): Promise<AutomationStudioLlmExecutionGrantMetadata> {
    parseAutomationStudioLlmExecutionGrantPurpose(input.purpose);
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
    return automationStudioLlmExecutionGrantMetadata(grant);
  }

  async resolve(input: GrantScope, policy: AutomationStudioLlmExecutionGrantResolvePolicy = {}): Promise<{
    provider: AutomationStudioLlmProvider;
    tokenLimits: AutomationStudioLlmTokenLimits;
    maxCallsPerRun: number;
    maxTotalTokensPerRun: number;
    maxEstimatedCostUsd: number;
    maxTotalEstimatedCostUsd: number;
    timeoutMs: number;
    providerRetryCount: 0;
    /** What the person allowed this run's actions to do: a copy, so the grant's own set is never handed out. */
    permittedConsequences: AutomationStudioActionConsequence[];
  }> {
    try {
      parseAutomationStudioLlmExecutionGrantPurpose(input.purpose);
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
        // The caller's signal says one of two things. A deadline -- the
        // harness's per-call timer, or a loop's clock -- ends this call only;
        // anything else is a cancellation, and a cancellation ends the grant.
        const cancellation = () => {
          if (automationStudioLlmSignalTimedOut(execution?.signal)) this.abandonTimedOutCall(grant, call);
          else this.revoke(grant.grantId);
        };
        if (execution?.signal?.aborted) {
          this.revoke(grant.grantId);
          throw new Error("LLM execution grant was cancelled.");
        }
        execution?.signal?.addEventListener("abort", cancellation, { once: true });
        try {
          await this.validateClaimedGrant(grant, input);
          await this.ensureLiveAuthorization(grant, call);
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
                if (call.signal.aborted || this.grants.get(grant.grantId) !== grant || grant.state !== "claimed" || this.expired(grant)) {
                  revealed.value = "";
                  throw new Error("LLM execution grant is unavailable.");
                }
                const secret = revealed.value;
                if (secretRequest.outboundBody.includes(secret)) {
                  revealed.value = "";
                  throw new Error("LLM execution request contains the configured credential.");
                }
                call.credentialReleased = true;
                return secret;
              } catch (error) {
                this.revoke(grant.grantId);
                throw error;
              }
            }
          });
          const result = await delegate.runTask(request, { signal: call.signal });
          await this.commitCall(grant, input, call, result);
          return result;
        } catch (error) {
          await this.settleFailedCall(grant, input, call, error);
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
      maxTotalTokensPerRun: grant.maxTotalTokensPerRun,
      maxEstimatedCostUsd: grant.maxEstimatedCostUsd,
      maxTotalEstimatedCostUsd: grant.maxTotalEstimatedCostUsd,
      timeoutMs: grant.timeoutMs,
      providerRetryCount: 0,
      permittedConsequences: [...grant.permittedConsequences]
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
    // From here the claim window is spent and the run lease governs. The
    // claim window's timer is replaced rather than left running, so a claimed
    // grant is not revoked mid-run at the instant it stopped being claimable.
    grant.state = "claimed";
    grant.runExpiresAtMs = this.now() + AUTOMATION_STUDIO_LLM_EXECUTION_GRANT_MAX_RUN_MS;
    clearTimeout(grant.expiryTimer);
    grant.expiryTimer = setTimeout(
      () => this.revoke(grant.grantId, new DOMException("LLM execution grant run lease exceeded.", "TimeoutError")),
      AUTOMATION_STUDIO_LLM_EXECUTION_GRANT_MAX_RUN_MS
    );
    grant.expiryTimer.unref?.();
    return grant;
  }

  /** Whether the grant's current lifetime is over: the claim window while it is
   * available, the run lease once it is claimed. */
  private expired(grant: StoredGrant): boolean {
    const until = grant.state === "claimed" ? grant.runExpiresAtMs ?? grant.expiresAtMs : grant.expiresAtMs;
    return until <= this.now();
  }

  private claimCall(grant: StoredGrant, input: GrantScope, request: AutomationStudioLlmTaskRequest, policy: AutomationStudioLlmExecutionGrantResolvePolicy): ClaimedCall {
    if (this.grants.get(grant.grantId) !== grant || grant.state !== "claimed" || grant.remainingUses <= 0) {
      throw new Error("LLM execution grant is unavailable.");
    }
    // Past its lease, the grant is finished whether or not its timer has run.
    if (this.expired(grant)) {
      this.revoke(grant.grantId);
      throw new Error("LLM execution grant is unavailable.");
    }
    // A call whose scope no longer matches the claim is an integrity failure.
    if (!sameScope(grant, input)) {
      this.revoke(grant.grantId);
      throw new Error("LLM execution grant scope mismatch.");
    }
    if (grant.callInFlight) throw new Error("LLM execution grant already has a call in progress.");
    if (!automationStudioLlmRequestMatchesGrant(request, grant, policy)) {
      this.revoke(grant.grantId);
      throw new Error("LLM execution request mismatch.");
    }
    if (roundedCost(grant.committedEstimatedCostUsd + request.maxEstimatedCostUsd) > grant.maxTotalEstimatedCostUsd) {
      this.revoke(grant.grantId);
      throw new Error("LLM execution total estimated-cost limit exceeded.");
    }
    // The most this call can spend: its input and output limits together, and
    // never more than its total limit. Charged against what earlier calls
    // actually used, so the run budget bounds real spending rather than a sum of
    // worst cases -- which would put a call cap back under another name. A run
    // ledger reserves at least this much, so a recovery's own ledger always
    // refuses first and names the reason.
    const worstCaseTokens = Math.min(request.tokenLimits.maxTotalTokens, request.tokenLimits.maxInputTokens + request.tokenLimits.maxOutputTokens);
    if (grant.committedTotalTokens + worstCaseTokens > grant.maxTotalTokensPerRun) {
      this.revoke(grant.grantId);
      throw new Error("LLM execution total token limit exceeded.");
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
    return { authorizationId, controller, signal: controller.signal, worstCaseTokens, credentialReleased: false, settled: false };
  }

  /**
   * Make sure the call's reveal authorization will outlive the call.
   *
   * The authorizations minted at issue live only as long as the claim window,
   * because that is all an unclaimed grant may be worth. A call made later in
   * a claimed run exchanges its one for a fresh authorization, minted from the
   * actor's still-unlocked session and sized to this call. The exchange is one
   * for one, so the reveals a grant can make stay capped at its call count, and
   * minting needs the session unlock, so a claimed grant still dies with it.
   */
  private async ensureLiveAuthorization(grant: StoredGrant, call: ClaimedCall): Promise<void> {
    const callWindowMs = Math.max(MIN_REVEAL_AUTHORIZATION_TTL_MS, grant.timeoutMs);
    if (grant.authorizationsExpireAtMs - this.now() >= callWindowMs) return;
    const renewed = await this.options.secretKeys.createSessionRevealAuthorization({
      id: grant.keyId,
      sessionId: grant.actorSessionId,
      userId: grant.actorUserId,
      ttlMs: callWindowMs,
      nowMs: this.now()
    });
    // Revoked, cancelled or superseded while the authorization was minted: the
    // new one must not outlive the call it was minted for.
    if (call.signal.aborted || this.grants.get(grant.grantId) !== grant || grant.inFlightAbortController !== call.controller) {
      this.options.secretKeys.revokeRevealAuthorization(renewed.authorizationId);
      throw new Error("LLM execution grant is unavailable.");
    }
    if (renewed.keyId !== grant.keyId || renewed.keyUpdatedAtMs !== grant.keyUpdatedAtMs) {
      this.options.secretKeys.revokeRevealAuthorization(renewed.authorizationId);
      throw new Error("LLM key changed during grant authorization.");
    }
    this.options.secretKeys.revokeRevealAuthorization(call.authorizationId);
    call.authorizationId = renewed.authorizationId;
    grant.inFlightAuthorizationId = renewed.authorizationId;
  }

  private async commitCall(grant: StoredGrant, input: GrantScope, call: ClaimedCall, result: unknown): Promise<void> {
    const controller = call.controller;
    if (controller.signal.aborted || grant.inFlightAbortController !== controller) throw new Error("LLM execution grant is unavailable.");
    await this.validateClaimedGrant(grant, input);
    if (controller.signal.aborted || this.grants.get(grant.grantId) !== grant || grant.inFlightAbortController !== controller) {
      throw new Error("LLM execution grant is unavailable.");
    }
    this.finishCall(grant, call, reportedTotalTokens(result, call.worstCaseTokens));
  }

  /**
   * A call that threw: either a spent call, which leaves the grant as it was,
   * or a reason the grant must end.
   *
   * The call keeps the grant only when all of this holds. The failure is a
   * provider code whose disposition is a spent call -- the model's reply or the
   * network, never the authorization. The credential had already been released
   * for this call, so the failure happened on the provider's side of the gate
   * rather than inside it. The grant is still this grant, claimed, inside its
   * lease, and this is still its call. And the grant still validates now.
   * Anything else revokes, including every failure that carries no code at all.
   *
   * A spent call is charged exactly as a successful one: its use and cost were
   * taken when it was claimed, and it is charged its worst case in tokens,
   * because a failed call reports no usage -- which is also what the run's
   * ledger charges it, so the grant is never the stricter of the two.
   */
  private async settleFailedCall(grant: StoredGrant, input: GrantScope, call: ClaimedCall, error: unknown): Promise<void> {
    if (call.settled) return;
    if (!call.credentialReleased || !automationStudioLlmProviderErrorSpendsCall(error) || !this.isCurrentCall(grant, call)) {
      this.revoke(grant.grantId);
      return;
    }
    this.finishCall(grant, call, call.worstCaseTokens);
    await this.validateClaimedGrant(grant, input).catch(() => this.revoke(grant.grantId));
  }

  /**
   * The caller's deadline ended a call still in flight.
   *
   * Settled here, synchronously, rather than when the provider unwinds: the
   * caller has already moved on, and its next call must not find this one still
   * holding the grant. A deadline that fired before the credential was released
   * ended the call inside the grant's own authorization steps, whose outcome is
   * unknown, so that ends the grant instead.
   */
  private abandonTimedOutCall(grant: StoredGrant, call: ClaimedCall): void {
    if (call.settled) return;
    if (!call.credentialReleased || !this.isCurrentCall(grant, call)) {
      this.revoke(grant.grantId);
      return;
    }
    this.finishCall(grant, call, call.worstCaseTokens);
    call.controller.abort(new DOMException("LLM provider call reached its deadline.", "TimeoutError"));
  }

  /** Whether `call` is the live grant's call in flight, inside its lease. */
  private isCurrentCall(grant: StoredGrant, call: ClaimedCall): boolean {
    return this.grants.get(grant.grantId) === grant && grant.state === "claimed" && !this.expired(grant)
      && grant.inFlightAbortController === call.controller && !call.signal.aborted;
  }

  /** Count a call as finished, charging it `tokens`. A consumed grant is revoked. */
  private finishCall(grant: StoredGrant, call: ClaimedCall, tokens: number): void {
    call.settled = true;
    grant.committedTotalTokens += tokens;
    grant.callInFlight = false;
    grant.inFlightAuthorizationId = undefined;
    grant.inFlightAbortController = undefined;
    if (grant.remainingUses === 0) this.revoke(grant.grantId);
  }

  private async validateClaimedGrant(grant: StoredGrant, input: GrantScope): Promise<void> {
    if (this.grants.get(grant.grantId) !== grant || grant.state !== "claimed" || this.expired(grant)) throw new Error("LLM execution grant is unavailable.");
    if (!sameScope(grant, input)) throw new Error("LLM execution grant scope mismatch.");
    const [session, key, unresolvedBinding] = await Promise.all([
      this.options.identityAccess.validateSession(input.actorSessionId, this.now()),
      this.options.secretKeys.getKeySummary(grant.keyId),
      this.options.resolveExecutionDigest(grant.projectId, grant.flowId)
    ]);
    const binding = executionBinding(unresolvedBinding, grant.purpose);
    if (this.grants.get(grant.grantId) !== grant || grant.state !== "claimed" || this.expired(grant)) throw new Error("LLM execution grant is unavailable.");
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

function executionBinding(value: string | AutomationStudioLlmExecutionBinding, purpose: AutomationStudioLlmExecutionGrantPurpose): { executionDigest: string; settingsRevision?: number } {
  if (typeof value === "string") {
    if (purpose !== "diagnosis_only") throw new Error(`${purpose} requires an exact Flow settings revision.`);
    return { executionDigest: requiredDigest(value) };
  }
  const executionDigest = requiredDigest(value.executionDigest);
  if (!Number.isInteger(value.settingsRevision) || value.settingsRevision < 0) throw new Error("LLM Flow settings revision is invalid.");
  return { executionDigest, settingsRevision: value.settingsRevision };
}

function roundedCost(value: number): number {
  return Math.round(value * 1_000_000_000) / 1_000_000_000;
}

/** What a completed call is charged against the run's token budget: the total
 * it reported, when the report is consistent, and never more than its worst
 * case -- the provider already refuses a reply above its limits, and charging
 * past the worst case would make the grant stricter than the run's ledger. A
 * missing or inconsistent report is charged the worst case. */
function reportedTotalTokens(result: unknown, worstCaseTokens: number): number {
  const usage = typeof result === "object" && result !== null ? (result as { usage?: unknown }).usage : undefined;
  if (typeof usage !== "object" || usage === null) return worstCaseTokens;
  const { inputTokens, outputTokens, totalTokens } = usage as { inputTokens?: unknown; outputTokens?: unknown; totalTokens?: unknown };
  const whole = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
  if (!whole(inputTokens) || !whole(outputTokens) || !whole(totalTokens) || totalTokens !== inputTokens + outputTokens) return worstCaseTokens;
  return Math.min(totalTokens, worstCaseTokens);
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
