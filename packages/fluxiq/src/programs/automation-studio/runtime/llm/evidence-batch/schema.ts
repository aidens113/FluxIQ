import type { JsonObject } from "../../../../../core/index.ts";
import {
  AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_DEFAULT_MAX_ACTIONS_PER_DECISION,
  AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS
} from "../../loop-limits/index.ts";

/**
 * Builds the optional list variant of an evidence decision.
 *
 * `undefined` is the disabled/default answer and is intended to be omitted from
 * the decision schema's `oneOf`. Every item is discriminated by tool ID and
 * carries that tool's own input schema rather than a generic object.
 */
export function buildAutomationStudioLlmEvidenceBatchDecisionSchema(
  tools: ReadonlyArray<{ toolId: string; inputSchema: JsonObject }>,
  maxActionsPerDecision = AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_DEFAULT_MAX_ACTIONS_PER_DECISION
): JsonObject | undefined {
  if (maxActionsPerDecision === 1) return undefined;
  if (!Number.isInteger(maxActionsPerDecision) || maxActionsPerDecision < 2
    || maxActionsPerDecision > AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS.maxActionsPerDecision
    || tools.length === 0 || tools.some((tool) => !validToolId(tool.toolId))
    || new Set(tools.map((tool) => tool.toolId)).size !== tools.length) return undefined;
  return {
    type: "object",
    additionalProperties: false,
    required: ["kind", "calls"],
    properties: {
      kind: { const: "tool_calls" },
      calls: {
        type: "array",
        minItems: 2,
        maxItems: maxActionsPerDecision,
        items: {
          oneOf: tools.map((tool) => ({
            type: "object",
            additionalProperties: false,
            required: ["toolId", "input"],
            properties: {
              toolId: { const: tool.toolId },
              input: structuredClone(tool.inputSchema)
            }
          }))
        }
      }
    }
  };
}

function validToolId(value: string): boolean {
  return /^[a-z0-9_.:-]{1,200}$/i.test(value);
}
