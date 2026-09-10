export const BLANK_FLOW_AUTHORING_LIMITS = Object.freeze({
  tokenLimits: Object.freeze({ maxInputTokens: 4_000, maxOutputTokens: 1_000, maxTotalTokens: 5_000 }),
  maxCalls: 1,
  timeoutMs: 20_000,
  maxEstimatedCostUsd: 0.25,
  providerRetryCount: 0
});

export const WEBSITE_EXPLORATION_LIMITS = Object.freeze({
  tokenLimits: Object.freeze({ maxInputTokens: 8_000, maxOutputTokens: 4_000, maxTotalTokens: 12_000 }),
  maxCalls: 4,
  timeoutMs: 45_000,
  maxTotalEstimatedCostUsd: 1
});

const WEBSITE_EXPLORATION_OVERHEAD_MS = 15_000;
export const WEBSITE_EXPLORATION_OVERALL_TIMEOUT_MS = WEBSITE_EXPLORATION_LIMITS.maxCalls * WEBSITE_EXPLORATION_LIMITS.timeoutMs + WEBSITE_EXPLORATION_OVERHEAD_MS;

export const LLM_HIGH_TOKEN_WARNING_THRESHOLD = 100_000;

export const AUTOMATION_LLM_PROGRESS_LABELS = Object.freeze({
  checkingPriorEvidence: "Checking prior evidence",
  inspectingLiveTarget: "Inspecting live target",
  generatingProposal: "Generating proposal",
  readyForReview: "Ready for review"
});

export function llmRequestRequiresHighTokenWarning(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const preflight = "preflight" in value && value.preflight && typeof value.preflight === "object" && !Array.isArray(value.preflight)
    ? value.preflight as Record<string, unknown>
    : value as Record<string, unknown>;
  const tokenLimits = preflight.tokenLimits;
  if (!tokenLimits || typeof tokenLimits !== "object" || Array.isArray(tokenLimits)) return false;
  const maxTotalTokens = (tokenLimits as Record<string, unknown>).maxTotalTokens;
  const maxCalls = typeof preflight.maxCalls === "number" && Number.isFinite(preflight.maxCalls) && preflight.maxCalls > 0 ? preflight.maxCalls : 1;
  return typeof maxTotalTokens === "number" && maxTotalTokens * maxCalls > LLM_HIGH_TOKEN_WARNING_THRESHOLD;
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

function blankFlowAuthoringRequestForMode(projectId: string | null, flow: any, readiness: BlankFlowAuthoringReadiness, requireActiveInstruction: boolean, requirePersistedExactLimits: boolean, limits: typeof BLANK_FLOW_AUTHORING_LIMITS | typeof WEBSITE_EXPLORATION_LIMITS): { ok: true; payload: Record<string, any> } | { ok: false } {
  const metadata = flow?.metadata && typeof flow.metadata === "object" ? flow.metadata : {};
  const settings = metadata.llmExecutionSettings && typeof metadata.llmExecutionSettings === "object" ? metadata.llmExecutionSettings : {};
  const tokens = settings.tokenLimits && typeof settings.tokenLimits === "object" ? settings.tokenLimits : {};
  const isOrchestration = metadata.flowRepresentationKind === "orchestration"
    || (metadata.flowRepresentationKind === undefined && metadata.subflowGraph !== true && !flow?.legacyProvenance);
  const isBlank = isOrchestration
    && Array.isArray(flow?.nodes) && flow.nodes.length === 0
    && Array.isArray(flow?.edges) && flow.edges.length === 0
    && !readiness.router
    && readiness.subflowTotal === 0;
  const hasActiveInstruction = readiness.instructions.some((instruction) => instruction?.status === "active");
  const exactLimits = tokens.maxInputTokens === limits.tokenLimits.maxInputTokens
    && tokens.maxOutputTokens === limits.tokenLimits.maxOutputTokens
    && tokens.maxTotalTokens === limits.tokenLimits.maxTotalTokens
    && settings.maxCalls === limits.maxCalls
    && settings.timeoutMs === limits.timeoutMs
    && settings.maxEstimatedCostUsd === BLANK_FLOW_AUTHORING_LIMITS.maxEstimatedCostUsd
    && settings.retryCount === BLANK_FLOW_AUTHORING_LIMITS.providerRetryCount;
  if (!projectId || !flow?.flowId || readiness.loading || readiness.error || !isBlank || (requireActiveInstruction && !hasActiveInstruction)
    || metadata.llmProvider !== "deepseek" || metadata.llmModel !== "deepseek-chat"
    || typeof metadata.llmSecretKeyId !== "string" || !metadata.llmSecretKeyId
    || (requirePersistedExactLimits && !exactLimits)) return { ok: false };
  return {
    ok: true,
    payload: {
      purpose: "build_and_adapt",
      projectId,
      flowId: flow.flowId,
      keyId: metadata.llmSecretKeyId,
      provider: "deepseek",
      model: "deepseek-chat",
      tokenLimits: { ...limits.tokenLimits },
      maxCalls: limits.maxCalls,
      timeoutMs: limits.timeoutMs,
      maxEstimatedCostUsd: BLANK_FLOW_AUTHORING_LIMITS.maxEstimatedCostUsd,
      providerRetryCount: BLANK_FLOW_AUTHORING_LIMITS.providerRetryCount
    }
  };
}

export function blankFlowAuthoringRequest(projectId: string | null, flow: any, readiness: BlankFlowAuthoringReadiness): { ok: true; payload: Record<string, any> } | { ok: false } {
  return blankFlowAuthoringRequestForMode(projectId, flow, readiness, true, true, BLANK_FLOW_AUTHORING_LIMITS);
}

export function blankFlowExplorationRequest(projectId: string | null, flow: any, readiness: BlankFlowAuthoringReadiness): { ok: true; payload: Record<string, any> } | { ok: false } {
  const request = blankFlowAuthoringRequestForMode(projectId, flow, readiness, false, false, WEBSITE_EXPLORATION_LIMITS);
  if (!request.ok) return request;
  return {
    ok: true,
    payload: {
      ...request.payload,
      tokenLimits: { ...WEBSITE_EXPLORATION_LIMITS.tokenLimits },
      maxCalls: WEBSITE_EXPLORATION_LIMITS.maxCalls,
      maxTotalEstimatedCostUsd: WEBSITE_EXPLORATION_LIMITS.maxTotalEstimatedCostUsd
    }
  };
}
