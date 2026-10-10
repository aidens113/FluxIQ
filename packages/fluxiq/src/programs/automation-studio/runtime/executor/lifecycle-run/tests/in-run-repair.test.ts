// In-run model repair at the failing step (state-aware recovery plan, C6 step
// 8, "What counts as a true failure", C7, C12): real graph runs against the
// wiring page with a fake repair callback that counts its calls. No model.

import type { AutomationStudioFailureRecord } from "@fluxiq/contracts/automation-studio";
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowNode } from "../../../../model/index.ts";
import type { AutomationStudioGraphExecutionTrace } from "../../contracts.ts";
import { runAutomationStudioGraph } from "../../graph-run.ts";
import { adding, failingAtRow, popupAtRow, pressCounts, REFUSED, repairer, replacing, rowsFlow, rowsRun, STOP } from "./in-run-repair-fixtures.ts";
import { factHost, framedRun, lasting, retryPlannedTrue, withRows } from "./recovery-paths-fixtures.ts";
import { closer, fact, landedCounts, line, page, pageOptions, press } from "./wiring-fixtures.ts";

/** The node ids the run attempted, in order, leaving out handler bodies. */
const path = (trace: AutomationStudioGraphExecutionTrace) => trace.attempts.filter((attempt) => !attempt.nodeId.startsWith("h.")).map((attempt) => attempt.nodeId);

