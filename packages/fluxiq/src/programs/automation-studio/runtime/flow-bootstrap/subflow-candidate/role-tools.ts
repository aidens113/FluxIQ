import type { AutomationStudioLlmEvidenceTool } from "../../llm/evidence-loop.ts";

/**
 * Tools a subflow builder is never offered (automation-project-agents-plan.md,
 * `Tool scopes`): running the whole Flow, submitting or testing a whole
 * candidate -- the supervisor's, after assembly -- and the builder's own two,
 * which its loop adds itself.
 */
const NOT_A_BUILDERS: ReadonlySet<string> = new Set(["core.run_flow", "core.submit_candidate", "core.test_candidate", "core.submit_subflow", "core.test_subflow"]);

/** The supervisor's own tools: writing and amending the plan, dispatching briefs, assembling the whole candidate. */
const SUPERVISOR_PREFIX = "project.";

/**
 * The tools a subflow builder may use, out of the ones the harness offers:
 * the opening look, the domain's observe-only tools, `core.run_node` for its
 * permitted acts, and the description and recall tools. Order is kept, so the
 * loop's tool list reads as the candidate loop's does.
 */
export function automationStudioSubflowBuilderTools(tools: readonly AutomationStudioLlmEvidenceTool[]): AutomationStudioLlmEvidenceTool[] {
  return tools.filter((tool) => !NOT_A_BUILDERS.has(tool.toolId) && !tool.toolId.startsWith(SUPERVISOR_PREFIX));
}
