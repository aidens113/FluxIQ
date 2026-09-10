import type { JsonObject, JsonValue } from "../../../core/index.ts";
import type { AutomationNodeParameter, AutomationNodePort, AutomationNodeValueType } from "../nodes/contracts.ts";
import {
  AutomationStudioNodeRegistry,
  type AutomationStudioNodeDefinition,
  type AutomationStudioNodeRegistryResolution
} from "../nodes/index.ts";
import { automationStudioLlmTokenBudgetBytes } from "./llm-token-estimation.ts";

export const AUTOMATION_STUDIO_FLOW_BOOTSTRAP_LIMITS = {
  maxSubflows: 8,
  maxNodesPerSubflow: 64,
  maxEdgesPerSubflow: 128,
  maxTotalNodes: 64,
  maxTotalEdges: 128,
  maxGraphDepth: 16,
  maxPlanBytes: 65_536,
  maxCatalogEntries: 100,
  maxCatalogBytes: 49_152,
  firstLiveMaxInputTokens: 4_000,
  bootstrapInstructionTokens: 384,
  maxStringLength: 2_000,
  horizontalSpacing: 320,
  verticalSpacing: 180
} as const;

export const AUTOMATION_STUDIO_EVIDENCE_FLOW_BOOTSTRAP_LIMITS = {
  maxResultBytes: 12_000,
  maxSummaryLength: 240,
  maxNameLength: 120,
  maxSubflows: 4,
  maxRules: 8,
  maxRouteTags: 8,
  maxNodesPerSubflow: 16,
  maxEdgesPerSubflow: 24,
  maxParametersPerNode: 16
} as const;

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


export const AUTOMATION_STUDIO_FLOW_BOOTSTRAP_OUTPUT_SCHEMA: JsonObject = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  additionalProperties: false,
  required: ["kind", "summary", "plan"],
  properties: {
    kind: { const: "flow_bootstrap" },
    summary: { $ref: "#/$defs/text" },
    plan: {
      type: "object",
      additionalProperties: false,
      required: ["schemaVersion", "router", "subflows"],
      properties: {
        schemaVersion: { const: "0.1" },
        router: {
          type: "object",
          additionalProperties: false,
          required: ["name", "rules", "fallback"],
          properties: {
            name: { $ref: "#/$defs/text" },
            rules: { type: "array", minItems: 0, maxItems: 8, items: { $ref: "#/$defs/rule" } },
            fallback: { $ref: "#/$defs/fallback" }
          }
        },
        subflows: {
          type: "array",
          minItems: 1,
          maxItems: 8,
          items: { $ref: "#/$defs/subflow" },
          contains: { type: "object", required: ["role"], properties: { role: { const: "primary" } } },
          minContains: 1,
          maxContains: 1
        }
      }
    }
  },
  $defs: {
    symbol: { type: "string", pattern: "^[a-z][a-z0-9_-]{0,63}$" },
    identifier: { type: "string", minLength: 1, maxLength: 200, pattern: "^[A-Za-z0-9_.:-]+$" },
    text: { type: "string", minLength: 1, maxLength: 2_000, pattern: "\\S" },
    endpoint: {
      type: "object",
      additionalProperties: false,
      required: ["nodeKey", "portId"],
      properties: { nodeKey: { $ref: "#/$defs/symbol" }, portId: { $ref: "#/$defs/identifier" } }
    },
    rule: {
      type: "object",
      additionalProperties: false,
      required: ["key", "name", "targetSubflowKey", "routeTags"],
      properties: {
        key: { $ref: "#/$defs/symbol" },
        name: { $ref: "#/$defs/text" },
        targetSubflowKey: { $ref: "#/$defs/symbol" },
        routeTags: { type: "array", minItems: 0, maxItems: 16, items: { type: "string", minLength: 1, maxLength: 100 } }
      }
    },
    fallback: {
      oneOf: [
        { type: "object", additionalProperties: false, required: ["kind", "targetSubflowKey"], properties: { kind: { const: "subflow" }, targetSubflowKey: { $ref: "#/$defs/symbol" } } },
        { type: "object", additionalProperties: false, required: ["kind"], properties: { kind: { const: "fail" } } }
      ]
    },
    node: {
      type: "object",
      additionalProperties: false,
      required: ["key", "definitionId", "definitionVersion"],
      properties: {
        key: { $ref: "#/$defs/symbol" },
        definitionId: { ...({ $ref: "#/$defs/identifier" }), description: "Use an id from nodeCatalog." },
        definitionVersion: { ...({ $ref: "#/$defs/text" }), description: "Use the exact version paired with definitionId in nodeCatalog." },
        parameters: { type: "object", maxProperties: 256, description: "Emit only parameter IDs declared by the selected nodeCatalog entry, with JSON values satisfying those parameter contracts.", additionalProperties: {} },
        outputActionId: { ...({ $ref: "#/$defs/identifier" }), description: "Emit iff the selected nodeCatalog entry has outputAction; use its fixed value or one allowed value." }
      }
    },
    edge: {
      type: "object",
      additionalProperties: false,
      required: ["key", "source", "target"],
      properties: { key: { $ref: "#/$defs/symbol" }, source: { $ref: "#/$defs/endpoint" }, target: { $ref: "#/$defs/endpoint" } }
    },
    subflow: {
      type: "object",
      additionalProperties: false,
      required: ["key", "name", "role", "nodes", "edges"],
      properties: {
        key: { $ref: "#/$defs/symbol" },
        name: { $ref: "#/$defs/text" },
        role: { enum: ["primary", "integration", "recovery", "fallback", "utility"] },
        nodes: { type: "array", minItems: 1, maxItems: 64, items: { $ref: "#/$defs/node" } },
        edges: { type: "array", minItems: 0, maxItems: 128, items: { $ref: "#/$defs/edge" } }
      }
    }
  }
};

/** A self-contained, reference-free completion schema for bounded evidence-guided
 * Bootstrap calls. It retains the canonical public plan shape while preventing a
 * provider from spending a whole completion on optional topology or prose. */
