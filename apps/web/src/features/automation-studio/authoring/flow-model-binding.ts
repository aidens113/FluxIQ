import { isAutomationStudioDeepSeekModel } from "fluxiq/automation-studio/llm-models";

/**
 * The part of a build request every build shares, whatever it does to the
 * Flow: the Flow must name a DeepSeek model and a turned-on key, and the
 * request names the Flow. Creating a Flow and improving one differ only in
 * which Flows they accept, so that rule is the caller's and this is the rest.
 */
export type FlowModelBinding =
  | { ok: true; payload: { projectId: string; flowId: string } }
  | { ok: false };

export function flowModelBinding(projectId: string | null, flow: any): FlowModelBinding {
  const metadata = flow?.metadata && typeof flow.metadata === "object" ? flow.metadata : {};
  if (!projectId || !flow?.flowId
    || metadata.llmProvider !== "deepseek" || !isAutomationStudioDeepSeekModel(metadata.llmModel)
    || typeof metadata.llmSecretKeyId !== "string" || !metadata.llmSecretKeyId) return { ok: false };
  return { ok: true, payload: { projectId, flowId: flow.flowId } };
}

/**
 * Whether the Flow is a top-level orchestration Flow whose own graph is empty:
 * the shape both a creation and an improvement need, because a built Flow keeps
 * its steps in a Subflow's graph rather than in the parent.
 */
export function isEmptyOrchestrationParent(flow: any): boolean {
  const metadata = flow?.metadata && typeof flow.metadata === "object" ? flow.metadata : {};
  const isOrchestration = metadata.flowRepresentationKind === "orchestration"
    || (metadata.flowRepresentationKind === undefined && metadata.subflowGraph !== true && !flow?.legacyProvenance);
  return isOrchestration
    && Array.isArray(flow?.nodes) && flow.nodes.length === 0
    && Array.isArray(flow?.edges) && flow.edges.length === 0;
}

/**
 * The Flow's model choice as `flowModelBinding` reads it. Its metadata detail
 * keeps the choice in `settings.llm` (`provider`, `model`, `secretKeyId`),
 * which is where Flow Settings writes it; a Flow's `metadata` spelling is only
 * the fallback, the same order the settings view reads them in.
 */
export function flowModelFromDetail(detail: any): { flowId?: string; metadata: Record<string, unknown> } {
  const llm = detail?.settings?.llm && typeof detail.settings.llm === "object" ? detail.settings.llm : {};
  const metadata = detail?.metadata && typeof detail.metadata === "object" ? detail.metadata : {};
  return {
    ...(typeof detail?.flowId === "string" ? { flowId: detail.flowId } : {}),
    metadata: {
      llmProvider: typeof llm.provider === "string" ? llm.provider : metadata.llmProvider,
      llmModel: typeof llm.model === "string" ? llm.model : metadata.llmModel,
      llmSecretKeyId: typeof llm.secretKeyId === "string" ? llm.secretKeyId : metadata.llmSecretKeyId
    }
  };
}
