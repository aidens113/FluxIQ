import type { Blocks } from "lucide-react";
import {
  automationNodeClassGroups,
  getAutomationNodeDefinitions,
  type AutomationNodeDefinition,
  type AutomationNodeParameter,
  type AutomationNodePort
} from "fluxiq/automation-studio/nodes";
import type { JsonObject } from "../programs/program-api";

export type AutomationStudioView = "design" | "recordings" | "proposal" | "timeline-inspector" | "signals" | "runtime" | "runs" | "problems";
export type AutomationViewType = AutomationStudioView | "assistant" | "clients" | "config" | "routine" | "state" | "inspector" | "dock";
export type AutomationDockTab = "assistant" | "problems" | "history" | "state";
export type RecordingProcessingStatus = {
  recordingId: string;
  label: string;
  detail: string;
  progress: number;
};
export type AutomationViewInstance = {
  id: string;
  label: string;
  type: AutomationViewType;
  icon: typeof Blocks;
  state?: "dirty" | "live" | "warning";
};
export type AutomationEditorNodeSpec = {
  id: string;
  version: string;
  label: string;
  description: string;
  family: string;
  scope: "policy" | "routine" | "both";
  nodeType: "base" | "custom" | "generated";
  inputs: AutomationNodePort[];
  outputs: AutomationNodePort[];
  parameters: AutomationNodeParameter[];
  icon?: string;
  privileged?: boolean;
  actionTypes?: string[];
  source?: any;
  availability?: any;
};
export type AutomationEditorPaletteGroup = {
  title: string;
  nodes: AutomationEditorNodeSpec[];
};
export const automationEditorPalette: AutomationEditorPaletteGroup[] = automationNodeClassGroups
  .map((group) => ({
    title: group.label,
    nodes: getAutomationNodeDefinitions()
      .filter((node) => node.class === group.id)
      .map(automationNodeDefinitionToEditorSpec)
  }))
  .filter((group) => group.nodes.length > 0);

function automationNodeDefinitionToEditorSpec(definition: AutomationNodeDefinition): AutomationEditorNodeSpec {
  return {
    id: definition.id,
    version: "1.0.0",
    label: definition.label,
    description: definition.description,
    family: definition.class,
    scope: definition.scope,
    nodeType: definition.origin === "custom" ? "custom" : "base",
    inputs: definition.inputs,
    outputs: definition.outputs,
    parameters: definition.parameters,
    ...(definition.icon !== undefined ? { icon: definition.icon } : {}),
    ...(definition.privileged !== undefined ? { privileged: definition.privileged } : {}),
    ...(definition.class === "policy" && definition.id === "builtin.policy.action" ? { actionTypes: ["action"] } : {})
  };
}
export type AutomationSelection =
  | { kind: "workspace"; id: "clients" | "runs" }
  | { kind: "flow"; id: string }
  | { kind: "policy"; id: string }
  | { kind: "proposal"; id: string; recordingId?: string }
  | { kind: "proposal-step"; id: string; proposalId: string; recordingId?: string; step: { label: string; description: string; actions: string[]; requirements: string[]; expectedEffects: string[]; confidence: string; occurrenceCount: number; transition?: string; evidence: Array<{ id: string; title: string; relation: string }> }; node?: { label: string; description: string; customDescription?: string } }
  | { kind: "node"; id: string }
  | { kind: "editor-node"; id: string; node: { label: string; nodeType: string; family: string; description: string; customDescription?: string; nodeDefinitionId?: string; icon?: string; inputs: AutomationNodePort[]; outputs: AutomationNodePort[]; parameters: AutomationNodeParameter[]; parameterValues: JsonObject; metadata?: JsonObject; privileged?: boolean; actionTypes?: string[] } }
  | { kind: "editor-mode"; id: string; editor: "flow" | "routine"; label: string; description: string; sections: Array<{ title: string; rows: Array<[string, string]> }>; widgets?: AutomationInspectorWidget[] }
  | { kind: "recording"; id: string }
  | { kind: "timeline"; id: string }
  | { kind: "signal"; id: string };

export type AutomationInspectorWidget =
  | { kind: "summary"; title: string; items: Array<[string, string | number]> }
  | { kind: "cards"; title: string; items: Array<{ title: string; detail: string; meta?: string }> };

export type AutomationFlowConfigExtension = {
  id: string;
  title: string;
  owner: "global" | "node";
  nodeDefinitionId?: string;
  description: string;
  fields: Array<{
    id: string;
    label: string;
    valueType: "string" | "number" | "boolean" | "json";
    description?: string;
    defaultValue?: unknown;
  }>;
};

export type AutomationPolicyNodeData = {
  nodeDefinitionId?: string;
  nodeDefinitionVersion?: string;
  label: string;
  description: string;
  customDescription?: string;
  icon?: string;
  actionTypes: string[];
  recovery: string;
  evidenceCount: number;
  readinessCount: number;
  successCount: number;
  inputs: AutomationNodePort[];
  outputs: AutomationNodePort[];
  parameters: AutomationNodeParameter[];
  parameterValues: JsonObject;
  isStart: boolean;
  confidence?: number;
  timeoutMs?: number;
  reviewTone?: "existing" | "proposed" | "locked";
  regionId?: string;
  regionName?: string;
  regionKind?: "deterministic" | "trigger" | "policy";
  metadata?: JsonObject;
};
export type AutomationRoutineNodeData = {
  nodeDefinitionId?: string;
  nodeDefinitionVersion?: string;
  label: string;
  nodeType: "base" | "custom";
  family: string;
  description: string;
  customDescription?: string;
  icon?: string;
  inputs: AutomationNodePort[];
  outputs: AutomationNodePort[];
  parameters: AutomationNodeParameter[];
  parameterValues: JsonObject;
  privileged?: boolean;
  metadata?: JsonObject;
};