export const AUTOMATION_STUDIO_EVIDENCE_FLOW_BOOTSTRAP_COMPLETION_SCHEMA: JsonObject = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "plan"],
  description: "Return a minimal Flow Bootstrap result under 12000 UTF-8 bytes. Prefer one primary Subflow routed by the Router fallback. Add Subflows or Router rules only when the instruction requires them. Every Router target must equal a Subflow key. Include only required nodes and edges.",
  properties: {
    summary: { type: "string", minLength: 1, maxLength: AUTOMATION_STUDIO_EVIDENCE_FLOW_BOOTSTRAP_LIMITS.maxSummaryLength },
    plan: {
      type: "object",
      additionalProperties: false,
      required: ["schemaVersion", "router", "subflows"],
      properties: {
        schemaVersion: { const: "0.1" },
        router: {
          type: "object",
          additionalProperties: false,
          required: ["name", "rules", "fallback"],
          properties: {
            name: boundedBootstrapTextSchema(AUTOMATION_STUDIO_EVIDENCE_FLOW_BOOTSTRAP_LIMITS.maxNameLength),
            rules: {
              type: "array", minItems: 0, maxItems: AUTOMATION_STUDIO_EVIDENCE_FLOW_BOOTSTRAP_LIMITS.maxRules,
              items: {
                type: "object", additionalProperties: false, required: ["key", "name", "targetSubflowKey", "routeTags"],
                properties: {
                  key: bootstrapSymbolSchema(), name: boundedBootstrapTextSchema(AUTOMATION_STUDIO_EVIDENCE_FLOW_BOOTSTRAP_LIMITS.maxNameLength),
                  targetSubflowKey: bootstrapSymbolSchema(),
                  routeTags: { type: "array", minItems: 0, maxItems: AUTOMATION_STUDIO_EVIDENCE_FLOW_BOOTSTRAP_LIMITS.maxRouteTags, items: boundedBootstrapTextSchema(100) }
                }
              }
            },
            fallback: {
              oneOf: [
                { type: "object", additionalProperties: false, required: ["kind", "targetSubflowKey"], properties: { kind: { const: "subflow" }, targetSubflowKey: bootstrapSymbolSchema() } },
                { type: "object", additionalProperties: false, required: ["kind"], properties: { kind: { const: "fail" } } }
              ]
            }
          }
        },
        subflows: {
          type: "array", minItems: 1, maxItems: AUTOMATION_STUDIO_EVIDENCE_FLOW_BOOTSTRAP_LIMITS.maxSubflows,
          contains: { type: "object", required: ["role"], properties: { role: { const: "primary" } } }, minContains: 1, maxContains: 1,
          items: {
            type: "object", additionalProperties: false, required: ["key", "name", "role", "nodes", "edges"],
            properties: {
              key: bootstrapSymbolSchema(), name: boundedBootstrapTextSchema(AUTOMATION_STUDIO_EVIDENCE_FLOW_BOOTSTRAP_LIMITS.maxNameLength),
              role: { enum: ["primary", "integration", "recovery", "fallback", "utility"] },
              nodes: {
                type: "array", minItems: 1, maxItems: AUTOMATION_STUDIO_EVIDENCE_FLOW_BOOTSTRAP_LIMITS.maxNodesPerSubflow,
                description: "For every node, copy definitionId and definitionVersion exactly from one nodeCatalog entry. Include every required parameter. If that entry has outputAction, outputActionId is mandatory and must equal fixed or one allowed value.",
                items: {
                  type: "object", additionalProperties: false, required: ["key", "definitionId", "definitionVersion"],
                  properties: {
                    key: bootstrapSymbolSchema(), definitionId: bootstrapIdentifierSchema(),
                    definitionVersion: boundedBootstrapTextSchema(40),
                    parameters: { type: "object", maxProperties: AUTOMATION_STUDIO_EVIDENCE_FLOW_BOOTSTRAP_LIMITS.maxParametersPerNode, additionalProperties: {} },
                    outputActionId: bootstrapIdentifierSchema()
                  }
                }
              },
              edges: {
                type: "array", minItems: 0, maxItems: AUTOMATION_STUDIO_EVIDENCE_FLOW_BOOTSTRAP_LIMITS.maxEdgesPerSubflow,
                description: "Create one connected acyclic graph. Use only output port IDs from each source node's catalog entry and input port IDs from each target node's entry. Connect every input marked required and do not reuse a port unless it is marked multiple.",
                items: {
                  type: "object", additionalProperties: false, required: ["key", "source", "target"],
                  properties: { key: bootstrapSymbolSchema(), source: bootstrapEndpointSchema(), target: bootstrapEndpointSchema() }
                }
              }
            }
          }
        }
      }
    }
  }
};

export function isAutomationStudioEvidenceFlowBootstrapResultWithinLimits(value: { summary: string; plan: AutomationStudioFlowBootstrapPlan }): boolean {
  const limits = AUTOMATION_STUDIO_EVIDENCE_FLOW_BOOTSTRAP_LIMITS;
  return value.summary.length <= limits.maxSummaryLength
    && Buffer.byteLength(JSON.stringify(value), "utf8") <= limits.maxResultBytes
    && value.plan.router.name.length <= limits.maxNameLength
    && value.plan.router.rules.length <= limits.maxRules
    && value.plan.router.rules.every((rule) => rule.name.length <= limits.maxNameLength && rule.routeTags.length <= limits.maxRouteTags)
    && value.plan.subflows.length <= limits.maxSubflows
    && value.plan.subflows.every((subflow) => subflow.name.length <= limits.maxNameLength
      && subflow.nodes.length <= limits.maxNodesPerSubflow
      && subflow.edges.length <= limits.maxEdgesPerSubflow
      && subflow.nodes.every((node) => !node.parameters || Object.keys(node.parameters).length <= limits.maxParametersPerNode));
}

function boundedBootstrapTextSchema(maxLength: number): JsonObject {
  return { type: "string", minLength: 1, maxLength, pattern: "\\S" };
}

function bootstrapSymbolSchema(): JsonObject {
  return { type: "string", pattern: "^[a-z][a-z0-9_-]{0,63}$" };
}

function bootstrapIdentifierSchema(): JsonObject {
  return { type: "string", minLength: 1, maxLength: 200, pattern: "^[A-Za-z0-9_.:-]+$" };
}

function bootstrapEndpointSchema(): JsonObject {
  return {
    type: "object", additionalProperties: false, required: ["nodeKey", "portId"],
    properties: { nodeKey: bootstrapSymbolSchema(), portId: bootstrapIdentifierSchema() }
  };
}

