import { describe, expect, it } from "vitest";
import { automationStudioChildInvocation } from "../../frames/index.ts";
import { dispatchAutomationStudioLifecycleEvent, automationStudioRegisterLifecycleGraph } from "../index.ts";
import { dispatchInput, edge, fact, fakeHost, flowWith, framed, graph, handler, mainPath } from "./lifecycle-fixtures.ts";

const retryAtPress = { event: "retry", scope: { kind: "nodes", nodeIds: ["press"] } };

describe("dispatchAutomationStudioLifecycleEvent", () => {
  it("answers none with no fact call when no Handler node is in scope", async () => {
    const host = fakeHost({ popup: "true" });
    // An authored failed edge is a candidate, but not a Handler node.
    const plain = flowWith("graph.plain", [{ nodes: [{ id: "fallback", definitionId: "builtin.control.end" }], edges: [edge("press", "fallback", "failed")] }]);
    const invocation = framed(plain);
    for (const event of ["start", "before", "retry", "fail", "before_next"] as const) {
      const outcome = await dispatchAutomationStudioLifecycleEvent(dispatchInput(plain, { invocation, hostRuntime: host.runtime }, { event }));
      expect(outcome).toEqual({ kind: "none", observations: 0, runs: [] });
    }
    expect(host.batches).toEqual([]);
    expect(invocation.run.lifecycle.ledger.handlerRunsForRun).toBe(0);
  });

  it("observes every candidate's when in one batched call, then re-observes once after the body", async () => {
    const host = fakeHost({ popup: "false", banner: "true", cleared: "true" });
    const flow = flowWith("graph.batch", [
      handler("h.popup", { ...retryAtPress, when: [fact("popup")], completionCheck: [fact("cleared")] }, { disposition: "resume" }),
      handler("h.banner", { event: "retry", scope: { kind: "subflow" }, when: [fact("banner")], completionCheck: [fact("cleared")] }, { disposition: "resume" }, "Close the banner")
    ]);
    const invocation = framed(flow);
    const outcome = await dispatchAutomationStudioLifecycleEvent(dispatchInput(flow, { invocation, hostRuntime: host.runtime }, { event: "retry" }));

    expect(outcome.kind).toBe("handled");
    expect(outcome.observations).toBe(2);
    expect(host.batches.map((batch) => batch.conditions.map((condition) => condition.fact))).toEqual([["popup", "banner"], ["cleared"]]);
    const run = outcome.runs[0]!;
    expect(run.handlerId).toBe("graph.batch/h.banner");
    expect(run.decision).toEqual({ kind: "resume" });
    expect(run.bodySteps).toBe(2);
    expect(run.bodyTrace?.status).toBe("succeeded");
    // A handler frame ran the body and left the stack as it found it.
    expect(invocation.run.stack.map((frame) => frame.invocationId)).toEqual(["invocation-1"]);
    expect(run.bodyTrace?.attempts.map((attempt) => attempt.framePath)).toEqual([["invocation-1", "invocation-2"], ["invocation-1", "invocation-2"]]);
    expect(run.recovery).toEqual({ kind: "handler", subject: "Close the banner", outcome: "succeeded", event: "retry" });
    expect(run.execution).toMatchObject({ executionId: "handler-execution-1", handlerId: "graph.batch/h.banner", event: "retry", framePath: ["invocation-1"], nodeId: "press", disposition: { kind: "resume" }, outcome: "succeeded" });
    expect(run.lifecycle).toMatchObject({ event: "retry", handlerId: "graph.batch/h.banner", disposition: { kind: "resume" }, completionCheck: "true" });
    // Evidence is a bounded reference, never the page text the host quoted.
    expect(run.lifecycle?.conditionEvidence[0]?.evidenceRef).toMatch(/^evidence:[0-9a-f]{16}$/);
    expect(JSON.stringify(run)).not.toContain("page text");
  });

  it("never treats unknown as true", async () => {
    const host = fakeHost({ cleared: "true" });
    const flow = flowWith("graph.unknown", [handler("h.popup", { ...retryAtPress, when: [fact("popup")], completionCheck: [fact("cleared")] }, { disposition: "resume" })]);
    const invocation = framed(flow);
    const outcome = await dispatchAutomationStudioLifecycleEvent(dispatchInput(flow, { invocation, hostRuntime: host.runtime }, { event: "retry" }));
    expect(outcome).toEqual({ kind: "none", observations: 1, runs: [] });

    // No host at all: every condition is unknown, and nothing runs.
    const unhosted = await dispatchAutomationStudioLifecycleEvent(dispatchInput(flow, { invocation }, { event: "retry", arrival: 2 }));
    expect(unhosted).toEqual({ kind: "none", observations: 0, runs: [] });
  });

  it("runs the node-scoped handler before the subflow-scoped one, and says why", async () => {
    const host = fakeHost({ popup: "true", cleared: "true" });
    const flow = flowWith("graph.levels", [
      handler("h.subflow", { event: "retry", scope: { kind: "subflow" }, when: [fact("popup")], completionCheck: [fact("cleared")], order: -5 }, { disposition: "resume" }),
      handler("h.node", { ...retryAtPress, when: [fact("popup")], completionCheck: [fact("cleared")], order: 9 }, { disposition: "resume" })
    ]);
    const outcome = await dispatchAutomationStudioLifecycleEvent(dispatchInput(flow, { invocation: framed(flow), hostRuntime: host.runtime }, { event: "retry" }));
    const [run] = outcome.runs;
    expect(run?.handlerId).toBe("graph.levels/h.node");
    expect(run?.level).toBe("node");
    expect(run?.selection).toContain("ran at node scope");
    expect(run?.selection).toContain("node scope is tried before subflow");
    expect(run?.selection).toContain("Not reached: graph.levels/h.subflow (subflow scope)");
    expect(outcome.runs).toHaveLength(1);
  });

  it("never runs a handler stored in a graph no active frame runs", async () => {
    const host = fakeHost({ popup: "true", cleared: "true" });
    const flow = flowWith("graph.active", []);
    const elsewhere = flowWith("graph.elsewhere", [handler("h.far", { event: "retry", scope: { kind: "subflow" }, when: [fact("popup")], completionCheck: [fact("cleared")] }, { disposition: "resume" })]);
    const invocation = framed(flow);
    // The other graph is in the run's registry, as a frame that ended would leave it.
    automationStudioRegisterLifecycleGraph(invocation.run.lifecycle, { subflowId: "other", graph: elsewhere, graphRevision: 1 });
    const outcome = await dispatchAutomationStudioLifecycleEvent(dispatchInput(flow, { invocation, hostRuntime: host.runtime }, { event: "retry" }));
    expect(outcome).toEqual({ kind: "none", observations: 0, runs: [] });
    expect(host.batches).toEqual([]);
  });

  it("decides resume, route, resolve and unhandled", async () => {
    const host = fakeHost({ popup: "true", cleared: "true", "at-cart": "true" });
    const checkpointed = (flowId: string, parts: Parameters<typeof flowWith>[1]) => {
      const flow = flowWith(flowId, parts);
      flow.nodes.find((node) => node.id === "start")!.metadata = { "fluxiq.checkpoint": { id: "cart", when: [fact("at-cart")] } };
      return flow;
    };
    const decided = async (event: "before" | "retry" | "fail" | "before_next", end: Record<string, string | Record<string, string>>, extra: Record<string, unknown> = {}) => {
      const flow = checkpointed(`graph.${event}.${String(end.disposition)}`, [handler("h", { event, scope: { kind: "nodes", nodeIds: ["press"] }, when: [fact("popup")], completionCheck: [fact("cleared")] }, end)]);
      return await dispatchAutomationStudioLifecycleEvent(dispatchInput(flow, { invocation: framed(flow), hostRuntime: host.runtime }, { event, ...extra }));
    };

    expect(await decided("retry", { disposition: "resume" })).toMatchObject({ kind: "handled", decision: { kind: "resume" } });

    const guard = () => ({ passesUncertainAct: false });
    const routed = await decided("before_next", { disposition: "route", checkpointId: "cart" }, { routeGuard: guard });
    expect(routed).toMatchObject({ kind: "handled", decision: { kind: "route", checkpointId: "cart" }, routeTarget: { checkpointId: "cart", invocationId: "invocation-1", nodeId: "start" } });
    expect(routed.runs[0]?.recovery.targetId).toBe("cart");
    // Without graph-run's guard a route is never taken.
    const unguarded = await decided("before_next", { disposition: "route", checkpointId: "cart" });
    expect(unguarded.runs[0]?.decision).toMatchObject({ kind: "unhandled", reason: expect.stringContaining("could not check what the route would pass"), code: "route_refused", guard: "unguarded" });
    // The attempt's stored record keeps where the unhandled came from (t411): the guard that refused the route.
    expect(unguarded.runs[0]?.lifecycle?.disposition).toEqual({ kind: "unhandled", reason: "route_refused", guard: "unguarded" });
    const uncertain = await decided("before_next", { disposition: "route", checkpointId: "cart" }, { routeGuard: () => ({ passesUncertainAct: true }) });
    expect(uncertain.runs[0]?.lifecycle?.disposition).toEqual({ kind: "unhandled", reason: "route_refused", guard: "passes_uncertain_act" });
    const unreachable = await decided("before_next", { disposition: "route", checkpointId: "cart" }, { routeGuard: () => ({ passesUncertainAct: false, unreachable: "Node start is not in the graph this frame runs." }) });
    expect(unreachable.runs[0]?.decision).toMatchObject({ code: "route_refused", guard: "unreachable", reason: "Node start is not in the graph this frame runs." });

    const resolved = await decided("fail", { disposition: "resolve", outputs: { total: "12" } }, { requiredOutputIds: ["total"], incidentId: "incident-x" });
    expect(resolved).toMatchObject({ kind: "handled", decision: { kind: "resolve", outputs: { total: "12" } } });
    expect(resolved.runs[0]?.lifecycle?.disposition).toEqual({ kind: "resolve" });

    const unhandled = await decided("fail", { disposition: "unhandled" });
    expect(unhandled).toMatchObject({ kind: "handled", decision: { kind: "unhandled", reason: "The handler ended unhandled.", code: "written_unhandled" } });
    expect(unhandled.runs[0]?.lifecycle?.disposition).toEqual({ kind: "unhandled", reason: "written_unhandled" });
    // The runtime stream's record names the disposition alone, as its model type does.
    expect(unhandled.runs[0]?.execution.disposition).toEqual({ kind: "unhandled" });
    expect(unhandled.runs[0]?.recovery.outcome).toBe("failed");
    expect(unhandled.runs[0]?.execution.outcome).toBe("succeeded");
  });

  it("makes a completion check that does not hold unhandled, whatever the body wrote", async () => {
    const host = fakeHost({ popup: "true", cleared: "false" });
    const flow = flowWith("graph.check", [handler("h", { ...retryAtPress, when: [fact("popup")], completionCheck: [fact("cleared")] }, { disposition: "resume" })]);
    const outcome = await dispatchAutomationStudioLifecycleEvent(dispatchInput(flow, { invocation: framed(flow), hostRuntime: host.runtime }, { event: "retry" }));
    expect(outcome).toMatchObject({ kind: "handled", decision: { kind: "unhandled", reason: "The handler's completion check is false, not true." } });
    expect(outcome.runs[0]?.lifecycle).toMatchObject({ completionCheck: "false", disposition: { kind: "unhandled", reason: "completion_check_not_true" } });
  });

  it("never runs the same occurrence twice", async () => {
    const host = fakeHost({ popup: "true", cleared: "false" });
    const flow = flowWith("graph.once", [handler("h", { ...retryAtPress, when: [fact("popup")], completionCheck: [fact("cleared")] }, { disposition: "resume" })]);
    const invocation = framed(flow);
    const input = dispatchInput(flow, { invocation, hostRuntime: host.runtime }, { event: "retry", attemptNumber: 2 });
    const first = await dispatchAutomationStudioLifecycleEvent(input);
    const second = await dispatchAutomationStudioLifecycleEvent({ ...input, attemptNumber: 3 });

    expect(first.runs[0]?.execution.outcome).toBe("succeeded");
    expect(second.runs[0]?.occurrence).toBe(first.runs[0]?.occurrence);
    expect(second.runs[0]?.execution.outcome).toBe("refused");
    expect(second.runs[0]?.recovery.outcome).toBe("refused");
    expect(second.runs[0]?.decision).toMatchObject({ kind: "unhandled", reason: expect.stringContaining("already run for this occurrence") });
    expect(second.runs[0]?.bodySteps).toBe(0);
    // The same interruption at a later arrival is a new occurrence.
    const later = await dispatchAutomationStudioLifecycleEvent({ ...input, arrival: 2 });
    expect(later.runs[0]?.execution.outcome).toBe("succeeded");
  });

  it("shares one budget across frames", async () => {
    const host = fakeHost({ popup: "true", cleared: "true" });
    const parentFlow = flowWith("graph.parent", [handler("h.parent", { event: "retry", scope: { kind: "subflow", inherit: true }, when: [fact("popup")], completionCheck: [fact("cleared")] }, { disposition: "resume" })]);
    const childFlow = graph("graph.child", mainPath().nodes, mainPath().edges);
    const invocation = framed(parentFlow);
    invocation.run.lifecycle.budget = { maxHandlerRunsPerIncident: 3, maxHandlerRunsPerRun: 1, maxRoutesPerRun: 2, maxAlternativesPerIncident: 2 };

    const inParent = await dispatchAutomationStudioLifecycleEvent(dispatchInput(parentFlow, { invocation, hostRuntime: host.runtime }, { event: "retry" }));
    expect(inParent.runs[0]?.execution.outcome).toBe("succeeded");

    // invocation-2 was the parent's handler frame; the child is invocation-3.
    const child = automationStudioChildInvocation(invocation, { callNodeId: "press", subflowId: "child", graph: childFlow, graphRevision: 1, inputs: {} })!;
    invocation.run.stack.push(child.frame);
    const inChild = await dispatchAutomationStudioLifecycleEvent(dispatchInput(childFlow, { invocation: child, hostRuntime: host.runtime }, { event: "retry", graph: { subflowId: "child", graph: childFlow, graphRevision: 1 } }));
    expect(inChild.runs[0]).toMatchObject({ handlerId: "graph.parent/h.parent", level: "ancestor", execution: { outcome: "refused", framePath: ["invocation-1", "invocation-3"] } });
    expect(inChild.runs[0]?.decision).toMatchObject({ reason: "The run has used its 1 handler runs." });
    expect(child.run.lifecycle).toBe(invocation.run.lifecycle);
    expect(invocation.run.lifecycle.ledger.handlerRunsForRun).toBe(1);
  });

  it("hands an authored path back to graph-run, after a nearer handler that did not apply", async () => {
    const host = fakeHost({ popup: "false" });
    const flow = flowWith("graph.authored", [
      handler("h", { event: "fail", scope: { kind: "nodes", nodeIds: ["press"] }, when: [fact("popup")] }, { disposition: "unhandled" }),
      { nodes: [{ id: "fallback", definitionId: "builtin.control.end" }], edges: [edge("press", "fallback", "failed")] }
    ]);
    const outcome = await dispatchAutomationStudioLifecycleEvent(dispatchInput(flow, { invocation: framed(flow), hostRuntime: host.runtime }, { event: "fail" }));
    expect(outcome).toMatchObject({ kind: "authored", source: { kind: "failed_edge", nodeId: "press", targetNodeId: "fallback" }, level: "node", observations: 1, runs: [] });
  });

  it("runs On Before handlers one at a time, re-observing between them", async () => {
    const host = fakeHost({ cookies: "true", newsletter: "true", clear: "true" });
    const flow = flowWith("graph.before", [
      handler("h.cookies", { event: "before", scope: { kind: "nodes", nodeIds: ["press"] }, when: [fact("cookies")], completionCheck: [fact("clear")], order: 1 }, { disposition: "resume" }),
      handler("h.newsletter", { event: "before", scope: { kind: "nodes", nodeIds: ["press"] }, when: [fact("newsletter")], completionCheck: [fact("clear")], order: 2 }, { disposition: "resume" })
    ]);
    const outcome = await dispatchAutomationStudioLifecycleEvent(dispatchInput(flow, { invocation: framed(flow), hostRuntime: host.runtime }, { event: "before" }));
    expect(outcome).toMatchObject({ kind: "handled", decision: { kind: "resume" } });
    expect(outcome.runs.map((run) => run.handlerId)).toEqual(["graph.before/h.cookies", "graph.before/h.newsletter"]);
    // Whens, completion, the remaining when re-observed, completion.
    expect(host.batches.map((batch) => batch.conditions.map((condition) => condition.fact))).toEqual([["cookies", "newsletter"], ["clear"], ["newsletter"], ["clear"]]);
    expect(outcome.observations).toBe(4);
  });

  it("offers the recovery Subflow's automation-scope handlers, loading it once per run", async () => {
    const host = fakeHost({ popup: "true", cleared: "true" });
    const flow = flowWith("graph.main", []);
    const part = handler("h.any", { event: "retry", scope: { kind: "automation" }, when: [fact("popup")], completionCheck: [fact("cleared")] }, { disposition: "resume" });
    const recovery = graph("graph.recovery", part.nodes, part.edges);
    let loads = 0;
    const subflowGraphs = {
      load: async () => undefined,
      recovery: async () => {
        loads += 1;
        return { subflowId: "recovery", graph: recovery, graphRevision: 4 };
      }
    };
    const invocation = framed(flow);
    const first = await dispatchAutomationStudioLifecycleEvent(dispatchInput(flow, { invocation, hostRuntime: host.runtime, subflowGraphs }, { event: "retry" }));
    await dispatchAutomationStudioLifecycleEvent(dispatchInput(flow, { invocation, hostRuntime: host.runtime, subflowGraphs }, { event: "retry", arrival: 2 }));
    expect(first.runs[0]).toMatchObject({ handlerId: "graph.recovery/h.any", level: "automation", decision: { kind: "resume" } });
    expect(first.runs[0]?.bodyTrace?.attempts.map((attempt) => attempt.nodeId)).toEqual(["h.any.step", "h.any.end"]);
    expect(loads).toBe(1);
  });
});
