// The graph-run wiring at its edges (state-aware recovery plan, C3, C5-C7): a
// Flow with no Handlers is untouched, retries and planned fails never reach
// repair, a child's unresolved failure crosses its Call Subflow boundary as
// the same incident, and routes, starts and stops come out as C5 says.

import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowNode } from "../../../../model/index.ts";
import type { AutomationStudioGraphExecutionTrace } from "../../contracts.ts";
import { automationStudioRootInvocation } from "../../frames/index.ts";
import { runAutomationStudioGraph } from "../../graph-run.ts";
import { edge } from "./lifecycle-fixtures.ts";
import { closer, fact, line, page, pageOptions, press, type Page } from "./wiring-fixtures.ts";

const stop = { onFailure: "stop" };

function framedRun(flow: Parameters<typeof runAutomationStudioGraph>[0]) {
  return automationStudioRootInvocation(flow, { currentSubflowId: "main" }, (target, options, onExecuted) => runAutomationStudioGraph(target.graph, options, onExecuted));
}

/** s1 fails once, retryably; s2 always fails and takes its authored failed edge to `fallback`. */
function retryAndPlannedFail(current: Page, handlers: boolean) {
  const steps = [press("s1"), press("s2")];
  const parts = [{ nodes: [press("fallback"), { id: "fallback.end", definitionId: "builtin.control.end" }], edges: [edge("s2", "fallback", "failed"), edge("fallback", "fallback.end")] }];
  // A Handler that never applies, so the run has Handlers in scope and is classified.
  if (handlers) parts.push(closer("h.never", { event: "before", scope: { kind: "subflow" }, when: [fact("nothing-known")], completionCheck: [fact("cleared")] }));
  const options = pageOptions(current);
  const dispatch = options.effectDispatcher!;
  let s1Failures = 0;
  options.effectDispatcher = (effect, context) => {
    const id = /"elementId":"([^"]+)"/u.exec(JSON.stringify(effect.payload ?? null))?.[1];
    if (id === "s1" && s1Failures < 1) {
      s1Failures += 1;
      return { status: "failed", route: "failed", message: "Busy.", failure: { category: "unexpected_state", code: "web.page.busy", retryable: true, stage: "execution", effect: "unacted" } };
    }
    return dispatch(effect, context);
  };
  return { flow: line("graph.main", steps, parts), options };
}

