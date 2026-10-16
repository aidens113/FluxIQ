// Which plan is a single-subflow plan (t679, `../single-subflow-plan.ts`): one
// subflow the router runs, with no inputs or outputs, carrying parts; never a
// plan with ports, of several subflows, or with the router-run subflow Core adds.
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowBootstrapSubflow } from "../../../flow-bootstrap/plan/index.ts";
import { automationStudioProjectStructurePlan, type AutomationStudioProjectStructurePlan } from "../../contracts/index.ts";
import { automationStudioProjectSingleSubflowPlan } from "../single-subflow-plan.ts";

/** A structure plan of `subflows`, the router running `routed`, with each subflow's parts. */
function structure(subflows: AutomationStudioFlowBootstrapSubflow[], routed: string, partOf: Record<string, string[]>): AutomationStudioProjectStructurePlan {
  const plan: Omit<AutomationStudioProjectStructurePlan, "digest"> = {
    taskSpecDigest: "f".repeat(64),
    plan: { schemaVersion: "0.1", router: { name: "Plots", rules: [], fallback: { kind: "subflow", targetSubflowKey: routed } }, subflows },
    partOf
  };
  return { ...plan, digest: automationStudioProjectStructurePlan.digest(plan) };
}

const body = (key: string, extra: Partial<AutomationStudioFlowBootstrapSubflow> = {}): AutomationStudioFlowBootstrapSubflow => ({ key, name: key, role: "primary", nodes: [], edges: [], ...extra });
const ports = { inputs: [{ id: "plot", name: "plot", valueType: { kind: "unknown" as const } }], outputs: [] };

describe("a single-subflow plan", () => {
  it("is one subflow the router runs, with no inputs or outputs, carrying parts", () => {
    expect(automationStudioProjectSingleSubflowPlan(structure([body("book_plot")], "book_plot", { book_plot: ["p1"] }))).toBe("book_plot");
  });

  it("is not a plan whose one subflow has ports, carries no part, or is not the one the router runs", () => {
    expect(automationStudioProjectSingleSubflowPlan(structure([body("book_plot", { interface: ports })], "book_plot", { book_plot: ["p1"] }))).toBeUndefined();
    expect(automationStudioProjectSingleSubflowPlan(structure([body("book_plot", { interface: { inputs: [], outputs: [] } })], "book_plot", { book_plot: ["p1"] }))).toBeUndefined();
    expect(automationStudioProjectSingleSubflowPlan(structure([body("book_plot")], "book_plot", { book_plot: [] }))).toBeUndefined();
    expect(automationStudioProjectSingleSubflowPlan(structure([body("book_plot")], "main", { book_plot: ["p1"] }))).toBeUndefined();
    expect(automationStudioProjectSingleSubflowPlan(undefined)).toBeUndefined();
  });

  it("is not a plan of several subflows, nor one with the router-run subflow Core adds", () => {
    const two = structure([body("find_plot", { role: "utility", interface: { inputs: [], outputs: [] } }), body("book_plot", { role: "utility", interface: { inputs: [], outputs: [] } })], "find_plot", { find_plot: ["p1"], book_plot: ["p2"] });
    expect(automationStudioProjectSingleSubflowPlan(two)).toBeUndefined();
    const added = structure([body("main"), body("book_plot", { role: "utility", interface: ports })], "main", { main: [], book_plot: ["p1"] });
    expect(automationStudioProjectSingleSubflowPlan(added)).toBeUndefined();
  });
});
