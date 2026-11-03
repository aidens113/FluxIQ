import type { JsonObject } from "../../../core/index.ts";
import type { ExecutableSubflowTarget } from "../../executable/routing/index.ts";
import type { ExecutableChangeProposalMode as AutomationStudioChangeProposalMode } from "../../executable/change/index.ts";
import type { AutomationStudioInterventionMode } from "../settings/intervention/index.ts";
import type { AutomationStudioSubflowRole } from "./subflow-role.ts";

export type AutomationStudioFlowSubflow = ExecutableSubflowTarget & {
  schemaVersion: "0.1";
  flowId: string;
  projectId: string;
  name: string;
  description?: string;
  role: AutomationStudioSubflowRole;
  tags?: string[];
  graphFlowId?: string;
  routeTags?: string[];
  inputMapping?: Array<{ flowInputId: string; subflowInputId: string; required?: boolean }>;
  outputMapping?: Array<{ subflowOutputId: string; flowOutputId: string; required?: boolean }>;
  localInstructionIds?: string[];
  proposalModeOverride?: AutomationStudioChangeProposalMode;
  interventionModeOverride?: AutomationStudioInterventionMode;
  stability?: {
    runCount: number;
    successCount: number;
    failureCount: number;
    lastRunAt?: number;
    lastFailureAt?: number;
  };
  createdAt: number;
  updatedAt: number;
  metadata?: JsonObject;
};
