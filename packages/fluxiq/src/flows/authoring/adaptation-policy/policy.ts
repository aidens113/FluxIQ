import type { JsonObject } from "../../../core/index.ts";
import type { ExecutableChangeProposalMode as AutomationStudioChangeProposalMode } from "../../executable/change/index.ts";
import type { AutomationStudioAdaptationPolicyPreset } from "./preset.ts";

export type AutomationStudioAdaptationPolicy = {
  schemaVersion: "0.1";
  policyId: string;
  scope: { kind: "flow"; flowId: string } | { kind: "subflow"; flowId: string; subflowId: string };
  preset: AutomationStudioAdaptationPolicyPreset;
  proposalMode: AutomationStudioChangeProposalMode;
  allowRuntimeRecovery: boolean;
  allowCreateRecoveryPaths: boolean;
  allowModifySubflows: boolean;
  allowCreateSubflows: boolean;
  allowModifyRouter: boolean;
  allowModifyExpectations: boolean;
  allowModifyActionTargets: boolean;
  allowDeleteOrDisableBehavior: boolean;
  allowExternalSideEffects: boolean;
  requireApprovalForDestructiveChanges: boolean;
  requireApprovalForExternalSideEffects: boolean;
  maxInterventionsPerRun?: number;
  maxEstimatedCostUsdPerRun?: number;
  createdAt: number;
  updatedAt: number;
  metadata?: JsonObject;
};
