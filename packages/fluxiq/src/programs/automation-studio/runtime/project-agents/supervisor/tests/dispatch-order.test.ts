import { describe, expect, it } from "vitest";
import type { AutomationStudioProjectSubflowBrief } from "../../contracts/index.ts";
import { automationStudioProjectSupervisorDispatchOrder } from "../dispatch-order.ts";

const brief = (subflowKey: string, predecessors: string[], kind: AutomationStudioProjectSubflowBrief["kind"] = "build"): AutomationStudioProjectSubflowBrief => ({
  briefId: `brief-${subflowKey}`, kind, planDigest: "a".repeat(64), subflowKey, parts: ["p1"], entry: { caseId: "c", predecessors }, allowanceUsd: 0.01, maxIterations: 5, permittedActs: []
});

describe("the dispatch order", () => {
  it("hands each brief over after the briefs of the same call it waits on, sent order between equals", () => {
    const order = automationStudioProjectSupervisorDispatchOrder([brief("c", ["b"]), brief("x", []), brief("b", ["a"]), brief("a", ["done"])], new Set(["done"]));
    expect(order.ok && order.ordered.map((entry) => entry.subflowKey)).toEqual(["x", "a", "b", "c"]);
  });

  it("refuses a predecessor neither done nor sent with a brief that proposes, and a circle", () => {
    const missing = automationStudioProjectSupervisorDispatchOrder([brief("b", ["a"]), brief("a", [], "reset")], new Set());
    expect(missing).toEqual({ ok: false, code: "predecessor_not_done", issues: [{ code: "project.predecessor_not_done", path: "briefs.0.entry.predecessors.0" }] });
    const circle = automationStudioProjectSupervisorDispatchOrder([brief("a", ["b"]), brief("b", ["a"])], new Set());
    expect(circle.ok === false && circle.code).toBe("cycle");
  });
});
