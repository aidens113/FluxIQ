import type { JsonObject } from "../../../core/index.ts";
import type { AutomationStudioChangeProposalPatch, ExecutableAdaptationValidationResult as AutomationStudioFlowAdaptationValidationResult, ExecutableAdaptationStatus as AutomationStudioFlowAdaptationStatus, ExecutableAdaptationRiskLevel as AutomationStudioAdaptationRiskLevel } from "../change/index.ts";

export type AutomationStudioFlowAdaptation = {
  schemaVersion: "0.1";
  adaptationId: string;
  flowId: string;
  projectId: string;
  subflowId?: string;
  sourceRunId?: string;
  sourceRecordingIds?: string[];
  sourceInstructionIds?: string[];
  trigger: string;
  observedState?: JsonObject;
  expectedState?: JsonObject;
  failedAction?: JsonObject;
  diagnosis?: string;
  patch: AutomationStudioChangeProposalPatch[];
  validationResults?: AutomationStudioFlowAdaptationValidationResult[];
  appliedTo?: Array<{ kind: "router" | "subflow" | "expectation" | "action_target" | "instruction"; id: string }>;
  status: AutomationStudioFlowAdaptationStatus;
  author: "runtime" | "llm" | "user" | "system";
  riskLevel: AutomationStudioAdaptationRiskLevel;
  proposalId?: string;
  createdAt: number;
  updatedAt: number;
  metadata?: JsonObject;
};