export function buildAutomationStudioFlowBootstrapContext(input: {
  registry?: AutomationStudioNodeRegistry;
  resolution: AutomationStudioNodeRegistryResolution;
  instructionText?: string;
  maxCatalogBytes?: number;
  maxCatalogEntries?: number;
}): AutomationStudioFlowBootstrapContext {
  const registry = input.registry ?? new AutomationStudioNodeRegistry();
  const definitions = registry.list(input.resolution).sort((left, right) => left.id.localeCompare(right.id));
  const byteBudget = Math.max(0, Math.min(
    AUTOMATION_STUDIO_FLOW_BOOTSTRAP_LIMITS.maxCatalogBytes,
    Math.trunc(input.maxCatalogBytes ?? AUTOMATION_STUDIO_FLOW_BOOTSTRAP_LIMITS.maxCatalogBytes)
  ));
  const selection = rankBootstrapDefinitions(definitions, input.instructionText ?? "");
  const maxCatalogEntries = Math.max(1, Math.min(
    AUTOMATION_STUDIO_FLOW_BOOTSTRAP_LIMITS.maxCatalogEntries,
    Math.trunc(input.maxCatalogEntries ?? AUTOMATION_STUDIO_FLOW_BOOTSTRAP_LIMITS.maxCatalogEntries)
  ));
  const nodeCatalog: AutomationStudioFlowBootstrapCatalogEntry[] = [];
  const selectedIds = new Set<string>();
  const missingRequiredTerms: string[] = [];
  let usedBytes = 2;
  const append = (definition: AutomationStudioNodeDefinition): boolean => {
    if (selectedIds.has(definition.id)) return true;
    const entry = compactDefinition(definition);
    const entryBytes = Buffer.byteLength(JSON.stringify(entry), "utf8") + (nodeCatalog.length ? 1 : 0);
    if (nodeCatalog.length >= maxCatalogEntries
      || usedBytes + entryBytes > byteBudget) return false;
    nodeCatalog.push(entry);
    selectedIds.add(definition.id);
    usedBytes += entryBytes;
    return true;
  };
  for (const required of selection.required) {
    if (!required.definition || !append(required.definition)) missingRequiredTerms.push(required.term);
  }
  for (const definition of selection.ranked) append(definition);
  nodeCatalog.sort((left, right) => left.id.localeCompare(right.id));
  return {
    outputSchema: AUTOMATION_STUDIO_FLOW_BOOTSTRAP_OUTPUT_SCHEMA,
    nodeCatalog,
    catalogTruncated: nodeCatalog.length < definitions.length,
    catalogSelection: {
      byteBudget,
      usedBytes,
      requiredTerms: selection.required.map((item) => item.term),
      missingRequiredTerms
    }
  };
}

export function automationStudioFlowBootstrapCatalogByteBudget(input: {
  maxInputTokens: number;
  instructionBytes: number;
}): number {
  const totalBytes = automationStudioLlmTokenBudgetBytes(input.maxInputTokens);
  const schemaBytes = Buffer.byteLength(JSON.stringify(AUTOMATION_STUDIO_FLOW_BOOTSTRAP_OUTPUT_SCHEMA), "utf8");
  const fixedEnvelopeReserveBytes = 1_800;
  return Math.max(0, Math.min(
    AUTOMATION_STUDIO_FLOW_BOOTSTRAP_LIMITS.maxCatalogBytes,
    totalBytes - Math.max(0, Math.trunc(input.instructionBytes)) - schemaBytes - fixedEnvelopeReserveBytes
  ));
}
export function parseAutomationStudioFlowBootstrapPlan(value: unknown): {
  plan?: AutomationStudioFlowBootstrapPlan;
  issues: AutomationStudioFlowBootstrapIssue[];
} {
  const issues: AutomationStudioFlowBootstrapIssue[] = [];
  if (!isRecord(value)) return { issues: [error("bootstrap.invalid_plan", "Bootstrap plan must be an object.", "plan")] };
  rejectFields(value, ["schemaVersion", "router", "subflows"], "plan", issues);
  if (value.schemaVersion !== "0.1") issues.push(error("bootstrap.invalid_schema_version", "Bootstrap plan schemaVersion must be 0.1.", "plan.schemaVersion"));
  parseRouter(value.router, issues);
  if (!Array.isArray(value.subflows)) issues.push(error("bootstrap.invalid_subflows", "Bootstrap subflows must be an array.", "plan.subflows"));
  else if (value.subflows.length > AUTOMATION_STUDIO_FLOW_BOOTSTRAP_LIMITS.maxSubflows) issues.push(error("bootstrap.too_many_subflows", "Bootstrap plan exceeds the Subflow limit.", "plan.subflows"));
  else {
    value.subflows.forEach((subflow, index) => parseSubflow(subflow, index, issues));
    const totalNodes = value.subflows.reduce((count, subflow) => count + (isRecord(subflow) && Array.isArray(subflow.nodes) ? subflow.nodes.length : 0), 0);
    const totalEdges = value.subflows.reduce((count, subflow) => count + (isRecord(subflow) && Array.isArray(subflow.edges) ? subflow.edges.length : 0), 0);
    if (totalNodes > AUTOMATION_STUDIO_FLOW_BOOTSTRAP_LIMITS.maxTotalNodes) issues.push(error("bootstrap.too_many_nodes", "Bootstrap plan exceeds the total node limit.", "plan.subflows"));
    if (totalEdges > AUTOMATION_STUDIO_FLOW_BOOTSTRAP_LIMITS.maxTotalEdges) issues.push(error("bootstrap.too_many_edges", "Bootstrap plan exceeds the total edge limit.", "plan.subflows"));
  }
  if (safeByteLength(value) > AUTOMATION_STUDIO_FLOW_BOOTSTRAP_LIMITS.maxPlanBytes) {
    issues.push(error("bootstrap.plan_too_large", "Bootstrap plan exceeds the byte limit.", "plan"));
  }
  return issues.some((issue) => issue.severity === "error")
    ? { issues }
    : { plan: value as unknown as AutomationStudioFlowBootstrapPlan, issues };
}

