import { describe, expect, it } from "vitest";
import type { AutomationStudioNodeAttemptTrace } from "../../contracts.ts";
import { AUTOMATION_STUDIO_STATE_ROUTE_RETURN_LIMIT, automationStudioRunProgressMark, automationStudioStateRouteGuard } from "../index.ts";

const attempt = (nodeId: string, extra: Partial<AutomationStudioNodeAttemptTrace> = {}): AutomationStudioNodeAttemptTrace => ({
  attemptId: `${nodeId}.attempt.1`, nodeId, definitionId: "builtin.policy.action", startedAt: 1, status: "succeeded", route: "success", inputs: {}, outputs: {}, effects: [], ...extra
});

describe("the run's progress mark", () => {
  it("counts distinct nodes that acted, and nothing that was skipped or failed", () => {
    expect(automationStudioRunProgressMark([
      attempt("a"),
      attempt("a"),
      attempt("b", { status: "failed", route: "failed" }),
      attempt("c", { route: "skipped", skipped: { reason: "target_absent", code: "web.target.not_found" } }),
      attempt("d", { route: "state_routed", skipped: { reason: "state_routed", code: "web.target.not_found", toNodeId: "e", direction: "forward" } })
    ])).toBe(1);
  });

  it("counts every For Each pass into its body", () => {
    const pass = attempt("loop", { definitionId: "builtin.control.for-each", route: "body" });
    expect(automationStudioRunProgressMark([pass, attempt("a"), pass, pass])).toBe(2 + 3);
  });

  it("counts every Repeat pass into its body, and not the pass that ends the loop", () => {
    const pass = attempt("again", { definitionId: "builtin.control.repeat", route: "body" });
    const done = attempt("again", { definitionId: "builtin.control.repeat", route: "done" });
    expect(automationStudioRunProgressMark([pass, attempt("a"), pass, done])).toBe(2 + 2);
  });
});

describe("the state-route guard", () => {
  it("allows three returns to one node without progress and stops the fourth", () => {
    const guard = automationStudioStateRouteGuard();
    expect(guard.admit("x", 0)).toEqual({ admitted: true });
    for (let index = 0; index < AUTOMATION_STUDIO_STATE_ROUTE_RETURN_LIMIT; index += 1) expect(guard.admit("x", 0)).toEqual({ admitted: true });
    expect(guard.admit("x", 0)).toEqual({ admitted: false, returns: 4 });
  });

  it("resets the count when the run made progress between two routes", () => {
    const guard = automationStudioStateRouteGuard();
    for (let index = 0; index <= AUTOMATION_STUDIO_STATE_ROUTE_RETURN_LIMIT; index += 1) expect(guard.admit("x", 0).admitted).toBe(true);
    expect(guard.admit("x", 1)).toEqual({ admitted: true });
    for (let index = 0; index < AUTOMATION_STUDIO_STATE_ROUTE_RETURN_LIMIT; index += 1) expect(guard.admit("x", 1).admitted).toBe(true);
    expect(guard.admit("x", 1).admitted).toBe(false);
  });

  it("counts routes into different nodes separately", () => {
    const guard = automationStudioStateRouteGuard();
    for (let index = 0; index <= AUTOMATION_STUDIO_STATE_ROUTE_RETURN_LIMIT; index += 1) guard.admit("x", 0);
    expect(guard.admit("y", 0)).toEqual({ admitted: true });
    expect(guard.admit("x", 0).admitted).toBe(false);
  });
});
