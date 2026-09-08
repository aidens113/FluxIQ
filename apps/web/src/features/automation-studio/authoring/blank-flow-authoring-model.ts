export const BLANK_FLOW_AUTHORING_LIMITS = Object.freeze({
  tokenLimits: Object.freeze({ maxInputTokens: 2_000, maxOutputTokens: 512, maxTotalTokens: 3_000 }),
  maxCalls: 1,
  timeoutMs: 20_000,
  maxEstimatedCostUsd: 0.25,
  providerRetryCount: 0
});

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

export function blankFlowAuthoringRequest(projectId: string | null, flow: any, readiness: BlankFlowAuthoringReadiness): { ok: true; payload: Record<string, any> } | { ok: false } {
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
  const exactLimits = tokens.maxInputTokens === BLANK_FLOW_AUTHORING_LIMITS.tokenLimits.maxInputTokens
    && tokens.maxOutputTokens === BLANK_FLOW_AUTHORING_LIMITS.tokenLimits.maxOutputTokens
    && tokens.maxTotalTokens === BLANK_FLOW_AUTHORING_LIMITS.tokenLimits.maxTotalTokens
    && settings.maxCalls === BLANK_FLOW_AUTHORING_LIMITS.maxCalls
    && settings.timeoutMs === BLANK_FLOW_AUTHORING_LIMITS.timeoutMs
    && settings.maxEstimatedCostUsd === BLANK_FLOW_AUTHORING_LIMITS.maxEstimatedCostUsd
    && settings.retryCount === BLANK_FLOW_AUTHORING_LIMITS.providerRetryCount;
  if (!projectId || !flow?.flowId || readiness.loading || readiness.error || !isBlank || !hasActiveInstruction
    || metadata.llmProvider !== "deepseek" || metadata.llmModel !== "deepseek-chat"
    || typeof metadata.llmSecretKeyId !== "string" || !metadata.llmSecretKeyId || !exactLimits) return { ok: false };
  return {
    ok: true,
    payload: {
      purpose: "build_and_adapt",
      projectId,
      flowId: flow.flowId,
      keyId: metadata.llmSecretKeyId,
      provider: "deepseek",
      model: "deepseek-chat",
      tokenLimits: { ...BLANK_FLOW_AUTHORING_LIMITS.tokenLimits },
      maxCalls: BLANK_FLOW_AUTHORING_LIMITS.maxCalls,
      timeoutMs: BLANK_FLOW_AUTHORING_LIMITS.timeoutMs,
      maxEstimatedCostUsd: BLANK_FLOW_AUTHORING_LIMITS.maxEstimatedCostUsd,
      providerRetryCount: BLANK_FLOW_AUTHORING_LIMITS.providerRetryCount
    }
  };
}