export function validateAutomationStudioFlowBootstrapPlan(input: {
  plan: AutomationStudioFlowBootstrapPlan;
  registry?: AutomationStudioNodeRegistry;
  resolution: AutomationStudioNodeRegistryResolution;
}): { ok: boolean; issues: AutomationStudioFlowBootstrapIssue[]; validated?: AutomationStudioValidatedFlowBootstrapPlan } {
  const structural = parseAutomationStudioFlowBootstrapPlan(input.plan);
  if (!structural.plan) return { ok: false, issues: structural.issues };
  const registry = input.registry ?? new AutomationStudioNodeRegistry();
  const issues = [...structural.issues];
  const subflowKeys = new Set<string>();
  const primary = input.plan.subflows.filter((subflow) => subflow.role === "primary");
  if (primary.length !== 1) issues.push(error("bootstrap.primary_count", "Bootstrap plan must define exactly one primary Subflow.", "plan.subflows"));
  for (const [subflowIndex, subflow] of input.plan.subflows.entries()) {
    if (subflowKeys.has(subflow.key)) issues.push(error("bootstrap.duplicate_subflow_key", "Subflow keys must be unique.", `plan.subflows.${subflowIndex}.key`));
    subflowKeys.add(subflow.key);
    validateSubflow(subflow, subflowIndex, registry, input.resolution, issues);
  }
  const routerRuleKeys = new Set<string>();
  for (const [index, rule] of input.plan.router.rules.entries()) {
    if (routerRuleKeys.has(rule.key)) issues.push(error("bootstrap.duplicate_router_rule_key", "Router rule keys must be unique.", `plan.router.rules.${index}.key`));
    routerRuleKeys.add(rule.key);
    if (!subflowKeys.has(rule.targetSubflowKey)) issues.push(error("bootstrap.unknown_router_target", "Router rule targets an unknown Subflow key.", `plan.router.rules.${index}.targetSubflowKey`));
  }
  if (input.plan.router.fallback.kind === "subflow" && !subflowKeys.has(input.plan.router.fallback.targetSubflowKey)) {
    issues.push(error("bootstrap.unknown_router_fallback", "Router fallback targets an unknown Subflow key.", "plan.router.fallback.targetSubflowKey"));
  }
  if (issues.some((issue) => issue.severity === "error")) return { ok: false, issues };
  const subflows = input.plan.subflows.map((subflow) => ({
    ...subflow,
    nodes: layoutNodes(subflow)
  }));
  return {
    ok: true,
    issues,
    validated: {
      plan: input.plan,
      risk: deriveRisk(input.plan, registry, input.resolution),
      subflows
    }
  };
}

function parseRouter(value: unknown, issues: AutomationStudioFlowBootstrapIssue[]): void {
  if (!isRecord(value)) {
    issues.push(error("bootstrap.invalid_router", "Bootstrap router must be an object.", "plan.router"));
    return;
  }
  rejectFields(value, ["name", "rules", "fallback"], "plan.router", issues);
  boundedText(value.name, "plan.router.name", issues);
  if (!Array.isArray(value.rules) || value.rules.length > AUTOMATION_STUDIO_FLOW_BOOTSTRAP_LIMITS.maxSubflows) {
    issues.push(error("bootstrap.invalid_router_rules", "Router rules must be a bounded array.", "plan.router.rules"));
  } else value.rules.forEach((rule, index) => {
    const path = `plan.router.rules.${index}`;
    if (!isRecord(rule)) {
      issues.push(error("bootstrap.invalid_router_rule", "Router rule must be an object.", path));
      return;
    }
    rejectFields(rule, ["key", "name", "targetSubflowKey", "routeTags"], path, issues);
    symbolic(rule.key, `${path}.key`, issues);
    boundedText(rule.name, `${path}.name`, issues);
    symbolic(rule.targetSubflowKey, `${path}.targetSubflowKey`, issues);
    if (!Array.isArray(rule.routeTags) || rule.routeTags.length > 16 || !rule.routeTags.every((tag) => typeof tag === "string" && tag.length > 0 && tag.length <= 100)) {
      issues.push(error("bootstrap.invalid_route_tags", "Router routeTags must be a bounded nonempty string array.", `${path}.routeTags`));
    }
  });
  if (!isRecord(value.fallback)) issues.push(error("bootstrap.invalid_router_fallback", "Router fallback must be an object.", "plan.router.fallback"));
  else if (value.fallback.kind === "fail") rejectFields(value.fallback, ["kind"], "plan.router.fallback", issues);
  else if (value.fallback.kind === "subflow") {
    rejectFields(value.fallback, ["kind", "targetSubflowKey"], "plan.router.fallback", issues);
    symbolic(value.fallback.targetSubflowKey, "plan.router.fallback.targetSubflowKey", issues);
  } else issues.push(error("bootstrap.invalid_router_fallback", "Router fallback kind is invalid.", "plan.router.fallback.kind"));
}

function parseSubflow(value: unknown, index: number, issues: AutomationStudioFlowBootstrapIssue[]): void {
  const path = `plan.subflows.${index}`;
  if (!isRecord(value)) {
    issues.push(error("bootstrap.invalid_subflow", "Subflow must be an object.", path));
    return;
  }
  rejectFields(value, ["key", "name", "role", "nodes", "edges"], path, issues);
  symbolic(value.key, `${path}.key`, issues);
  boundedText(value.name, `${path}.name`, issues);
  if (!["primary", "integration", "recovery", "fallback", "utility"].includes(String(value.role))) issues.push(error("bootstrap.invalid_subflow_role", "Subflow role is invalid.", `${path}.role`));
  if (!Array.isArray(value.nodes) || value.nodes.length === 0 || value.nodes.length > AUTOMATION_STUDIO_FLOW_BOOTSTRAP_LIMITS.maxNodesPerSubflow) {
    issues.push(error("bootstrap.invalid_nodes", "Subflow nodes must be a nonempty bounded array.", `${path}.nodes`));
  } else value.nodes.forEach((node, nodeIndex) => parseNode(node, `${path}.nodes.${nodeIndex}`, issues));
  if (!Array.isArray(value.edges) || value.edges.length > AUTOMATION_STUDIO_FLOW_BOOTSTRAP_LIMITS.maxEdgesPerSubflow) {
    issues.push(error("bootstrap.invalid_edges", "Subflow edges must be a bounded array.", `${path}.edges`));
  } else value.edges.forEach((edge, edgeIndex) => parseEdge(edge, `${path}.edges.${edgeIndex}`, issues));
}

