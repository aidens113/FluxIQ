import type { AutomationStudioFlowScope } from "../../executable/index.ts";
import type { AutomationStudioFlowOrigin } from "./index.ts";
import type { AutomationStudioFlowSource } from "./index.ts";
import type { JsonObject } from "../../../core/index.ts";
import type { AutomationStudioFlowArtifact } from "./index.ts";
import { defaultAutomationStudioFlowSettingsMetadata } from "../settings/index.ts";
import { AUTOMATION_STUDIO_INTERVENTION_MODE_VERSION } from "../settings/intervention/index.ts";
import { automationStudioInterventionMode } from "../settings/intervention/index.ts";
import { withAutomationStudioFlowRepresentation } from "./with-representation.ts";
import { isAutomationStudioSubflowGraphMetadata } from "./is-subflow-graph-metadata.ts";

export function createBlankAutomationStudioFlowArtifact(input: {
  flowId: string;
  projectId: string;
  name: string;
  scope?: AutomationStudioFlowScope;
  description?: string;
  origin?: AutomationStudioFlowOrigin;
  source?: AutomationStudioFlowSource;
  now?: number;
  metadata?: JsonObject;
}): AutomationStudioFlowArtifact {
  const now = input.now ?? Date.now();
  const suppliedMetadata = input.metadata ?? {};
  const hasLegacyInterventionSettings = suppliedMetadata.trainingMode !== undefined
    || suppliedMetadata.proposalMode !== undefined
    || suppliedMetadata.proposalApprovalMode !== undefined
    || suppliedMetadata.trainingModeSettings !== undefined
    || suppliedMetadata.adaptationPolicySettings !== undefined;
  const settingsMetadata = {
    ...defaultAutomationStudioFlowSettingsMetadata(),
    ...suppliedMetadata,
    ...(suppliedMetadata.adaptationModeVersion !== AUTOMATION_STUDIO_INTERVENTION_MODE_VERSION && hasLegacyInterventionSettings
      ? {
        adaptationModeVersion: AUTOMATION_STUDIO_INTERVENTION_MODE_VERSION,
        adaptationMode: automationStudioInterventionMode(suppliedMetadata)
      }
      : {})
  };
  return {
    schemaVersion: "0.1",
    flowId: input.flowId,
    projectId: input.projectId,
    name: input.name,
    ...(input.description !== undefined ? { description: input.description } : {}),
    scope: input.scope ?? { kind: "global" },
    visibility: "private",
    origin: input.origin ?? "manual",
    source: input.source ?? { mode: "visual" },
    interface: { inputs: [], outputs: [] },
    errors: [],
    variables: [],
    nodes: [],
    edges: [],
    publication: { status: "draft" },
    createdAt: now,
    updatedAt: now,
    metadata: withAutomationStudioFlowRepresentation(
      settingsMetadata,
      isAutomationStudioSubflowGraphMetadata(input.metadata) ? "subflow_graph" : "orchestration"
    )
  };
}
