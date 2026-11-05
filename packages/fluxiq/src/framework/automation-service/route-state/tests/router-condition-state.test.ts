// A host that writes words into its observed state for the model's benefit takes
// them off for a Router's condition, through `routeConditionState`; the model's
// own view (`observeRouteState`) is left as it is.
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowRouter } from "../../../../flows/authoring/model/index.ts";
import { resolveAutomationStudioRouterState } from "../index.ts";

const router = {
  schemaVersion: "0.1", routerId: "r.1", flowId: "f.1", projectId: "p.1", name: "r", status: "active", createdAt: 0, updatedAt: 0,
  rules: [{
    schemaVersion: "0.1", ruleId: "a", routerId: "r.1", name: "a", order: 0, status: "active", createdAt: 0, updatedAt: 0,
    target: { kind: "fail" },
    condition: { signalPath: "state.page.controls", operator: "contains", expected: "x" }
  }]
} as unknown as AutomationStudioFlowRouter;

const observe = () => ({ page: { controls: "[Sold out] Buy" } });
const resolve = (hostRuntime: object) => resolveAutomationStudioRouterState({ router, callerState: undefined, hostRuntime: { capabilities: [], observeRouteState: observe, ...hostRuntime }, projectId: "p.1", flowId: "f.1" });

describe("the state a Router's condition reads", () => {
  it("is the observed state when the host has no condition view", async () => {
    expect((await resolve({})).state).toEqual({ page: { controls: "[Sold out] Buy" } });
  });
  it("is the host's condition view of the observed state when it has one", async () => {
    const resolved = await resolve({ routeConditionState: () => ({ page: { controls: "Buy" } }) });
    expect(resolved.state).toEqual({ page: { controls: "Buy" } });
    expect(resolved.source.observed).toBe(true);
  });
});