describe("lifecycle wiring at its edges", () => {
  it("leaves a Flow with no Handlers untouched: no fact call, and the same trace with or without the machinery's inputs", async () => {
    const withFacts = page({ failing: { s2: { retryable: false } } });
    const plain = page({ failing: { s2: { retryable: false } } });
    const a = retryAndPlannedFail(withFacts, false);
    const b = retryAndPlannedFail(plain, false);
    let recoveryLoads = 0;
    const subflowGraphs = {
      load: async () => undefined,
      recovery: async () => {
        recoveryLoads += 1;
        return undefined;
      }
    };
    const traced = await runAutomationStudioGraph(a.flow, { ...a.options, subflowGraphs });
    // The same host declarations, but no fact evaluator and no Subflows to read handlers from.
    const bare = await runAutomationStudioGraph(b.flow, { ...b.options, hostRuntime: { capabilities: ["fact-evaluation"] } });

    expect(withFacts.factBatches).toEqual([]);
    expect(recoveryLoads).toBe(1);
    expect(traced).toEqual(bare);
    expect(traced.status).toBe("succeeded");
    // Nothing state-aware recovery adds reaches a trace of a Flow without Handlers.
    expect(JSON.stringify(traced)).not.toMatch(/"(lifecycle|failureClass|handlerExecutions|lifecycleNotes)"/u);
    expect(withFacts.presses).toEqual(plain.presses);
  });

  it("classifies retries and planned fails, and never marks a true failure, the only trigger for repair", async () => {
    const current = page({ failing: { s2: { retryable: false } } });
    const { flow, options } = retryAndPlannedFail(current, true);
    const invocation = framedRun(flow);
    const trace = await runAutomationStudioGraph(flow, { ...options, invocation });

    expect(trace.status).toBe("succeeded");
    expect(trace.attempts.filter((attempt) => attempt.status === "failed").map((attempt) => [attempt.nodeId, attempt.failureClass])).toEqual([
      ["s1", "retry"],
      ["s2", "planned_fail"]
    ]);
    expect([...invocation.run.lifecycle.incidents.values()].some((incident) => incident.trueFailure)).toBe(false);
    expect(trace.attempts.some((attempt) => attempt.recoveryDecision?.selected?.kind === "llm_diagnosis")).toBe(false);
    expect(trace.handlerExecutions).toBeUndefined();
  });

  it("carries a child's unresolved failure to its Call Subflow node as the same incident, and does not re-run a handler already tried", async () => {
    const current = page({ failing: { c1: { retryable: false } } });
    const child = line("graph.child", [press("c1", "c1", stop)]);
    const recovery = line("graph.recovery", [], [closer("h.any", { event: "fail", scope: { kind: "automation" }, when: [fact("cleared")] }, { disposition: "unhandled" })]);
    const call: AutomationStudioFlowNode = { id: "call", definitionId: "builtin.control.call-subflow", parameterValues: { subflowId: "child" }, metadata: stop };
    const flow = line("graph.main", [call]);
    const subflowGraphs = {
      load: async (subflowId: string) => (subflowId === "child" ? { subflowId: "child", graph: child, graphRevision: 1 } : undefined),
      recovery: async () => ({ subflowId: "recovery", graph: recovery, graphRevision: 1 })
    };
    const invocation = framedRun(flow);
    const trace = await runAutomationStudioGraph(flow, pageOptions(current, { subflowGraphs, invocation }));

    expect(trace.status).toBe("failed");
    const records = trace.handlerExecutions ?? [];
    expect(records.map((record) => [record.handlerId, record.nodeId, record.outcome])).toEqual([
      ["graph.recovery/h.any", "c1", "succeeded"],
      ["graph.recovery/h.any", "call", "refused"]
    ]);
    expect(records[0]?.incidentId).toBeDefined();
    expect(records[1]?.incidentId).toBe(records[0]?.incidentId);
    expect(current.presses.filter((id) => id === "dismiss")).toHaveLength(1);
    const incident = invocation.run.lifecycle.incidents.get(records[0]!.incidentId!)!;
    expect(incident.trueFailure).toBe(true);
    expect(incident.origin.nodeId).toBe("c1");
    expect(trace.attempts.find((attempt) => attempt.nodeId === "call")?.failureClass).toBe("true_failure");
  });

  it("routes to a checkpoint in the same frame, and to one in a calling frame", async () => {
    // Same frame: s2 fails; its On Fail handler routes to s3's checkpoint, past s2.
    const sameFrame = page({ failing: { s2: { retryable: false } } });
    const s3: AutomationStudioFlowNode = { ...press("s3"), metadata: { "fluxiq.checkpoint": { id: "cp.s3", requires: [] } } };
    const routed = line("graph.main", [press("s1"), press("s2", "s2", stop), s3], [closer("h.route", { event: "fail", scope: { kind: "nodes", nodeIds: ["s2"] }, when: [fact("cleared")] }, { disposition: "route", checkpointId: "cp.s3" })]);
    const invocation = framedRun(routed);
    const trace = await runAutomationStudioGraph(routed, pageOptions(sameFrame, { invocation }));
    expect(trace.status).toBe("succeeded");
    expect(sameFrame.landed).toEqual(["s1", "dismiss", "s3"]);
    expect(trace.attempts.find((attempt) => attempt.nodeId === "s2")).toMatchObject({ failureClass: "planned_fail", lifecycle: { disposition: { kind: "route", checkpointId: "cp.s3" } } });
    expect([...invocation.run.lifecycle.incidents.values()][0]?.routes).toEqual([{ checkpointId: "cp.s3", handlerId: "graph.main/h.route" }]);

    // A calling frame's checkpoint (unit D2): the child unwinds and the parent continues there.
    const outward = page({ failing: { c1: { retryable: false } } });
    const child = line("graph.child", [press("c1", "c1", stop)], [closer("h.out", { event: "fail", scope: { kind: "subflow" }, when: [fact("cleared")] }, { disposition: "route", checkpointId: "cp.parent" })]);
    const after: AutomationStudioFlowNode = { ...press("after"), metadata: { "fluxiq.checkpoint": { id: "cp.parent", requires: [] } } };
    const parent = line("graph.parent", [{ id: "call", definitionId: "builtin.control.call-subflow", parameterValues: { subflowId: "child" }, metadata: stop }, after]);
    const subflowGraphs = { load: async () => ({ subflowId: "child", graph: child, graphRevision: 1 }) };
    const out: AutomationStudioGraphExecutionTrace = await runAutomationStudioGraph(parent, pageOptions(outward, { subflowGraphs }));
    expect(out.status).toBe("succeeded");
    expect(outward.landed).toContain("after");
    expect(out.lifecycleNotes).toBeUndefined();
    expect(out.handlerExecutions?.[0]?.disposition).toEqual({ kind: "route", checkpointId: "cp.parent" });
  });

  it("fires On Start once for a new frame, and never for a run told where to start", async () => {
    const current = page({ popup: true });
    const flow = line("graph.main", [press("s1")], [closer("h.start", { event: "start", scope: { kind: "subflow" }, when: [fact("popup")], completionCheck: [fact("cleared")] })]);
    const trace = await runAutomationStudioGraph(flow, pageOptions(current));
    expect(trace.status).toBe("succeeded");
    expect(trace.handlerExecutions?.map((record) => [record.event, record.nodeId, record.outcome])).toEqual([["start", "start", "succeeded"]]);
    expect(trace.attempts.find((attempt) => attempt.nodeId === "start")?.lifecycle?.event).toBe("start");

    const resumed = page({ popup: true });
    const partial = await runAutomationStudioGraph(flow, pageOptions(resumed, { startNodeId: "s1" }));
    expect(partial.handlerExecutions).toBeUndefined();
    expect(resumed.presses).not.toContain("dismiss");
  });

  it("ends a run cancelled when a handler's body is cancelled", async () => {
    const current = page({ popup: true });
    const controller = new AbortController();
    const flow = line("graph.main", [press("s1")], [closer("h.before", { event: "before", scope: { kind: "nodes", nodeIds: ["s1"] }, when: [fact("popup")], completionCheck: [fact("cleared")] })]);
    const options = pageOptions(current, { signal: controller.signal });
    const dispatch = options.effectDispatcher!;
    options.effectDispatcher = (effect, context) => {
      if (JSON.stringify(effect.payload ?? null).includes('"elementId":"dismiss"')) controller.abort();
      return dispatch(effect, context);
    };
    const trace = await runAutomationStudioGraph(flow, options);
    expect(trace.status).toBe("cancelled");
    expect(current.landed).not.toContain("s1");
  });
});
