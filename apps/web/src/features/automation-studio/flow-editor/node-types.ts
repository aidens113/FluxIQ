import type { AutomationNodeParameter, AutomationNodePort } from "fluxiq/automation-studio/nodes";
import type { JsonObject } from "../../programs/program-api";

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

export type AutomationFlowNodeData = {
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
