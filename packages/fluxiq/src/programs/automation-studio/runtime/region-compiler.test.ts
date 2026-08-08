import { describe, expect, it } from "vitest";
import { createBlankAutomationStudioFlowArtifact } from "../model/index.ts";
import { compileAutomationStudioRegions, runCanonicalAutomationStudioFlow } from "./index.ts";

describe("Flow execution regions", () => {
  it("requires explicit typed handoffs between deterministic and policy regions", () => {
    const flow = {
      ...createBlankAutomationStudioFlowArtifact({ flowId: "flow.regions", projectId: "project", name: "Regions", now: 1 }),
      nodes: [{ id: "before", definitionId: "builtin.control.start" }, { id: "policy", definitionId: "builtin.policy.action" }],
      edges: [{ id: "before.policy", sourceNodeId: "before", targetNodeId: "policy", sourcePortId: "success", targetPortId: "in" }],
      regions: [
        { id: "deterministic", name: "Prepare", kind: "deterministic" as const, nodeIds: ["before"], entryPorts: [], exitPorts: [{ id: "success", name: "Success", valueType: { kind: "unknown" as const } }] },
        { id: "policy", name: "Decide", kind: "policy" as const, nodeIds: ["policy"], entryPorts: [{ id: "in", name: "In", valueType: { kind: "unknown" as const } }], exitPorts: [] }
      ]
    };
    expect(compileAutomationStudioRegions(flow).ok).toBe(false);
    flow.regionHandoffs = [{ id: "prepare.decide", fromRegionId: "deterministic", fromPortId: "success", toRegionId: "policy", toPortId: "in" }];
    const compiled = compileAutomationStudioRegions(flow);
    expect(compiled.ok).toBe(true);
    if (compiled.ok) expect(compiled.plan.nodeRegionIds).toEqual({ before: "deterministic", policy: "policy" });
  });

  it("executes typed region handoffs, policy confirmation results, and deterministic recovery", async () => {
    const flow = {
      ...createBlankAutomationStudioFlowArtifact({ flowId: "flow.region-runtime", projectId: "project", name: "Region runtime", now: 1 }),
      nodes: [
        { id: "start", definitionId: "builtin.control.start" },
        { id: "action", definitionId: "builtin.policy.action", parameterValues: { outputId: "output.click", confirmationInputId: "input.clicked" } },
        { id: "recovery", definitionId: "builtin.data.constant", parameterValues: { value: "recovered" } }
      ],
      edges: [
        { id: "start.action", sourceNodeId: "start", targetNodeId: "action", sourcePortId: "success", targetPortId: "in" },
        { id: "action.recovery", sourceNodeId: "action", targetNodeId: "recovery", sourcePortId: "failed", targetPortId: "in" }
      ],
      regions: [
        { id: "prepare", name: "Prepare", kind: "deterministic" as const, nodeIds: ["start"], entryPorts: [], exitPorts: [{ id: "success", name: "Success", valueType: { kind: "unknown" as const } }] },
        { id: "act", name: "Act", kind: "policy" as const, nodeIds: ["action"], entryPorts: [{ id: "in", name: "In", valueType: { kind: "unknown" as const } }], exitPorts: [{ id: "failed", name: "Failed", valueType: { kind: "unknown" as const } }], requiredRuntimeCapabilities: ["policy-output"] },
        { id: "recover", name: "Recover", kind: "deterministic" as const, nodeIds: ["recovery"], entryPorts: [{ id: "in", name: "In", valueType: { kind: "unknown" as const } }], exitPorts: [] }
      ],
      regionHandoffs: [
        { id: "prepare.act", fromRegionId: "prepare", fromPortId: "success", toRegionId: "act", toPortId: "in" },
        { id: "act.recover", fromRegionId: "act", fromPortId: "failed", toRegionId: "recover", toPortId: "in" }
      ]
    };
    const trace = await runCanonicalAutomationStudioFlow(flow, [], {
      runtimeCapabilities: ["policy-output"],
      effectDispatcher: async () => ({ status: "failed", route: "failed", outputs: { confirmed: false } })
    });
    expect(trace.status).toBe("succeeded");
    expect(trace.attempts.map((attempt) => [attempt.nodeId, attempt.regionId, attempt.status])).toEqual([
      ["start", "prepare", "succeeded"], ["action", "act", "failed"], ["recovery", "recover", "succeeded"]
    ]);
    expect(trace.regionTransitions?.map((transition) => transition.handoffId)).toEqual(["prepare.act", "act.recover"]);
    expect(trace.attempts[1]?.policyDecision).toMatchObject({ outcome: "rejected", outputId: "output.click", confirmationInputId: "input.clicked" });
    expect(trace.values.confirmed).toBe(false);
  });

  it("rejects incomplete ownership and missing runtime capabilities", async () => {
    const flow = {
      ...createBlankAutomationStudioFlowArtifact({ flowId: "flow.invalid-region", projectId: "project", name: "Invalid", now: 1 }),
      nodes: [{ id: "start", definitionId: "builtin.control.start" }], edges: [],
      regions: [{ id: "empty", name: "Empty", kind: "policy" as const, nodeIds: [] as string[], entryPorts: [], exitPorts: [], requiredRuntimeCapabilities: ["io"] }]
    };
    expect(compileAutomationStudioRegions(flow)).toMatchObject({ ok: false, issues: [{ code: "flow.region_unowned_node" }] });
    flow.regions[0]!.nodeIds.push("start");
    const trace = await runCanonicalAutomationStudioFlow(flow, []);
    expect(trace.status).toBe("failed");
    expect(trace.message).toContain("requires runtime capability io");
  });

  it("bounds a running policy region by timeout and cancellation", async () => {
    const flow = {
      ...createBlankAutomationStudioFlowArtifact({ flowId: "flow.boundary", projectId: "project", name: "Boundary", now: 1 }),
      nodes: [{ id: "action", definitionId: "builtin.policy.action", parameterValues: { outputId: "output.slow" } }], edges: [],
      regions: [{ id: "policy", name: "Policy", kind: "policy" as const, nodeIds: ["action"], entryPorts: [], exitPorts: [], timeoutMs: 15 }]
    };
    let regionAborted = false;
    const timeoutTrace = await runCanonicalAutomationStudioFlow(flow, [], { effectDispatcher: (_effect, context) => new Promise(() => context?.signal?.addEventListener("abort", () => { regionAborted = true; }, { once: true })) });
    expect(timeoutTrace.status).toBe("failed");
    expect(timeoutTrace.attempts[0]?.message).toContain("exceeded its 15ms timeout");
    expect(regionAborted).toBe(true);

    flow.regions[0]!.timeoutMs = 2_000;
    const controller = new AbortController();
    const cancelled = runCanonicalAutomationStudioFlow(flow, [], {
      signal: controller.signal,
      effectDispatcher: (_effect, context) => new Promise((resolve) => context?.signal?.addEventListener("abort", () => resolve({ status: "failed", route: "failed" }), { once: true }))
    });
    setTimeout(() => controller.abort(), 5);
    await expect(cancelled).resolves.toMatchObject({ status: "cancelled" });
  });
});
