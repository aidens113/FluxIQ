import { describe, expect, it } from "vitest";
import { automationStudioProjectSupervisorHostTools } from "../index.ts";
import { HOST_TOOLS } from "./supervisor-fixture.ts";

describe("the supervisor's host tools", () => {
  it("keeps the observe-only domain tools and the two core reads, without their opening look", () => {
    const kept = automationStudioProjectSupervisorHostTools([...HOST_TOOLS, { toolId: "core.recall_result", description: "Recall", effect: "observe", inputSchema: { type: "object" } }]);
    expect(kept.map((tool) => tool.toolId)).toEqual(["web.page.read", "core.describe_nodes", "core.recall_result"]);
    expect(kept.some((tool) => tool.initialObservation !== undefined)).toBe(false);
    expect(HOST_TOOLS[0]!.initialObservation).toBeDefined();
  });
});
