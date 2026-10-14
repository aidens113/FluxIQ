import { describe, expect, it } from "vitest";
import type { AutomationStudioLlmEvidenceTool } from "../../../llm/index.ts";
import { automationStudioSubflowBuilderTools } from "../index.ts";

const tool = (toolId: string): AutomationStudioLlmEvidenceTool => ({ toolId, description: toolId, effect: "observe", inputSchema: { type: "object" } });

describe("the tools a subflow builder keeps", () => {
  it("drops the whole candidate's tools, running the whole Flow, and every project tool, keeping the rest in order", () => {
    const offered = ["web.page.observe", "core.run_flow", "core.run_node", "core.submit_candidate", "core.describe_nodes", "core.test_candidate", "project.write_plan", "project.dispatch", "project.assemble", "core.recall_result"].map(tool);
    expect(automationStudioSubflowBuilderTools(offered).map((entry) => entry.toolId)).toEqual(["web.page.observe", "core.run_node", "core.describe_nodes", "core.recall_result"]);
  });

  it("drops its own two as offered, since its loop adds them", () => {
    expect(automationStudioSubflowBuilderTools([tool("core.submit_subflow"), tool("core.test_subflow")])).toEqual([]);
  });
});
