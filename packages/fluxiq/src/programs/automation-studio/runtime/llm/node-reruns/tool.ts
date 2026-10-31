import type { AutomationStudioLlmEvidenceTool } from "../evidence-loop.ts";

export const AUTOMATION_STUDIO_LLM_RUN_NODES_TOOL_ID = "core.run_nodes";

/** Declaration only: the owning loop decides whether proven originals and trusted authority exist. */
export function automationStudioLlmRunNodesTool(): AutomationStudioLlmEvidenceTool {
  return {
    toolId: AUTOMATION_STUDIO_LLM_RUN_NODES_TOOL_ID,
    description: "Run an ordered list of successful core.run_node calls from this loop again, with exactly their original concrete inputs, on the target as it stands. Only trusted observations and explicitly repeat-safe temporary state changes qualify. Nothing is reset, rebound or added to the Flow. Every member uses the ordinary runner and allowance; the first failure, uncertainty, changed result code or lost authority stops the list. This is never a judged whole-Flow test.",
    effect: "mutate",
    perCallEffect: true,
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["calls"],
      properties: {
        calls: {
          type: "array",
          minItems: 1,
          uniqueItems: true,
          items: { type: "string", minLength: 1 },
          description: "Prior successful core.run_node callIds from this loop, in execution order."
        }
      }
    }
  };
}
