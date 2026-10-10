// Routes to checkpoints (state-aware recovery plan, C2, C5; unit D2): a route
// never repeats a confirmation, one the checkpoint's facts or the path refuse
// is refused before any route is charged or any row says it worked, and a
// route to a calling frame's checkpoint unwinds the child and continues there.

import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowNode } from "../../../../model/index.ts";
import { checkpoint, factHost, failingFirst, framedRun, lasting, recoveryRows, withRows } from "./recovery-paths-fixtures.ts";
import { closer, fact, landedCounts, line, page, pageOptions, press } from "./wiring-fixtures.ts";

const stop = { onFailure: "stop" };

/** start -> s1 (cp.start) -> confirm (lasting) -> cp (cp.after-confirm) -> s3 -> done, with s3's On Fail handler routing to `target`. */
function confirmFlow(target: string, cpWhen: string[] = []) {
  const s3 = press("s3", "s3", stop);
  const route = closer("h.back", { event: "fail", scope: { kind: "nodes", nodeIds: ["s3"] }, when: [fact("cleared")] }, { disposition: "route", checkpointId: target }, "Go back");
  return line("graph.main", [checkpoint("s1", "cp.start"), lasting("confirm"), checkpoint("cp", "cp.after-confirm", cpWhen.map(fact)), s3], [route]);
}

describe("routes to a checkpoint", () => {
  it("does not repeat a confirmation: the route goes back only as far as the checkpoint after it", async () => {
    const current = page();
    const options = pageOptions(current);
    failingFirst(options, "s3", 1);
    const { trace, invocation } = await framedRun(confirmFlow("cp.after-confirm"), options);

    expect(trace.status).toBe("succeeded");
    expect(current.landed).toEqual(["s1", "confirm", "cp", "dismiss", "cp", "s3"]);
    expect(landedCounts(current).confirm).toBe(1);
    expect(invocation.run.lifecycle.ledger.routesForRun).toBe(1);
    expect(trace.incidents?.map((incident) => [incident.origin.nodeId, incident.ending, incident.routes])).toEqual([["s3", "planned_fail", [{ checkpointId: "cp.after-confirm", handlerId: "graph.main/h.back" }]]]);
  });

  it("refuses a route back across the completed confirm act, and one whose checkpoint does not hold, before charging or saying it worked", async () => {
    const across = page({ failing: { s3: { retryable: false } } });
    const { result, rows } = await withRows(() => framedRun(confirmFlow("cp.start"), pageOptions(across)));
    expect(result.trace.status).toBe("failed");
    expect(landedCounts(across).confirm).toBe(1);
    expect(across.landed).toEqual(["s1", "confirm", "cp", "dismiss"]);
    expect(result.invocation.run.lifecycle.ledger.routesForRun).toBe(0);
    expect(result.trace.handlerExecutions?.map((record) => [record.outcome, record.disposition])).toEqual([["succeeded", { kind: "unhandled" }]]);
    expect(recoveryRows(rows)).toEqual([["handler", "failed", undefined]]);
    expect(result.trace.attempts.find((attempt) => attempt.nodeId === "s3")?.failureClass).toBe("true_failure");

    // The checkpoint after the confirmation, but its facts do not hold.
    const unheld = page({ failing: { s3: { retryable: false } } });
    const held = await withRows(() => framedRun(confirmFlow("cp.after-confirm", ["at-checkout"]), pageOptions(unheld, { hostRuntime: factHost(unheld, () => "false") })));
    expect(held.result.trace.status).toBe("failed");
    expect(unheld.landed).toEqual(["s1", "confirm", "cp", "dismiss"]);
    expect(held.result.invocation.run.lifecycle.ledger.routesForRun).toBe(0);
    expect(recoveryRows(held.rows)).toEqual([["handler", "failed", undefined]]);
  });

  it("unwinds the child and continues at the calling frame's checkpoint, charging the route once", async () => {
    const current = page();
    const child = line("graph.child", [press("c1"), press("c2", "c2", stop)], [closer("h.out", { event: "fail", scope: { kind: "subflow" }, when: [fact("cleared")] }, { disposition: "route", checkpointId: "cp.p1" })]);
    const call: AutomationStudioFlowNode = { id: "call", definitionId: "builtin.control.call-subflow", parameterValues: { subflowId: "child" }, metadata: stop };
    const parent = line("graph.main", [checkpoint("p1", "cp.p1"), call, press("p3")]);
    const options = pageOptions(current, { subflowGraphs: { load: async (subflowId) => (subflowId === "child" ? { subflowId: "child", graph: child, graphRevision: 1 } : undefined) } });
    failingFirst(options, "c2", 1);
    const { trace, invocation } = await framedRun(parent, options);

    expect(trace.status).toBe("succeeded");
    expect(current.landed).toEqual(["p1", "c1", "dismiss", "p1", "c1", "c2", "p3"]);
    const calls = trace.attempts.filter((attempt) => attempt.nodeId === "call");
    const marker = { checkpointId: "cp.p1", invocationId: invocation.frame.invocationId, graphFlowId: "graph.main", nodeId: "p1" };
    expect(calls.map((attempt) => attempt.status)).toEqual(["failed", "succeeded"]);
    expect(calls[0]).toMatchObject({ checkpointRoute: marker, childTrace: { checkpointRoute: marker } });
    expect(calls[0]?.failureClass).toBeUndefined();
    expect(invocation.run.lifecycle.ledger.routesForRun).toBe(1);
    expect(trace.incidents?.map((incident) => [incident.origin.nodeId, incident.ending])).toEqual([["c2", "planned_fail"]]);
    expect(trace.checkpointRoute).toBeUndefined();
  });

  it("judges the path in the calling frame before anything unwinds, and a refusal of a handler already tried says nothing in the chat", async () => {
    const current = page({ failing: { c1: { retryable: false } } });
    const child = line("graph.child", [press("c1", "c1", stop)]);
    const recovery = line("graph.recovery", [], [closer("h.any", { event: "fail", scope: { kind: "automation" }, when: [fact("cleared")] }, { disposition: "route", checkpointId: "cp.p1" })]);
    const call: AutomationStudioFlowNode = { id: "call", definitionId: "builtin.control.call-subflow", parameterValues: { subflowId: "child" }, metadata: stop };
    const parent = line("graph.main", [checkpoint("p1", "cp.p1"), lasting("buy"), call, press("p3")]);
    const subflowGraphs = {
      load: async (subflowId: string) => (subflowId === "child" ? { subflowId: "child", graph: child, graphRevision: 1 } : undefined),
      recovery: async () => ({ subflowId: "recovery", graph: recovery, graphRevision: 1 })
    };
    const { result, rows } = await withRows(() => framedRun(parent, pageOptions(current, { subflowGraphs })));

    expect(result.trace.status).toBe("failed");
    expect(landedCounts(current).buy).toBe(1);
    expect(current.landed).toEqual(["p1", "buy", "dismiss"]);
    expect(result.invocation.run.lifecycle.ledger.routesForRun).toBe(0);
    // The parent's refusal is kept on the trace, and only the run that happened is said in the chat.
    expect(result.trace.handlerExecutions?.map((record) => [record.nodeId, record.outcome])).toEqual([["c1", "succeeded"], ["call", "refused"]]);
    expect(recoveryRows(rows)).toEqual([["handler", "failed", undefined]]);
    expect(result.trace.incidents?.map((incident) => incident.ending)).toEqual(["true_failure"]);
  });
});
