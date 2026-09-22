import type { AutomationStudioBootstrapAdaptation } from "../../flow-bootstrap/index.ts";
import type { AutomationStudioBuildAndAdaptExecutionGrant } from "../../llm/index.ts";

// What a caller asks for when it generates a Flow Bootstrap adaptation, and
// what it gets back.

export type AutomationStudioGenerateFlowBootstrapAdaptationInput = {
  projectId: string;
  flowId: string;
  executionGrant: AutomationStudioBuildAndAdaptExecutionGrant;
  evidenceGuided?: true;
  useReusableContext?: true;
};

export type AutomationStudioGenerateFlowBootstrapAdaptationResult = {
  projectId: string;
  flowId: string;
  adaptationId: string;
  status: "proposed";
  riskLevel: AutomationStudioBootstrapAdaptation["riskLevel"];
  sourceInstructionIds: string[];
  baseDependencyDigest: string;
  baseSettingsRevision: number;
  accounting: {
    requestId: string;
    estimatedInputTokens: number;
    provider?: string;
    model?: string;
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    estimatedCostUsd?: number;
  };
};