function parseNode(value: unknown, path: string, issues: AutomationStudioFlowBootstrapIssue[]): void {
  if (!isRecord(value)) {
    issues.push(error("bootstrap.invalid_node", "Bootstrap node must be an object.", path));
    return;
  }
  rejectFields(value, ["key", "definitionId", "definitionVersion", "parameters", "outputActionId"], path, issues);
  symbolic(value.key, `${path}.key`, issues);
  identifier(value.definitionId, `${path}.definitionId`, issues);
  boundedText(value.definitionVersion, `${path}.definitionVersion`, issues);
  if (value.parameters !== undefined && !isJsonObject(value.parameters)) issues.push(error("bootstrap.invalid_parameters", "Node parameters must be a JSON object.", `${path}.parameters`));
  if (value.outputActionId !== undefined) identifier(value.outputActionId, `${path}.outputActionId`, issues);
}

function parseEdge(value: unknown, path: string, issues: AutomationStudioFlowBootstrapIssue[]): void {
  if (!isRecord(value)) {
    issues.push(error("bootstrap.invalid_edge", "Bootstrap edge must be an object.", path));
    return;
  }
  rejectFields(value, ["key", "source", "target"], path, issues);
  symbolic(value.key, `${path}.key`, issues);
  parseEndpoint(value.source, `${path}.source`, issues);
  parseEndpoint(value.target, `${path}.target`, issues);
}

function parseEndpoint(value: unknown, path: string, issues: AutomationStudioFlowBootstrapIssue[]): void {
  if (!isRecord(value)) {
    issues.push(error("bootstrap.invalid_endpoint", "Edge endpoint must be an object.", path));
    return;
  }
  rejectFields(value, ["nodeKey", "portId"], path, issues);
  symbolic(value.nodeKey, `${path}.nodeKey`, issues);
  identifier(value.portId, `${path}.portId`, issues);
}

function validateSubflow(
  subflow: AutomationStudioFlowBootstrapSubflow,
  subflowIndex: number,
  registry: AutomationStudioNodeRegistry,
  resolution: AutomationStudioNodeRegistryResolution,
  issues: AutomationStudioFlowBootstrapIssue[]
): void {
  const path = `plan.subflows.${subflowIndex}`;
  const nodes = new Map<string, { node: AutomationStudioFlowBootstrapNode; definition?: AutomationStudioNodeDefinition }>();
  for (const [nodeIndex, node] of subflow.nodes.entries()) {
    const nodePath = `${path}.nodes.${nodeIndex}`;
    if (nodes.has(node.key)) issues.push(error("bootstrap.duplicate_node_key", "Node keys must be unique within a Subflow.", `${nodePath}.key`));
    const definition = registry.get(node.definitionId, resolution);
    nodes.set(node.key, { node, ...(definition ? { definition } : {}) });
    if (!definition) {
      issues.push(error("bootstrap.definition_unavailable", "Node definition is missing or unavailable in this Flow scope.", `${nodePath}.definitionId`));
      continue;
    }
    if (node.definitionVersion !== definition.version) issues.push(error("bootstrap.definition_version_mismatch", "Node definition version must exactly match the registry.", `${nodePath}.definitionVersion`));
    validateParameters(node.parameters ?? {}, definition.parameters, nodePath, issues);
    validateOutputAction(node, definition, nodePath, issues);
  }
  const edgeKeys = new Set<string>();
  const adjacency = new Map([...nodes.keys()].map((key) => [key, [] as string[]]));
  const indegree = new Map([...nodes.keys()].map((key) => [key, 0]));
  const undirected = new Map([...nodes.keys()].map((key) => [key, [] as string[]]));
  const connections = new Set<string>();
  const sourceConnections = new Map<string, number>();
  const targetConnections = new Map<string, number>();
  for (const [edgeIndex, edge] of subflow.edges.entries()) {
    const edgePath = `${path}.edges.${edgeIndex}`;
    if (edgeKeys.has(edge.key)) issues.push(error("bootstrap.duplicate_edge_key", "Edge keys must be unique within a Subflow.", `${edgePath}.key`));
    edgeKeys.add(edge.key);
    const source = nodes.get(edge.source.nodeKey);
    const target = nodes.get(edge.target.nodeKey);
    if (!source) issues.push(error("bootstrap.unknown_source_node", "Edge source node is unknown.", `${edgePath}.source.nodeKey`));
    if (!target) issues.push(error("bootstrap.unknown_target_node", "Edge target node is unknown.", `${edgePath}.target.nodeKey`));
    if (edge.source.nodeKey === edge.target.nodeKey) issues.push(error("bootstrap.self_edge", "Self edges are not allowed in bootstrap plans.", edgePath));
    const connectionKey = `${edge.source.nodeKey}:${edge.source.portId}>${edge.target.nodeKey}:${edge.target.portId}`;
    if (connections.has(connectionKey)) issues.push(error("bootstrap.duplicate_connection", "Duplicate port connection is not allowed.", edgePath));
    connections.add(connectionKey);
    const sourcePort = source?.definition?.outputs.find((port) => port.id === edge.source.portId);
    const targetPort = target?.definition?.inputs.find((port) => port.id === edge.target.portId);
    if (source?.definition && !sourcePort) issues.push(error("bootstrap.unknown_source_port", "Edge source port is not an output of the selected definition.", `${edgePath}.source.portId`));
    if (target?.definition && !targetPort) issues.push(error("bootstrap.unknown_target_port", "Edge target port is not an input of the selected definition.", `${edgePath}.target.portId`));
    if (sourcePort && targetPort && !compatiblePorts(sourcePort, targetPort)) issues.push(error("bootstrap.incompatible_ports", "Edge port value types are incompatible.", edgePath));
    if (sourcePort) {
      const sourceKey = `${edge.source.nodeKey}:${edge.source.portId}`;
      const count = (sourceConnections.get(sourceKey) ?? 0) + 1;
      sourceConnections.set(sourceKey, count);
      if (count > 1 && !sourcePort.multiple) issues.push(error("bootstrap.source_port_cardinality", "Source port does not allow multiple connections.", `${edgePath}.source.portId`));
    }
    if (targetPort) {
      const targetKey = `${edge.target.nodeKey}:${edge.target.portId}`;
      const count = (targetConnections.get(targetKey) ?? 0) + 1;
      targetConnections.set(targetKey, count);
      if (count > 1 && !targetPort.multiple) issues.push(error("bootstrap.target_port_cardinality", "Target port does not allow multiple connections.", `${edgePath}.target.portId`));
    }
    if (source && target && source !== target) {
      adjacency.get(edge.source.nodeKey)?.push(edge.target.nodeKey);
      indegree.set(edge.target.nodeKey, (indegree.get(edge.target.nodeKey) ?? 0) + 1);
      undirected.get(edge.source.nodeKey)?.push(edge.target.nodeKey);
      undirected.get(edge.target.nodeKey)?.push(edge.source.nodeKey);
    }
  }
  validateRequiredInputConnections(subflow, nodes, issues, path);
  validateConnectivityAndDepth(nodes, adjacency, indegree, undirected, issues, path);
}

