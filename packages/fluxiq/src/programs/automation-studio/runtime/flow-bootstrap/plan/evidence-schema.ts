// The reference-free completion schema for evidence-guided Bootstrap calls,
// and the limit check a returned evidence result must pass.
import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowBootstrapPlan } from "./contracts.ts";
import { AUTOMATION_STUDIO_EVIDENCE_FLOW_BOOTSTRAP_LIMITS } from "./limits.ts";

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
