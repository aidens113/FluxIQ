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
    expect(missing).toEqual({ ok: false, code: "predecessor_not_done", issues: [{ code: "project.predecessor_not_done", path: "briefs.0.entry.predecessors.0", predecessor: "a", why: "\"a\" has no done proposal under this plan, and its brief in this call is a reset, which proposes nothing. Send a build or repair brief for \"a\" before this one, or in this same call." }] });
    const circle = automationStudioProjectSupervisorDispatchOrder([brief("a", ["b"]), brief("b", ["a"])], new Set());
    expect(circle.ok === false && circle.code).toBe("cycle");
  });

  it("says a predecessor whose done proposal was made under an earlier plan was dropped by the amendment, and what changed (t588, t590)", () => {
    const amended = automationStudioProjectSupervisorDispatchOrder([brief("b", ["a"])], new Set(), new Map([["a", ["its parts changed"]]]));
    expect(amended.ok === false && amended.issues[0]).toMatchObject({ predecessor: "a", why: "\"a\" had a done proposal only under an earlier plan, and project.amend_plan dropped it: its parts changed. Send a build or repair brief for \"a\" before this one, or in this same call." });
  });
});