function validateParameters(values: JsonObject, definitions: AutomationNodeParameter[], path: string, issues: AutomationStudioFlowBootstrapIssue[]): void {
  const byId = new Map(definitions.map((parameter) => [parameter.id, parameter]));
  for (const key of Object.keys(values)) if (!byId.has(key)) issues.push(error("bootstrap.unknown_parameter", "Node parameter is not declared by its definition.", `${path}.parameters.${key}`));
  for (const parameter of definitions) {
    const value = values[parameter.id];
    if (value === undefined) {
      if (parameter.required && parameter.defaultValue === undefined) issues.push(error("bootstrap.missing_parameter", "Required node parameter is missing.", `${path}.parameters.${parameter.id}`));
      continue;
    }
    if (isStateBinding(value)) {
      if (parameter.allowStateBinding === false || !value.$state.path.trim()) issues.push(error("bootstrap.invalid_state_binding", "Parameter does not allow this state binding.", `${path}.parameters.${parameter.id}`));
      continue;
    }
    if (!parameterValueMatches(value, parameter)) issues.push(error("bootstrap.invalid_parameter_value", "Node parameter value does not satisfy its definition.", `${path}.parameters.${parameter.id}`));
  }
}

function validateOutputAction(node: AutomationStudioFlowBootstrapNode, definition: AutomationStudioNodeDefinition, path: string, issues: AutomationStudioFlowBootstrapIssue[]): void {
  const contract = definition.outputAction;
  if (!contract) {
    if (node.outputActionId !== undefined) issues.push(error("bootstrap.unexpected_output_action", "Node definition has no output action contract.", `${path}.outputActionId`));
    return;
  }
  if (!node.outputActionId) {
    issues.push(error("bootstrap.missing_output_action", "Node definition requires an explicit output action.", `${path}.outputActionId`));
    return;
  }
  if (contract.fixedOutputId && node.outputActionId !== contract.fixedOutputId) issues.push(error("bootstrap.invalid_output_action", "Node output action does not match the fixed output contract.", `${path}.outputActionId`));
  if (contract.allowedOutputIds && !contract.allowedOutputIds.includes(node.outputActionId)) issues.push(error("bootstrap.invalid_output_action", "Node output action is outside the allowed output contract.", `${path}.outputActionId`));
}

function validateRequiredInputConnections(
  subflow: AutomationStudioFlowBootstrapSubflow,
  nodes: Map<string, { node: AutomationStudioFlowBootstrapNode; definition?: AutomationStudioNodeDefinition }>,
  issues: AutomationStudioFlowBootstrapIssue[],
  path: string
): void {
  const connected = new Set(subflow.edges.map((edge) => `${edge.target.nodeKey}:${edge.target.portId}`));
  for (const [key, item] of nodes) for (const port of item.definition?.inputs ?? []) {
    if (port.required && !connected.has(`${key}:${port.id}`)) issues.push(error("bootstrap.required_input_unconnected", "Required node input port is not connected.", `${path}.nodes.${key}.inputs.${port.id}`));
  }
}

function validateConnectivityAndDepth(
  nodes: Map<string, unknown>,
  adjacency: Map<string, string[]>,
  indegree: Map<string, number>,
  undirected: Map<string, string[]>,
  issues: AutomationStudioFlowBootstrapIssue[],
  path: string
): void {
  if (!nodes.size) return;
  const first = nodes.keys().next().value as string;
  const seen = new Set<string>([first]);
  const queue = [first];
  while (queue.length) {
    const key = queue.shift()!;
    for (const next of undirected.get(key) ?? []) if (!seen.has(next)) {
      seen.add(next);
      queue.push(next);
    }
  }
  if (seen.size !== nodes.size) issues.push(error("bootstrap.disconnected_graph", "Every node in a Subflow must belong to one connected graph.", `${path}.nodes`));
  const degrees = new Map(indegree);
  const roots = [...degrees].filter(([, degree]) => degree === 0).map(([key]) => key).sort();
  const depths = new Map(roots.map((key) => [key, 0]));
  const topo = [...roots];
  let visited = 0;
  while (topo.length) {
    const key = topo.shift()!;
    visited += 1;
    for (const next of (adjacency.get(key) ?? []).sort()) {
      depths.set(next, Math.max(depths.get(next) ?? 0, (depths.get(key) ?? 0) + 1));
      degrees.set(next, (degrees.get(next) ?? 0) - 1);
      if (degrees.get(next) === 0) topo.push(next);
    }
    topo.sort();
  }
  if (visited !== nodes.size) issues.push(error("bootstrap.cyclic_graph", "Bootstrap Subflow graphs must be acyclic.", `${path}.edges`));
  if (Math.max(0, ...depths.values()) + 1 > AUTOMATION_STUDIO_FLOW_BOOTSTRAP_LIMITS.maxGraphDepth) issues.push(error("bootstrap.graph_too_deep", "Bootstrap Subflow exceeds the graph-depth limit.", `${path}.edges`));
}

