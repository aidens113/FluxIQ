import { llmPreflightRunLimits } from "./llm-preflight-run-limits";

/**
 * The "author from instruction" build: exactly one provider call by
 * construction. The Flow's saved token, timeout, cost and retry limits must
 * match these exactly; its saved call count is not consulted, because Flow
 * Settings no longer offers one.
 */
export const BLANK_FLOW_AUTHORING_LIMITS = Object.freeze({
  tokenLimits: Object.freeze({ maxInputTokens: 4_000, maxOutputTokens: 1_000, maxTotalTokens: 5_000 }),
  maxCalls: 1,
  timeoutMs: 20_000,
  maxEstimatedCostUsd: 0.25,
  providerRetryCount: 0
});

/**
 * Building a Flow by exploring a website iterates, so it names no call count.
 *
 * Core chooses the number of provider calls for an iterating request and keeps
 * it only as a far-away backstop. The run is bounded by its whole-run token
 * budget (which Core derives and returns from preflight), the total estimated
 * cost below, the grant's run lease, and the evidence loop's own no-progress
 * checks. The figures here are per-call and whole-run ceilings, not a call
 * allowance.
 *
 * - `grantClaimWindowMs` is the grant's `ttlMs`: only how long an issued grant
 *   may wait to be claimed (Core's default; Core refuses more than 300 s).
 * - `runLeaseMs` mirrors Core's `AUTOMATION_STUDIO_LLM_EXECUTION_GRANT_MAX_RUN_MS`:
 *   how long a claimed grant may keep calling. The web app imports nothing from
 *   Core's packages, so it is restated here and pinned by a test.
 */
export const WEBSITE_EXPLORATION_LIMITS = Object.freeze({
  tokenLimits: Object.freeze({ maxInputTokens: 8_000, maxOutputTokens: 4_000, maxTotalTokens: 12_000 }),
  timeoutMs: 45_000,
  maxEstimatedCostUsd: 0.25,
  maxTotalEstimatedCostUsd: 1,
  providerRetryCount: 0,
  grantClaimWindowMs: 60_000,
  runLeaseMs: 600_000
});

const WEBSITE_EXPLORATION_OVERHEAD_MS = 15_000;
/**
 * The longest a website exploration can take as the browser sees it: the grant
 * may be claimed at the very end of its claim window, then runs for its whole
 * lease, and the answer still has to come back.
 */
export const WEBSITE_EXPLORATION_OVERALL_TIMEOUT_MS = WEBSITE_EXPLORATION_LIMITS.grantClaimWindowMs + WEBSITE_EXPLORATION_LIMITS.runLeaseMs + WEBSITE_EXPLORATION_OVERHEAD_MS;

export const LLM_HIGH_TOKEN_WARNING_THRESHOLD = 100_000;

export const AUTOMATION_LLM_PROGRESS_LABELS = Object.freeze({
  checkingPriorEvidence: "Checking prior evidence",
  inspectingLiveTarget: "Inspecting live target",
  generatingProposal: "Generating proposal",
  readyForReview: "Ready for review"
});

/**
 * Whether a preflight answer needs the high-token confirmation before a grant
 * is issued. It mirrors Core's own rule: the whole-run token budget, or one
 * call's limit if that is larger, above the threshold. Only an answer that
 * carries no run budget at all is judged the old way, as per-call tokens times
 * calls; a run budget that is present but unreadable asks for confirmation.
 */
export function llmRequestRequiresHighTokenWarning(value: unknown): boolean {
  const limits = llmPreflightRunLimits(value);
  if (!limits) return false;
  if (limits.runTokenBudget === "unreadable") return true;
  if (limits.runTokenBudget !== undefined) return Math.max(limits.runTokenBudget, limits.perCallTotalTokens ?? 0) > LLM_HIGH_TOKEN_WARNING_THRESHOLD;
  if (limits.perCallTotalTokens === undefined) return false;
  return limits.perCallTotalTokens * (limits.maxCalls ?? 1) > LLM_HIGH_TOKEN_WARNING_THRESHOLD;
}

export const blankFlowAuthoringRequestPolicy = Object.freeze({
  preflight: Object.freeze({ endpoint: "preflight-llm-execution", intent: "mutation" }),
  authorization: Object.freeze({ endpoint: "issue-llm-execution-grant", intent: "mutation" }),
  generation: Object.freeze({ endpoint: "generate-flow-bootstrap-adaptation", intent: "mutation" })
});