describe("in-run repair at the failing step", () => {
  it("holds a replaced node at row 2 of 3: one call, the run carries on at row 2 then row 3, and nothing repeats", async () => {
    const { current, options } = rowsRun();
    failingAtRow(options, current, "s2", 2, REFUSED);
    const flow = rowsFlow();
    const fixed = replacing(flow, "s2", press("s2", "s2b", STOP));
    const repair = repairer(() => ({ kind: "overlay", repairId: "repair-1", unit: { kind: "node", nodeId: "s2" }, graph: fixed }));
    const { result: trace, rows } = await withRows(() => runAutomationStudioGraph(flow, { ...options, repairIncident: repair.callback }));

    expect(trace.status).toBe("succeeded");
    expect(repair.requests).toHaveLength(1);
    const [request] = repair.requests;
    expect(request).toMatchObject({ unit: { kind: "node", nodeId: "s2" }, subflowId: "main", failedAttempt: { nodeId: "s2", status: "failed" }, incident: { trueFailure: true, origin: { nodeId: "s2" } } });
    expect(request!.graph).toBe(flow);
    expect(request!.framePath).toHaveLength(1);
    // Every press, landed or not: s1 once a row, s2 once (row 1), its failure at row 2, then the fix at rows 2 and 3.
    expect(current.presses).toEqual(["s1", "s2", "s1", "s2", "s2b", "s1", "s2b"]);
    expect(landedCounts(current)).toEqual({ s1: 3, s2: 1, s2b: 2 });
    expect(path(trace)).toEqual(["start", "list", "each", "s1", "s2", "each", "s1", "s2", "s2", "each", "s1", "s2", "each", "done"]);
    const failed = trace.attempts.find((attempt) => attempt.repair)!;
    expect(failed).toMatchObject({ nodeId: "s2", status: "failed", repair: { repairId: "repair-1", unit: { kind: "node", nodeId: "s2" }, outcome: "held" } });
    expect(trace.repairs).toEqual(["repair-1"]);
    // The incident was a true failure; the trial decided how it ended.
    expect(trace.incidents).toMatchObject([{ trueFailure: true, ending: "passed" }]);
    expect(rows.filter((row) => row.phase === "repairing" && JSON.stringify(row).includes("Fixing a step"))).toHaveLength(1);
  });

  it("holds an added handler: the popup at row 2 is cleared by the new On Retry handler, and the run carries on", async () => {
    const { current, options } = rowsRun();
    popupAtRow(options, current, 2);
    const flow = rowsFlow();
    const handler = closer("h.popup", { event: "retry", scope: { kind: "nodes", nodeIds: ["s2"] }, when: [fact("popup")], completionCheck: [fact("cleared")] });
    const repair = repairer(() => ({ kind: "overlay", repairId: "repair-h", unit: { kind: "node", nodeId: "s2" }, graph: adding(flow, handler), reason: "Close the popup before trying again." }));
    const trace = await runAutomationStudioGraph(flow, { ...options, repairIncident: repair.callback });

    expect(trace.status).toBe("succeeded");
    expect(repair.requests).toHaveLength(1);
    expect(landedCounts(current)).toEqual({ s1: 3, s2: 3, dismiss: 1 });
    // Row 2's four spoiled attempts, the trial's spoiled first attempt, then the press after the handler cleared the way.
    expect(pressCounts(current)).toEqual({ s1: 3, s2: 8, dismiss: 1 });
    expect(trace.handlerExecutions?.map((record) => [record.event, record.nodeId, record.disposition.kind])).toEqual([["retry", "s2", "resume"]]);
    expect(trace.attempts.find((attempt) => attempt.repair)?.repair).toEqual({ repairId: "repair-h", unit: { kind: "node", nodeId: "s2" }, outcome: "held", reason: "Close the popup before trying again." });
    expect(trace.repairs).toEqual(["repair-h"]);
  });

  it("drops a fix whose trial fails too: one call, both graphs put back, and the run ends failed with the incident", async () => {
    const { current, options } = rowsRun();
    failingAtRow(options, current, "s2", 2, REFUSED);
    const flow = rowsFlow();
    const repair = repairer(() => ({ kind: "overlay", repairId: "repair-x", unit: { kind: "node", nodeId: "s2" }, graph: replacing(flow, "s2", { ...press("s2", "s2", STOP), label: "Still s2" }) }));
    const { trace, invocation } = await framedRun(flow, { ...options, repairIncident: repair.callback });

    expect(trace.status).toBe("failed");
    expect(repair.requests).toHaveLength(1);
    expect(current.presses).toEqual(["s1", "s2", "s1", "s2", "s2"]);
    expect(trace.attempts.filter((attempt) => attempt.repair).map((attempt) => attempt.repair?.outcome)).toEqual(["held", "dropped"]);
    expect(trace.repairs).toBeUndefined();
    expect(trace.incidents).toMatchObject([{ trueFailure: true, ending: "true_failure" }]);
    expect(invocation.run.lifecycle.repairs.get(trace.incidents![0]!.incidentId)?.outcome).toBe("dropped");
    expect(invocation.run.lifecycle.graphs.get("graph.main")?.graph).toBe(flow);
  });

  it("ends as before on `none`, with the reason recorded, and a run with no callback keeps today's trace", async () => {
    const none = rowsRun();
    failingAtRow(none.options, none.current, "s2", 2, REFUSED);
    const repair = repairer(() => ({ kind: "none", reason: "The run's cost ceiling is reached." }));
    const asked = await runAutomationStudioGraph(rowsFlow(), { ...none.options, repairIncident: repair.callback });
    const plain = rowsRun();
    failingAtRow(plain.options, plain.current, "s2", 2, REFUSED);
    const bare = await runAutomationStudioGraph(rowsFlow(), plain.options);

    expect(repair.requests).toHaveLength(1);
    expect(asked.status).toBe("failed");
    const recorded = asked.attempts.find((attempt) => attempt.repair);
    expect(recorded?.repair).toEqual({ unit: { kind: "node", nodeId: "s2" }, outcome: "none", reason: "The run's cost ceiling is reached." });
    // The same run without the record is the run with no callback, which carries no repair keys at all.
    expect({ ...asked, attempts: asked.attempts.map(({ repair: _repair, ...attempt }) => attempt) }).toEqual(bare);
    expect(JSON.stringify(bare)).not.toMatch(/"repairs?"/u);
  });

  it("makes zero calls for retries, a failed edge, an On Fail handler and a state route", async () => {
    // s1 retried, s2 planned to fallback by its failed edge: only fallback's own true failure asks.
    const planned = retryPlannedTrue();
    const first = repairer(() => ({ kind: "none", reason: "no" }));
    const trace = await runAutomationStudioGraph(planned.flow, { ...planned.options, repairIncident: first.callback });
    expect(first.requests.map((request) => request.failedAttempt.nodeId)).toEqual(["fallback"]);
    expect(trace.incidents?.map((incident) => incident.ending)).toEqual(["passed", "planned_fail", "true_failure"]);

    // An On Fail handler that resolves: a planned fail.
    const resolved = page({ failing: { s2: { retryable: false } } });
    const handled = line("graph.main", [press("s1"), press("s2", "s2", STOP), press("s3")], [closer("h.fail", { event: "fail", scope: { kind: "nodes", nodeIds: ["s2"] }, when: [fact("cleared")] }, { disposition: "resolve", outputs: { ok: "resolved" } })]);
    const second = repairer(() => ({ kind: "none", reason: "no" }));
    expect((await runAutomationStudioGraph(handled, pageOptions(resolved, { repairIncident: second.callback }))).status).toBe("succeeded");
    expect(second.requests).toHaveLength(0);

    // A step whose target is gone, on a page already past it: state routing moves the run on.
    const at = { current: "p1" };
    const signed = (before: string, after: string): AutomationStudioFlowNode["metadata"] => ({ routeSignatures: { before: { page: before }, after: { page: after } } });
    const routed = line("graph.main", [press("r1", "r1", signed("p1", "p2")), press("r2", "r2", signed("p2", "p3")), press("r3", "r3", signed("p3", "p4"))]);
    const third = repairer(() => ({ kind: "none", reason: "no" }));
    const routedTrace = await runAutomationStudioGraph(routed, {
      delay: async () => undefined,
      repairIncident: third.callback,
      hostRuntime: { capabilities: [], observeRouteState: () => ({ page: at.current }), signRouteState: (state) => ({ page: String(state.page) }), compareRouteSignatures: (recorded, observed) => ({ matches: recorded.page === observed.page, closeness: recorded.page === observed.page ? 1 : 0 }) },
      effectDispatcher: (effect) => {
        const id = /"elementId":"([^"]+)"/u.exec(JSON.stringify(effect.payload ?? null))?.[1];
        if (id === "r2") return { status: "failed", route: "failed", message: "No target resolved.", failure: { category: "target_not_found", code: "web.target.not_found", retryable: true, stage: "target_resolution" } };
        if (id === "r1") at.current = "p3";
        return { status: "success", route: "success", outputs: {} };
      }
    });
    expect(routedTrace.status).toBe("succeeded");
    expect(routedTrace.attempts.find((attempt) => attempt.nodeId === "r2")?.route).toBe("state_routed");
    expect(third.requests).toHaveLength(0);
  });

  it("makes no call past an uncertain act, in the frame or in a part it called", async () => {
    const uncertain: AutomationStudioFailureRecord = { category: "ambiguous_or_unknown", code: "web.action.unknown", retryable: false, stage: "execution", effect: "ambiguous" };
    const here = rowsRun();
    failingAtRow(here.options, here.current, "s2", 2, uncertain);
    const own = repairer(() => ({ kind: "none", reason: "no" }));
    const ownTrace = await runAutomationStudioGraph(rowsFlow(lasting("s2")), { ...here.options, repairIncident: own.callback });
    expect(ownTrace.message).toMatch(/^Outcome uncertain/u);
    expect(own.requests).toHaveLength(0);

    // The child stops Outcome uncertain; its Call Subflow node then fails with nowhere to go, and still nothing is asked.
    const current = page();
    const child = line("graph.child", [lasting("c1")]);
    const call: AutomationStudioFlowNode = { id: "call", definitionId: "builtin.control.call-subflow", parameterValues: { subflowId: "child" }, metadata: STOP };
    const options = pageOptions(current, { subflowGraphs: { load: async () => ({ subflowId: "child", graph: child, graphRevision: 1 }) } });
    const dispatch = options.effectDispatcher!;
    options.effectDispatcher = (effect, context) => (JSON.stringify(effect.payload ?? null).includes("\"c1\"") ? { status: "failed", route: "failed", message: "Lost.", failure: uncertain } : dispatch(effect, context));
    const parted = repairer(() => ({ kind: "none", reason: "no" }));
    const trace = await runAutomationStudioGraph(line("graph.parent", [call]), { ...options, repairIncident: parted.callback });
    expect(trace.status).toBe("failed");
    expect(trace.attempts[1]?.childTrace?.attempts.some((attempt) => attempt.effectCheck?.result === "unknown")).toBe(true);
    expect(parted.requests).toHaveLength(0);
  });

  it("names the part when a called Subflow's success check fails, and runs the fixed part on the re-attempt", async () => {
    const current = page();
    const child = { ...line("graph.child", [press("c1")]), metadata: { "fluxiq.successCheck": [fact("done-right")] } };
    const fixedChild = { ...child, metadata: {} };
    const call: AutomationStudioFlowNode = { id: "call", definitionId: "builtin.control.call-subflow", parameterValues: { subflowId: "child" } };
    const parent = line("graph.parent", [call]);
    const options = pageOptions(current, { subflowGraphs: { load: async () => ({ subflowId: "child", graph: child, graphRevision: 1 }) }, hostRuntime: factHost(current, () => "false") });
    const repair = repairer((request) => ({ kind: "overlay", repairId: "repair-p", unit: request.unit, graph: request.graph, partGraph: { subflowId: "child", graph: fixedChild } }));
    const { trace, invocation } = await framedRun(parent, { ...options, repairIncident: repair.callback });

    expect(repair.requests.map((request) => request.unit)).toEqual([{ kind: "part", subflowId: "child" }]);
    expect(trace.status).toBe("succeeded");
    expect(current.landed).toEqual(["c1", "c1"]);
    expect(trace.attempts.filter((attempt) => attempt.nodeId === "call").map((attempt) => attempt.status)).toEqual(["failed", "succeeded"]);
    expect(invocation.run.subflowOverrides.get("child")).toBe(fixedChild);
  });

  it("names a handler whose completion check stayed untrue, and lets the fixed handler run once more as the trial", async () => {
    const current = page({ failing: { s2: { retryable: false } } });
    const resolve = { disposition: "resolve", outputs: { ok: "resolved" } };
    const weak = closer("h.fail", { event: "fail", scope: { kind: "nodes", nodeIds: ["s2"] }, when: [fact("cleared")], completionCheck: [fact("never-known")] }, resolve);
    const flow = line("graph.main", [press("s1"), press("s2", "s2", STOP), press("s3")], [weak]);
    const strong = closer("h.fail", { event: "fail", scope: { kind: "nodes", nodeIds: ["s2"] }, when: [fact("cleared")], completionCheck: [fact("cleared")] }, resolve);
    const repair = repairer((request) => ({ kind: "overlay", repairId: "repair-hf", unit: request.unit, graph: replacing(request.graph, "h.fail", strong.nodes[0]!) }));
    const trace = await runAutomationStudioGraph(flow, pageOptions(current, { repairIncident: repair.callback }));

    expect(repair.requests.map((request) => request.unit)).toEqual([{ kind: "handler", handlerNodeId: "h.fail" }]);
    expect(trace.status).toBe("succeeded");
    expect(trace.handlerExecutions?.map((record) => record.disposition.kind)).toEqual(["unhandled", "resolve"]);
    expect(landedCounts(current)).toEqual({ s1: 1, dismiss: 2, s3: 1 });
    expect(path(trace).slice(-2)).toEqual(["s3", "done"]);
  });

  it("never asks inside a handler body: the body's failure is its handler's, met at the node", async () => {
    // A handler body's own step failing is the handler's failure, which its node then meets: the callback is asked once, for the node.
    const current = page({ failing: { s2: { retryable: false }, "h.fail.close": { retryable: false } } });
    const brokenBody = closer("h.fail", { event: "fail", scope: { kind: "nodes", nodeIds: ["s2"] }, when: [fact("cleared")] }, { disposition: "resolve", outputs: {} });
    brokenBody.nodes[1] = press("h.fail.close", "h.fail.close", STOP);
    const flow = line("graph.main", [press("s1"), press("s2", "s2", STOP)], [brokenBody]);
    const repair = repairer(() => ({ kind: "none", reason: "no" }));
    const trace = await runAutomationStudioGraph(flow, pageOptions(current, { repairIncident: repair.callback }));

    expect(trace.status).toBe("failed");
    expect(repair.requests.map((request) => [request.failedAttempt.nodeId, request.unit.kind])).toEqual([["s2", "handler"]]);
  });
});