function layoutNodes(subflow: AutomationStudioFlowBootstrapSubflow): Array<AutomationStudioFlowBootstrapNode & { position: { x: number; y: number } }> {
  const indegree = new Map(subflow.nodes.map((node) => [node.key, 0]));
  const adjacency = new Map(subflow.nodes.map((node) => [node.key, [] as string[]]));
  for (const edge of subflow.edges) {
    indegree.set(edge.target.nodeKey, (indegree.get(edge.target.nodeKey) ?? 0) + 1);
    adjacency.get(edge.source.nodeKey)?.push(edge.target.nodeKey);
  }
  const depths = new Map<string, number>();
  const queue = [...indegree].filter(([, degree]) => degree === 0).map(([key]) => key).sort();
  for (const key of queue) depths.set(key, 0);
  while (queue.length) {
    const key = queue.shift()!;
    for (const next of (adjacency.get(key) ?? []).sort()) {
      depths.set(next, Math.max(depths.get(next) ?? 0, (depths.get(key) ?? 0) + 1));
      indegree.set(next, (indegree.get(next) ?? 0) - 1);
      if (indegree.get(next) === 0) queue.push(next);
    }
    queue.sort();
  }
  const rowByDepth = new Map<number, number>();
  return [...subflow.nodes].sort((left, right) => (depths.get(left.key) ?? 0) - (depths.get(right.key) ?? 0) || left.key.localeCompare(right.key)).map((node) => {
    const depth = depths.get(node.key) ?? 0;
    const row = rowByDepth.get(depth) ?? 0;
    rowByDepth.set(depth, row + 1);
    return {
      ...node,
      position: {
        x: depth * AUTOMATION_STUDIO_FLOW_BOOTSTRAP_LIMITS.horizontalSpacing,
        y: row * AUTOMATION_STUDIO_FLOW_BOOTSTRAP_LIMITS.verticalSpacing
      }
    };
  });
}

function deriveRisk(plan: AutomationStudioFlowBootstrapPlan, registry: AutomationStudioNodeRegistry, resolution: AutomationStudioNodeRegistryResolution): AutomationStudioFlowBootstrapRisk {
  let risk: AutomationStudioFlowBootstrapRisk = plan.subflows.length > 3 ? "medium" : "low";
  for (const subflow of plan.subflows) for (const node of subflow.nodes) {
    const definition = registry.get(node.definitionId, resolution);
    if (!definition) continue;
    const runtime = definition.safety?.runtime;
    if (definition.safety?.privileged || definition.safety?.requiresOperatorApproval || runtime?.process || runtime?.childProcess || runtime?.filesystemRoots?.length) return "high";
    if (definition.outputAction || definition.requiredRuntimeCapabilities?.length || definition.safety?.requiredPermissions?.length || runtime?.networkDestinations?.length || runtime?.secretHandles?.length) risk = "medium";
  }
  return risk;
}

const BOOTSTRAP_INTENT_EQUIVALENTS = [
  ["fill", "type", "enter", "input"],
  ["select", "choose", "pick", "option"],
  ["click", "submit", "button", "press", "activate", "tap"],
  ["assert", "verify", "expect", "check", "wait", "exists", "appears", "extract", "text"],
  ["navigate", "open", "visit", "url"],
  ["clear", "empty", "erase"],
  ["scroll"],
  ["keypress", "keyboard", "key"],
  ["capture", "snapshot"]
] as const;

const BOOTSTRAP_STOP_WORDS = new Set([
  "a", "an", "and", "as", "at", "be", "by", "create", "do", "flow", "for", "form", "from",
  "in", "into", "it", "of", "on", "or", "page", "please", "the", "then", "to", "using", "with"
]);