export type BlankFlowAuthoringReadiness = {
  loading: boolean;
  instructions: any[];
  router: any | null;
  subflowTotal: number;
  error: string;
};

type BlankFlowRequestBase = { ok: true; payload: Record<string, any>; settings: Record<string, any> } | { ok: false };

function blankFlowRequestBase(projectId: string | null, flow: any, readiness: BlankFlowAuthoringReadiness, requireActiveInstruction: boolean): BlankFlowRequestBase {
  const metadata = flow?.metadata && typeof flow.metadata === "object" ? flow.metadata : {};
  const settings = metadata.llmExecutionSettings && typeof metadata.llmExecutionSettings === "object" ? metadata.llmExecutionSettings : {};
  const isOrchestration = metadata.flowRepresentationKind === "orchestration"
    || (metadata.flowRepresentationKind === undefined && metadata.subflowGraph !== true && !flow?.legacyProvenance);
  const isBlank = isOrchestration
    && Array.isArray(flow?.nodes) && flow.nodes.length === 0
    && Array.isArray(flow?.edges) && flow.edges.length === 0
    && !readiness.router
    && readiness.subflowTotal === 0;
  const hasActiveInstruction = readiness.instructions.some((instruction) => instruction?.status === "active");
  if (!projectId || !flow?.flowId || readiness.loading || readiness.error || !isBlank || (requireActiveInstruction && !hasActiveInstruction)
    || metadata.llmProvider !== "deepseek" || metadata.llmModel !== "deepseek-chat"
    || typeof metadata.llmSecretKeyId !== "string" || !metadata.llmSecretKeyId) return { ok: false };
  return {
    ok: true,
    settings,
    payload: {
      purpose: "build_and_adapt",
      projectId,
      flowId: flow.flowId,
      keyId: metadata.llmSecretKeyId,
      provider: "deepseek",
      model: "deepseek-chat"
    }
  };
}

function savedLimitsMatchBlankFlowAuthoring(settings: Record<string, any>): boolean {
  const limits = BLANK_FLOW_AUTHORING_LIMITS;
  const tokens = settings.tokenLimits && typeof settings.tokenLimits === "object" ? settings.tokenLimits : {};
  return tokens.maxInputTokens === limits.tokenLimits.maxInputTokens
    && tokens.maxOutputTokens === limits.tokenLimits.maxOutputTokens
    && tokens.maxTotalTokens === limits.tokenLimits.maxTotalTokens
    && settings.timeoutMs === limits.timeoutMs
    && settings.maxEstimatedCostUsd === limits.maxEstimatedCostUsd
    && settings.retryCount === limits.providerRetryCount;
}

/**
 * The single-call build. It needs an active instruction and the Flow's saved
 * token, timeout, cost and retry limits to be exactly the one-call profile. It
 * always asks Core for one call, whatever call count the Flow has stored.
 */
export function blankFlowAuthoringRequest(projectId: string | null, flow: any, readiness: BlankFlowAuthoringReadiness): { ok: true; payload: Record<string, any> } | { ok: false } {
  const base = blankFlowRequestBase(projectId, flow, readiness, true);
  if (!base.ok || !savedLimitsMatchBlankFlowAuthoring(base.settings)) return { ok: false };
  const limits = BLANK_FLOW_AUTHORING_LIMITS;
  return {
    ok: true,
    payload: {
      ...base.payload,
      tokenLimits: { ...limits.tokenLimits },
      maxCalls: limits.maxCalls,
      timeoutMs: limits.timeoutMs,
      maxEstimatedCostUsd: limits.maxEstimatedCostUsd,
      providerRetryCount: limits.providerRetryCount
    }
  };
}

/**
 * The iterating website exploration. It carries no `maxCalls`, so Core applies
 * its iterating default, and it ignores the Flow's saved call count.
 */
export function blankFlowExplorationRequest(projectId: string | null, flow: any, readiness: BlankFlowAuthoringReadiness): { ok: true; payload: Record<string, any> } | { ok: false } {
  const base = blankFlowRequestBase(projectId, flow, readiness, false);
  if (!base.ok) return { ok: false };
  const limits = WEBSITE_EXPLORATION_LIMITS;
  return {
    ok: true,
    payload: {
      ...base.payload,
      tokenLimits: { ...limits.tokenLimits },
      timeoutMs: limits.timeoutMs,
      maxEstimatedCostUsd: limits.maxEstimatedCostUsd,
      maxTotalEstimatedCostUsd: limits.maxTotalEstimatedCostUsd,
      providerRetryCount: limits.providerRetryCount
    }
  };
}
