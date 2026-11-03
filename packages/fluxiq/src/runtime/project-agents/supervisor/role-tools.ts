import type { AutomationStudioLlmEvidenceTool } from "../../llm/evidence-loop.ts";

/** The two Core tools a supervisor keeps: what a node does, and a result it saw before. */
const CORE_KEPT: ReadonlySet<string> = new Set(["core.describe_nodes", "core.recall_result"]);

/**
 * The tools of the harness a project supervisor may use
 * (automation-project-agents-plan.md, `Tool scopes`): the domain's observe-only
 * tools and `core.describe_nodes` / `core.recall_result`, in the order the
 * harness offers them. Never a tool that may act (`core.run_node`, any tool
 * that says per call what it did), never the whole candidate's or a
 * builder's, never a `project.*` tool the host offers (the supervisor adds
 * its own).
 *
 * Its opening look is its own `project.read_task`, and a loop takes one
 * opening look at most, so every kept tool loses its `initialObservation`.
 */
export function automationStudioProjectSupervisorHostTools(tools: readonly AutomationStudioLlmEvidenceTool[]): AutomationStudioLlmEvidenceTool[] {
  return tools
    .filter((tool) => CORE_KEPT.has(tool.toolId) || (tool.effect === "observe" && tool.perCallEffect !== true && !tool.toolId.startsWith("core.") && !tool.toolId.startsWith("project.")))
    .map((tool) => {
      if (tool.initialObservation === undefined) return tool;
      const { initialObservation: _opening, ...kept } = tool;
      return kept;
    });
}
