// The canonical JSON Schema a provider must satisfy for a full Flow
// Bootstrap completion. It uses $defs references and carries the whole
// public plan shape.
//
// How many nodes and edges a Subflow may hold is the Flow's size setting
// (`./size-limits.ts`), so the schema is built for a Flow's bounds. The
// constant is the schema at the setting's default, which is what a caller
// with no Flow in hand sends and what the DeepSeek preflight compares a
// context's schema against.
import type { JsonObject } from "../../../../../core/index.ts";
import { automationStudioFlowBootstrapSizeLimits, type AutomationStudioFlowBootstrapSizeLimits } from "./size-limits.ts";

/** The output schema for a Flow with these size bounds; the setting's default when omitted. */
export function automationStudioFlowBootstrapOutputSchema(
  size: AutomationStudioFlowBootstrapSizeLimits = automationStudioFlowBootstrapSizeLimits()
): JsonObject {
  return {
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
        required: ["key", "name", "targetSubflowKey", "routeTags", "condition"],
        properties: {
          key: { $ref: "#/$defs/symbol" },
          name: { $ref: "#/$defs/text" },
          targetSubflowKey: { $ref: "#/$defs/symbol" },
          routeTags: { type: "array", minItems: 0, maxItems: 16, items: { type: "string", minLength: 1, maxLength: 100 } },
          condition: { $ref: "#/$defs/condition" }
        }
      },
      condition: {
        type: "object",
        description: "{signalPath: inputs.<id> or state.<path>, operator, expected?} or {type: all|any|none, conditions: [...]}; the router tests it before any step runs."
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
          nodes: { type: "array", minItems: 1, maxItems: size.maxNodesPerSubflow, items: { $ref: "#/$defs/node" } },
          edges: { type: "array", minItems: 0, maxItems: size.maxEdgesPerSubflow, items: { $ref: "#/$defs/edge" } }
        }
      }
    }
  };
}

/** The output schema at the setting's default. */
export const AUTOMATION_STUDIO_FLOW_BOOTSTRAP_OUTPUT_SCHEMA: JsonObject = automationStudioFlowBootstrapOutputSchema();