function rankBootstrapDefinitions(
  definitions: AutomationStudioNodeDefinition[],
  instructionText: string
): {
  required: Array<{ term: string; definition?: AutomationStudioNodeDefinition }>;
  ranked: AutomationStudioNodeDefinition[];
} {
  const tokens = new Set(tokenizeBootstrapText(instructionText));
  if (!tokens.size) return { required: [], ranked: definitions };
  const searchable = new Map(definitions.map((definition) => [definition.id, bootstrapDefinitionSearchFields(definition)]));
  const required: Array<{ term: string; definition?: AutomationStudioNodeDefinition }> = [];
  const requiredIds = new Set<string>();
  for (const equivalents of BOOTSTRAP_INTENT_EQUIVALENTS) {
    const requested = equivalents.find((term) => tokens.has(term));
    if (!requested) continue;
    const candidates = definitions
      .map((definition) => ({ definition, score: scoreBootstrapDefinition(searchable.get(definition.id)!, equivalents) }))
      .filter((candidate) => candidate.score > 0)
      .sort((left, right) => right.score - left.score || left.definition.id.localeCompare(right.definition.id));
    const definition = candidates[0]?.definition;
    if (definition) requiredIds.add(definition.id);
    required.push({ term: requested, ...(definition ? { definition } : {}) });
  }
  for (const foundation of [["start", "begin", "entry"], ["end", "finish", "terminal", "complete"]] as const) {
    const candidates = definitions
      .map((definition) => ({ definition, score: scoreBootstrapDefinition(searchable.get(definition.id)!, foundation) }))
      .filter((candidate) => candidate.score > 0)
      .sort((left, right) => right.score - left.score || left.definition.id.localeCompare(right.definition.id));
    const definition = candidates[0]?.definition;
    if (definition && !requiredIds.has(definition.id)) {
      requiredIds.add(definition.id);
      required.push({ term: foundation[0], definition });
    }
  }
  const instructionTerms = [...tokens].filter((term) => !BOOTSTRAP_STOP_WORDS.has(term));
  const ranked = definitions
    .filter((definition) => !requiredIds.has(definition.id))
    .map((definition) => ({
      definition,
      score: scoreBootstrapDefinition(searchable.get(definition.id)!, instructionTerms)
    }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || left.definition.id.localeCompare(right.definition.id))
    .map((candidate) => candidate.definition);
  return { required, ranked };
}

function tokenizeBootstrapText(value: string): string[] {
  return [...new Set(value.toLowerCase().split(/[^a-z0-9]+/g).filter((term) => term.length >= 2 && term.length <= 64))];
}

function bootstrapDefinitionSearchFields(definition: AutomationStudioNodeDefinition): {
  identity: string;
  label: string;
  description: string;
  detail: string;
} {
  return {
    identity: [definition.id, definition.outputAction?.fixedOutputId, ...(definition.outputAction?.allowedOutputIds ?? [])].filter(Boolean).join(" ").toLowerCase(),
    label: definition.label.toLowerCase(),
    description: definition.description.toLowerCase(),
    detail: [
      definition.category,
      ...(definition.tags ?? []),
      ...Object.entries(definition.capabilities).filter(([, enabled]) => enabled).map(([key]) => key),
      ...definition.inputs.map((port) => port.id),
      ...definition.outputs.map((port) => port.id),
      ...definition.parameters.map((parameter) => parameter.id)
    ].join(" ").toLowerCase()
  };
}

function scoreBootstrapDefinition(
  fields: ReturnType<typeof bootstrapDefinitionSearchFields>,
  terms: readonly string[]
): number {
  let score = 0;
  for (const term of terms) {
    if (containsBootstrapTerm(fields.identity, term)) score += 24;
    if (containsBootstrapTerm(fields.label, term)) score += 12;
    if (containsBootstrapTerm(fields.description, term)) score += 5;
    if (containsBootstrapTerm(fields.detail, term)) score += 2;
  }
  return score;
}

function containsBootstrapTerm(value: string, term: string): boolean {
  return value.split(/[^a-z0-9]+/g).includes(term);
}
function compactDefinition(definition: AutomationStudioNodeDefinition): AutomationStudioFlowBootstrapCatalogEntry {
  return {
    id: definition.id,
    version: definition.version,
    label: definition.label.slice(0, 100),
    description: definition.description.slice(0, 80),
    category: definition.category,
    capabilities: Object.entries(definition.capabilities).filter(([, enabled]) => enabled === true).map(([key]) => key).sort(),
    inputs: definition.inputs.map((port) => ({ id: port.id, type: port.valueType, ...(port.required === true ? { required: true as const } : {}), ...(port.multiple === true ? { multiple: true as const } : {}) })),
    outputs: definition.outputs.map((port) => ({ id: port.id, type: port.valueType, ...(port.multiple === true ? { multiple: true as const } : {}) })),
    parameters: definition.parameters.map((parameter) => ({
      id: parameter.id,
      type: parameter.valueType,
      ...(parameter.required === true ? { required: true as const } : {}),
      ...(parameter.allowStateBinding === false ? { stateBindable: false as const } : {}),
      ...(parameter.defaultValue !== undefined ? { defaultValue: parameter.defaultValue } : {}),
      ...(parameter.options ? { options: parameter.options.map((option) => option.value) } : {}),
      ...(parameter.constraints ? { constraints: parameter.constraints } : {})
    })),
    ...(definition.outputAction ? { outputAction: {
      required: true as const,
      ...(definition.outputAction.fixedOutputId ? { fixed: definition.outputAction.fixedOutputId } : {}),
      ...(definition.outputAction.allowedOutputIds ? { allowed: definition.outputAction.allowedOutputIds } : {})
    } } : {})
  };
}

function compatiblePorts(source: AutomationNodePort, target: AutomationNodePort): boolean {
  return source.valueType === "any" || target.valueType === "any" || source.valueType === target.valueType;
}

function parameterValueMatches(value: JsonValue, parameter: AutomationNodeParameter): boolean {
  const type = parameter.valueType;
  if (parameter.options && (typeof value !== "string" || !parameter.options.some((option) => option.value === value))) return false;
  if ((type === "number" && typeof value !== "number")
    || ((type === "string" || type === "expression") && typeof value !== "string")
    || (type === "boolean" && typeof value !== "boolean")
    || (type === "array" && !Array.isArray(value))
    || ((type === "object" || type === "json") && (value === null || typeof value !== "object" || Array.isArray(value)))) return false;
  const constraints = parameter.constraints;
  if (!constraints) return true;
  if (typeof value === "number") {
    if (constraints.integer && !Number.isInteger(value)) return false;
    if (constraints.minimum !== undefined && value < constraints.minimum) return false;
    if (constraints.maximum !== undefined && value > constraints.maximum) return false;
  }
  if (typeof value === "string") {
    if (constraints.minLength !== undefined && value.length < constraints.minLength) return false;
    if (constraints.maxLength !== undefined && value.length > constraints.maxLength) return false;
    if (constraints.pattern !== undefined) {
      try { if (!new RegExp(constraints.pattern).test(value)) return false; } catch { return false; }
    }
  }
  return true;
}

function isStateBinding(value: JsonValue): value is { $state: { path: string; fallback?: JsonValue } } {
  if (!isRecord(value) || Array.isArray(value) || !Object.keys(value).every((key) => key === "$state")) return false;
  const binding: unknown = (value as unknown as Record<string, unknown>)["$state"];
  return isRecord(binding) && typeof binding["path"] === "string";
}

function rejectFields(value: Record<string, unknown>, allowed: string[], path: string, issues: AutomationStudioFlowBootstrapIssue[]): void {
  const fields = new Set(allowed);
  for (const key of Object.keys(value)) if (!fields.has(key)) issues.push(error("bootstrap.unexpected_field", "Bootstrap output contains an unexpected field.", `${path}.${key}`));
}

function symbolic(value: unknown, path: string, issues: AutomationStudioFlowBootstrapIssue[]): void {
  if (typeof value !== "string" || !/^[a-z][a-z0-9_-]{0,63}$/.test(value)) issues.push(error("bootstrap.invalid_symbol", "Symbolic keys must be lower-case identifiers and are not durable IDs.", path));
}

function identifier(value: unknown, path: string, issues: AutomationStudioFlowBootstrapIssue[]): void {
  if (typeof value !== "string" || value.length === 0 || value.length > 200 || !/^[a-z0-9_.:-]+$/i.test(value)) issues.push(error("bootstrap.invalid_identifier", "Identifier is invalid.", path));
}

function boundedText(value: unknown, path: string, issues: AutomationStudioFlowBootstrapIssue[]): void {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > AUTOMATION_STUDIO_FLOW_BOOTSTRAP_LIMITS.maxStringLength) issues.push(error("bootstrap.invalid_text", "Text must be nonempty and bounded.", path));
}

function safeByteLength(value: unknown): number {
  try { return Buffer.byteLength(JSON.stringify(value), "utf8"); } catch { return Number.POSITIVE_INFINITY; }
}

function isJsonObject(value: unknown): value is JsonObject {
  return isRecord(value) && isJsonValue(value);
}

function isJsonValue(value: unknown, seen = new Set<object>(), depth = 0): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (!value || typeof value !== "object" || seen.has(value as object) || depth > 12) return false;
  seen.add(value as object);
  if (Array.isArray(value)) return value.length <= 256 && value.every((item) => isJsonValue(item, seen, depth + 1));
  const entries = Object.entries(value as Record<string, unknown>);
  return entries.length <= 256 && entries.every(([key, item]) => key.length <= 200 && isJsonValue(item, seen, depth + 1));
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function error(code: string, message: string, path?: string): AutomationStudioFlowBootstrapIssue {
  return { severity: "error", code, message, ...(path ? { path } : {}) };
}
