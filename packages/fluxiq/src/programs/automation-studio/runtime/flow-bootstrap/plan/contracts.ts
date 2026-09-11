// The Flow Bootstrap plan contract: the plan a provider emits, the catalog
// and context handed to it, the issues a plan can raise, and the validated
// plan handed on to Bootstrap Adaptations.
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationNodeParameter, AutomationNodeValueType } from "../../../nodes/index.ts";

export type AutomationStudioFlowBootstrapRisk = "low" | "medium" | "high";

export type AutomationStudioFlowBootstrapNode = {
  key: string;
  definitionId: string;
  definitionVersion: string;
  parameters?: JsonObject;
  outputActionId?: string;
};

export type AutomationStudioFlowBootstrapEdge = {
  key: string;
  source: { nodeKey: string; portId: string };
  target: { nodeKey: string; portId: string };
};

export type AutomationStudioFlowBootstrapSubflow = {
  key: string;
  name: string;
  role: "primary" | "integration" | "recovery" | "fallback" | "utility";
  nodes: AutomationStudioFlowBootstrapNode[];
  edges: AutomationStudioFlowBootstrapEdge[];
};

export type AutomationStudioFlowBootstrapRouter = {
  name: string;
  rules: Array<{
    key: string;
    name: string;
    targetSubflowKey: string;
    routeTags: string[];
  }>;
  fallback: { kind: "subflow"; targetSubflowKey: string } | { kind: "fail" };
};

export type AutomationStudioFlowBootstrapPlan = {
  schemaVersion: "0.1";
  router: AutomationStudioFlowBootstrapRouter;
  subflows: AutomationStudioFlowBootstrapSubflow[];
};

export type AutomationStudioFlowBootstrapCatalogEntry = {
  id: string;
  version: string;
  label: string;
  description: string;
  category: string;
  capabilities: string[];
  inputs: Array<{ id: string; type: AutomationNodeValueType; required?: true; multiple?: true }>;
  outputs: Array<{ id: string; type: AutomationNodeValueType; multiple?: true }>;
  parameters: Array<{
    id: string;
    type: AutomationNodeParameter["valueType"];
    required?: true;
    stateBindable?: false;
    defaultValue?: JsonValue;
    options?: string[];
    constraints?: AutomationNodeParameter["constraints"];
  }>;
  outputAction?: { required: true; fixed?: string; allowed?: string[] };
};

export type AutomationStudioFlowBootstrapContext = {
  outputSchema: JsonObject;
  nodeCatalog: AutomationStudioFlowBootstrapCatalogEntry[];
  catalogTruncated: boolean;
  catalogSelection: {
    byteBudget: number;
    usedBytes: number;
    requiredTerms: string[];
    missingRequiredTerms: string[];
  };
};

export type AutomationStudioFlowBootstrapIssue = {
  severity: "error" | "warning";
  code: string;
  message: string;
  path?: string;
};

export type AutomationStudioValidatedFlowBootstrapPlan = {
  plan: AutomationStudioFlowBootstrapPlan;
  risk: AutomationStudioFlowBootstrapRisk;
  subflows: Array<Omit<AutomationStudioFlowBootstrapSubflow, "nodes"> & {
    nodes: Array<AutomationStudioFlowBootstrapNode & { position: { x: number; y: number } }>;
  }>;
};
/** Registry-validated, Core-risked and deterministically laid-out plan accepted by Bootstrap Adaptations. */
export type AutomationStudioFlowBuildPlan = AutomationStudioValidatedFlowBootstrapPlan;
