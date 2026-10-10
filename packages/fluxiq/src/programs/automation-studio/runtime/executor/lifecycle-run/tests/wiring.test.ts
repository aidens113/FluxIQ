// Lifecycle handlers wired into the graph run (state-aware recovery plan, C3,
// C5, C6 steps 1-7, C7): real graph runs against a fake page, with the host's
// facts and presses scripted, and no model anywhere.

import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { automationStudioRootInvocation } from "../../frames/index.ts";
import { runAutomationStudioGraph } from "../../graph-run.ts";
import type { AutomationStudioGraphExecutionTrace } from "../../contracts.ts";
import { closer, fact, landedCounts, line, page, pageOptions, press } from "./wiring-fixtures.ts";

const onBefore = (scope: JsonObject, extra: JsonObject = {}): JsonObject => ({ event: "before", scope, when: [fact("popup")], completionCheck: [fact("cleared")], ...extra });

describe("lifecycle handlers in a graph run", () => {
  it("clears a popup met before step 1 and again midway with On Before, and no act repeats", async () => {
    const current = page({ popup: true, popupAfter: ["s2"] });
    const flow = line("graph.main", [press("s1"), press("s2"), press("s3")], [closer("h.popup", onBefore({ kind: "nodes", nodeIds: ["s1", "s2", "s3"] }), { disposition: "resume" }, "Close the popup")]);
    const trace = await runAutomationStudioGraph(flow, pageOptions(current));

    expect(trace.status).toBe("succeeded");
    expect(landedCounts(current)).toEqual({ dismiss: 2, s1: 1, s2: 1, s3: 1 });
    // Nothing was pressed and refused: the handler ran before each attempt the popup would have spoiled.
    expect(current.presses).toEqual(["dismiss", "s1", "s2", "dismiss", "s3"]);
    const s1 = trace.attempts.find((attempt) => attempt.nodeId === "s1")!;
    expect(s1.lifecycle).toMatchObject({ event: "before", handlerId: "graph.main/h.popup", disposition: { kind: "resume" }, completionCheck: "true" });
    expect(trace.attempts.find((attempt) => attempt.nodeId === "s3")?.lifecycle?.handlerId).toBe("graph.main/h.popup");
    // The bodies' attempts sit where they ran, in a handler frame below the run's own.
    expect(trace.attempts.map((attempt) => attempt.nodeId)).toEqual(["start", "h.popup.close", "h.popup.end", "s1", "s2", "h.popup.close", "h.popup.end", "s3", "done"]);
    const framePaths = new Set(trace.attempts.map((attempt) => JSON.stringify(attempt.framePath)));
    expect(framePaths.size).toBe(3);
    expect(new Set(trace.attempts.map((attempt) => attempt.attemptId)).size).toBe(trace.attempts.length);
    expect(trace.handlerExecutions?.map((record) => [record.event, record.nodeId, record.outcome, record.disposition.kind])).toEqual([
      ["before", "s1", "succeeded", "resume"],
      ["before", "s3", "succeeded", "resume"]
    ]);
  });

  it("clears a popup that spoils an attempt with On Retry before state routing, then attempts the step again", async () => {
    const current = page({ popupAfter: ["s1"] });
    const flow = line("graph.main", [press("s1"), press("s2")], [closer("h.retry", { event: "retry", scope: { kind: "nodes", nodeIds: ["s2"] }, when: [fact("popup")], completionCheck: [fact("cleared")] })]);
    const trace = await runAutomationStudioGraph(flow, pageOptions(current));

    expect(trace.status).toBe("succeeded");
    expect(landedCounts(current)).toEqual({ s1: 1, dismiss: 1, s2: 1 });
    const s2 = trace.attempts.filter((attempt) => attempt.nodeId === "s2");
    expect(s2.map((attempt) => attempt.status)).toEqual(["failed", "succeeded"]);
    expect(s2[0]).toMatchObject({ failureClass: "retry", lifecycle: { event: "retry", handlerId: "graph.main/h.retry", disposition: { kind: "resume" } } });
    expect(s2[1]?.retry).toMatchObject({ attemptNumber: 2, previousAttemptId: s2[0]!.attemptId });
    // State routing never ran: the handler took the run on first.
    expect(s2[0]?.stateRouting).toBeUndefined();
  });

  it("dispatches On Retry after the ladder permits a retry of a step that ran and failed", async () => {
    const current = page({ popupAfter: ["s1"] });
    // s2 refuses while the popup is up, retryably, without acting.
    const flow = line("graph.main", [press("s1"), press("s2")], [closer("h.retry", { event: "retry", scope: { kind: "subflow" }, when: [fact("popup")], completionCheck: [fact("cleared")] })]);
    const options = pageOptions(current);
    const dispatch = options.effectDispatcher!;
    let spoiled = 0;
    options.effectDispatcher = (effect, context) => {
      const pressed = JSON.stringify(effect.payload ?? null).includes('"elementId":"s2"');
      if (pressed && current.popup && spoiled < 1) {
        spoiled += 1;
        current.presses.push("s2");
        return { status: "failed", route: "failed", message: "Covered.", failure: { category: "unexpected_state", code: "web.target.covered", retryable: true, stage: "execution", effect: "unacted" } };
      }
      return dispatch(effect, context);
    };
    const trace = await runAutomationStudioGraph(flow, options);

    expect(trace.status).toBe("succeeded");
    expect(landedCounts(current)).toEqual({ s1: 1, dismiss: 1, s2: 1 });
    const s2 = trace.attempts.filter((attempt) => attempt.nodeId === "s2");
    expect(s2[0]).toMatchObject({ status: "failed", failureClass: "retry", lifecycle: { event: "retry", disposition: { kind: "resume" } } });
    expect(s2[1]).toMatchObject({ status: "succeeded", retry: { rung: "retry_node" } });
  });

  it("ends honestly, without a loop, when the handler cannot remove the popup", async () => {
    const current = page({ popup: true, dismissWorks: false });
    // The author said a failure of s1 stops the run, so it is not walked past.
    const flow = line("graph.main", [press("s1", "s1", { onFailure: "stop" }), press("s2")], [
      closer("h.before", onBefore({ kind: "nodes", nodeIds: ["s1"] })),
      closer("h.retry", { event: "retry", scope: { kind: "nodes", nodeIds: ["s1"] }, when: [fact("popup")], completionCheck: [fact("cleared")] })
    ]);
    const invocation = automationStudioRootInvocation(flow, { currentSubflowId: "main" }, (target, options, onExecuted) => runAutomationStudioGraph(target.graph, options, onExecuted));
    const trace = await runAutomationStudioGraph(flow, pageOptions(current, { invocation }));

    expect(trace.status).toBe("failed");
    expect(trace.message).toBeTruthy();
    expect(current.landed.filter((id) => id !== "dismiss")).toEqual([]);
    // Each handler ran once for this arrival; every later boundary refused the same occurrence.
    expect(trace.handlerExecutions?.filter((record) => record.outcome !== "refused").map((record) => record.handlerId)).toEqual(["graph.main/h.before", "graph.main/h.retry"]);
    expect(current.presses.filter((id) => id === "dismiss")).toHaveLength(2);
    const s1 = trace.attempts.filter((attempt) => attempt.nodeId === "s1");
    expect(s1).toHaveLength(4);
    expect(s1.at(-1)?.failureClass).toBe("true_failure");
    expect(s1.slice(0, -1).every((attempt) => attempt.failureClass === "retry")).toBe(true);
    expect([...invocation.run.lifecycle.incidents.values()].map((incident) => incident.trueFailure)).toEqual([true]);
  });

  it("runs the node-scoped handler before subflow and automation scope, and the trace says why", async () => {
    // The popup appears after s0, so all three handlers apply at s1 and nowhere before it.
    const current = page({ popupAfter: ["s0"] });
    const flow = line("graph.main", [press("s0"), press("s1")], [
      closer("h.subflow", onBefore({ kind: "subflow" }, { order: -5 })),
      closer("h.node", onBefore({ kind: "nodes", nodeIds: ["s1"] }, { order: 9 }))
    ]);
    const automation = closer("h.everywhere", onBefore({ kind: "automation" }, { order: -9 }));
    const recovery = line("graph.recovery", [], [automation]);
    const subflowGraphs = { load: async () => undefined, recovery: async () => ({ subflowId: "recovery", graph: recovery, graphRevision: 1 }) };
    const trace = await runAutomationStudioGraph(flow, pageOptions(current, { subflowGraphs }));

    expect(trace.status).toBe("succeeded");
    const lifecycle = trace.attempts.find((attempt) => attempt.nodeId === "s1")?.lifecycle;
    expect(lifecycle?.handlerId).toBe("graph.main/h.node");
    expect(lifecycle?.selection).toContain("ran at node scope");
    expect(lifecycle?.selection).toContain("node scope is tried before subflow, ancestor and automation scope");
    expect(lifecycle?.selection).toContain("graph.main/h.subflow (subflow scope)");
    expect(lifecycle?.selection).toContain("graph.recovery/h.everywhere (automation scope)");
    expect(trace.handlerExecutions?.map((record) => record.handlerId)).toEqual(["graph.main/h.node"]);
  });

  it("never runs a handler stored in a graph no frame runs", async () => {
    // The popup appears as the child's last step lands. The child's On Retry handler would clear it for
    // s2, but the child's frame has ended by then; the other Subflow's handler is in a graph never run.
    const current = page({ popupAfter: ["c1"] });
    const onRetry = { event: "retry", scope: { kind: "subflow" }, when: [fact("popup")], completionCheck: [fact("cleared")] };
    const child = line("graph.child", [press("c1")], [closer("h.child", onRetry)]);
    const other = line("graph.other", [press("o1")], [closer("h.other", onRetry)]);
    const flow = line("graph.main", [press("s1"), { id: "call", definitionId: "builtin.control.call-subflow", parameterValues: { subflowId: "child" } }, press("s2")]);
    const graphs: Record<string, { subflowId: string; graph: typeof child; graphRevision: number }> = {
      child: { subflowId: "child", graph: child, graphRevision: 1 },
      other: { subflowId: "other", graph: other, graphRevision: 1 }
    };
    const subflowGraphs = { load: async (subflowId: string) => graphs[subflowId] };
    const trace = await runAutomationStudioGraph(flow, pageOptions(current, { subflowGraphs }));

    expect(current.presses).not.toContain("dismiss");
    expect(current.landed).toEqual(["s1", "c1"]);
    expect(trace.handlerExecutions).toBeUndefined();
    // Nothing applied, so s2 used its four attempts and the Flow walked past it, as it always has.
    expect(current.presses.filter((id) => id === "s2")).toHaveLength(4);
  });

  it("takes the success edge with an On Fail handler's resolved outputs", async () => {
    const current = page({ failing: { s2: { retryable: false } } });
    const resolve = { disposition: "resolve", outputs: { ok: "resolved" } };
    const flow = line("graph.main", [press("s1"), press("s2"), press("s3")], [closer("h.fail", { event: "fail", scope: { kind: "nodes", nodeIds: ["s2"] }, when: [fact("cleared")] }, resolve)]);
    let executed: AutomationStudioGraphExecutionTrace | undefined;
    const trace = await runAutomationStudioGraph(flow, pageOptions(current), (run) => { executed = run; });

    expect(trace.status).toBe("succeeded");
    expect(landedCounts(current)).toEqual({ s1: 1, dismiss: 1, s3: 1 });
    const s2 = trace.attempts.find((attempt) => attempt.nodeId === "s2")!;
    expect(s2).toMatchObject({ status: "failed", failureClass: "planned_fail", outputs: { ok: "resolved" }, lifecycle: { event: "fail", disposition: { kind: "resolve" } } });
    expect(executed?.values["s2.ok"]).toBe("resolved");
    expect(trace.attempts.map((attempt) => attempt.nodeId).slice(-2)).toEqual(["s3", "done"]);
  });
});
