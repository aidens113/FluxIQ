import { describe, expect, it, vi } from "vitest";
import { buildFlowMapRouteTestPayload, flowMapConditionSummary, flowMapRoutes } from "./route-condition-model";
import { getFlowRouterSummary } from "./router-queries";
import { RouterViewContent } from "./RouterView";

describe("router domain", () => {
  it("builds deterministic route conditions", () => {
    const draft: any = { conditionMode: "when", conditionSource: "inputs", conditionField: "mode", conditionOperator: "equals", conditionExpected: "checkout", expectedKind: "string" };
    expect(flowMapConditionSummary(draft)).toContain("Run input mode");
    expect(buildFlowMapRouteTestPayload(draft, "checkout").inputs).toEqual({ mode: "checkout" });
  });

  it("normalizes rule storage and owns query endpoints", async () => {
    expect(flowMapRoutes({ rules: [{ ruleId: "one" }] })).toHaveLength(1);
    const post = vi.fn().mockResolvedValue({ ok: true, payload: { router: {} } });
    await getFlowRouterSummary({ post } as any, { projectId: "p", flowId: "f" });
    expect(post).toHaveBeenCalledWith("get-flow-router-summary", { projectId: "p", flowId: "f" });
    expect(RouterViewContent.toString()).toContain("subscribeToAutomationStudioMutations");
    expect(RouterViewContent.toString()).toContain("commands.loadRouter");
  });
});
