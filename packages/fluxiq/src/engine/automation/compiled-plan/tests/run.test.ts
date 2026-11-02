import { describe, expect, it } from "vitest";
import { assertAutomationStudioCompiledPlan, compileAutomationStudioPlan, type AutomationStudioCompiledPlanEdge, type AutomationStudioCompiledPlanNode } from "../../../../flows/executable/compiled-plan/index.ts";
import { runAutomationStudioCompiledPlan } from "../index.ts";

// A compiled plan's `startNodeId`, chosen by the rule a graph run uses, and the
// run of that plan. The compiler sorts a plan's nodes by id for its digest, and a
// recorded node's id carries an unpadded timeline number, so the sorted list can
// put `entry.10` ahead of `entry.2`: a start taken from it would be a later
// action.

function planNode(id: string, definitionId = "builtin.policy.action"): AutomationStudioCompiledPlanNode {
  return { id, definitionId, definitionVersion: "1.0.0", label: id, parameterValues: { outputId: "click", parameters: {} }, metadata: {} };
}

function planEdge(sourceNodeId: string, targetNodeId: string): AutomationStudioCompiledPlanEdge {
  return { id: `${sourceNodeId}->${targetNodeId}`, sourceNodeId, targetNodeId, sourcePortId: "success", targetPortId: "ready", label: "", metadata: {} };
}

function compilePlan(nodes: AutomationStudioCompiledPlanNode[], edges: AutomationStudioCompiledPlanEdge[]) {
  return compileAutomationStudioPlan({ projectId: "project.start-node", flowId: "flow.start-node", flowRevision: 1, graphRevision: 1, settingsRevision: 1, compiledAt: 1, nodes, edges });
}

/** Twelve recorded node ids at timeline entries 2 to 13, in chain order. */
const recordedPlanChain = Array.from({ length: 12 }, (_, index) => `recorded.candidate.entry.${index + 2}.4f1c2d3e-0000-4000-8000-${String(index + 2).padStart(12, "0")}`);

describe("a compiled plan's start node", () => {
  it("is the root of a twelve-node recorded chain, though the plan lists a later node first, and a run of the plan begins there", async () => {
    const chain = recordedPlanChain;
    const plan = compilePlan([...chain].reverse().map((id) => planNode(id)), chain.slice(1).map((id, index) => planEdge(chain[index]!, id)));
    // The precondition: the compiled node list begins at entry.10.
    expect(plan.nodes[0]?.id).toBe(chain[8]);
    expect(plan.startNodeId).toBe(chain[0]);
    const trace = await runAutomationStudioCompiledPlan(plan, { effectDispatcher: () => ({ status: "success", route: "success", outputs: {} }) });
    expect(trace.status).toBe("succeeded");
    expect(trace.attempts.map((attempt) => attempt.nodeId)).toEqual(chain);
  });

  it("is the Start node a plan declares, wherever the id sort lists it", () => {
    const plan = compilePlan([planNode("zz.start", "builtin.control.start"), planNode("aa.work")], [planEdge("zz.start", "aa.work")]);
    expect(plan.nodes[0]?.id).toBe("aa.work");
    expect(plan.startNodeId).toBe("zz.start");
  });

  it("is null when several nodes have no edge into them, the plan still verifies, and a run of it refuses before any node runs", async () => {
    const plan = compilePlan(["chain-b.1", "chain-a.2", "chain-b.2", "chain-a.1"].map((id) => planNode(id)), [planEdge("chain-a.1", "chain-a.2"), planEdge("chain-b.1", "chain-b.2")]);
    expect(plan.startNodeId).toBeNull();
    expect(() => assertAutomationStudioCompiledPlan(plan)).not.toThrow();
    let dispatched = 0;
    const trace = await runAutomationStudioCompiledPlan(plan, {
      effectDispatcher: () => {
        dispatched += 1;
        return { status: "success", route: "success", outputs: {} };
      }
    });
    expect(trace.status).toBe("failed");
    expect(trace.attempts).toEqual([]);
    expect(dispatched).toBe(0);
    expect(trace.message).toContain("2 nodes have no edge into them (chain-a.1, chain-b.1)");
  });

  it("is null when every node has an edge into it from another", () => {
    const plan = compilePlan(["loop.a", "loop.b", "loop.c"].map((id) => planNode(id)), [planEdge("loop.a", "loop.b"), planEdge("loop.b", "loop.c"), planEdge("loop.c", "loop.a")]);
    expect(plan.startNodeId).toBeNull();
  });
});
