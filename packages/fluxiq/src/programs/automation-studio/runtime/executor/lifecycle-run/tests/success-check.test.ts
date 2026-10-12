// The success check at a frame's End (state-aware recovery plan, C2, C6 step
// 6; unit D2): a known alternative -- an On Fail handler whose body calls an
// alternative Subflow and ends `resolve` -- passes the same check when its
// outputs are equivalent and fails the frame when they are not; a child's
// check that does not hold is its Call Subflow node's failure, which the
// parent's On Fail path takes; a graph with no check asks nothing.

import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowNode } from "../../../../model/index.ts";
import { runAutomationStudioGraph } from "../../graph-run.ts";
import { edge, HANDLER, HANDLER_END } from "./lifecycle-fixtures.ts";
import { answering, factHost } from "./recovery-paths-fixtures.ts";
import { fact, line, page, pageOptions, press } from "./wiring-fixtures.ts";

const stop = { onFailure: "stop" };
const RESULT_GOOD = { "fluxiq.successCheck": [fact("result-good")] };

/**
 * Subflow `main`: start -> s1 -> s2 -> s3 -> done, checked by `result-good`.
 * s2 always fails; its On Fail handler's body calls Subflow `alt`, keeps the
 * alternative's `result` as `altResult`, and resolves s2 with it.
 */
function withAlternative() {
  const body = [
    { id: "h.alt", definitionId: HANDLER, parameterValues: { event: "fail", scope: { kind: "nodes", nodeIds: ["s2"] }, when: [fact("cleared")] }, label: "Try the other way" },
    { id: "h.alt.call", definitionId: "builtin.control.call-subflow", parameterValues: { subflowId: "alt", outputs: { result: "altResult" } } },
    { id: "h.alt.end", definitionId: HANDLER_END, parameterValues: { disposition: "resolve", outputs: { result: { $state: { path: "altResult" } } } } }
  ] satisfies AutomationStudioFlowNode[];
  const main = line("graph.main", [press("s1"), press("s2", "s2", stop), press("s3")], [{ nodes: body, edges: [edge("h.alt", "h.alt.call", "body"), edge("h.alt.call", "h.alt.end")] }]);
  const alt = line("graph.alt", [press("a1")]);
  return { main: { ...main, metadata: RESULT_GOOD }, alt };
}

function runWith(answer: string) {
  const current = page({ failing: { s2: { retryable: false } } });
  const { main, alt } = withAlternative();
  const options = pageOptions(current, {
    subflowGraphs: { load: async (subflowId) => (subflowId === "alt" ? { subflowId: "alt", graph: alt, graphRevision: 1 } : undefined) },
    // The check holds when the run's `result` is the good one.
    hostRuntime: factHost(current, (name, context) => (name === "result-good" ? (context.values?.result === "good" ? "true" : "false") : "unknown"))
  });
  answering(options, "a1", { result: answer });
  return { current, run: runAutomationStudioGraph(main, options) };
}

describe("the success check at a frame's End", () => {
  it("passes an equivalent fallback: the alternative Subflow's outputs satisfy the same check", async () => {
    const { current, run } = runWith("good");
    const trace = await run;

    expect(trace.status).toBe("succeeded");
    expect(current.landed).toEqual(["s1", "a1", "s3"]);
    expect(trace.values.result).toBe("good");
    expect(trace.attempts.find((attempt) => attempt.nodeId === "s2")).toMatchObject({ failureClass: "planned_fail", lifecycle: { disposition: { kind: "resolve" } }, outputs: { result: "good" } });
    expect(trace.successCheck).toMatchObject({ truth: "true", evidence: [{ truth: "true", capturedAt: 1_000 }] });
    // The check was one observation at the End.
    expect(current.factBatches.filter((batch) => batch.some((condition) => condition.fact === "result-good"))).toHaveLength(1);
  });

  it("fails the frame when the fallback's outputs do not satisfy the check, as a verification failure", async () => {
    const { current, run } = runWith("bad");
    const trace = await run;

    expect(current.landed).toEqual(["s1", "a1", "s3"]);
    expect(trace.status).toBe("failed");
    expect(trace.successCheck?.truth).toBe("false");
    expect(trace.failure).toEqual({ category: "expected_state_missing", code: "executor.success_check.false", retryable: false, stage: "verification" });
  });

  it("makes a child's unheld check its Call Subflow node's failure, which the parent's On Fail path takes, and an unproven check fails as unknown", async () => {
    for (const [answer, code] of [["false", "executor.success_check.false"], ["unknown", "executor.success_check.unknown"]] as const) {
      const current = page();
      const child = { ...line("graph.child", [press("c1")]), metadata: { "fluxiq.successCheck": [fact("done-right")] } };
      const call: AutomationStudioFlowNode = { id: "call", definitionId: "builtin.control.call-subflow", parameterValues: { subflowId: "child" } };
      const parent = line("graph.parent", [call], [{ nodes: [press("fallback"), { id: "fallback.end", definitionId: "builtin.control.end" }], edges: [edge("call", "fallback", "failed"), edge("fallback", "fallback.end")] }]);
      const options = pageOptions(current, {
        subflowGraphs: { load: async () => ({ subflowId: "child", graph: child, graphRevision: 1 }) },
        hostRuntime: factHost(current, () => answer)
      });
      const trace = await runAutomationStudioGraph(parent, options);

      expect(trace.status).toBe("succeeded");
      expect(current.landed).toEqual(["c1", "fallback"]);
      const calls = trace.attempts.filter((attempt) => attempt.nodeId === "call");
      // Not retryable at node level: the child ran once.
      expect(calls).toHaveLength(1);
      expect(calls[0]?.failure).toMatchObject({ code, retryable: false, stage: "verification" });
      expect(calls[0]?.childTrace?.successCheck?.truth).toBe(answer);
      expect(trace.incidents?.map((incident) => incident.ending)).toEqual(["planned_fail"]);
    }
  });

  it("asks nothing when the graph declares no check, and does not default to the End node's expected state", async () => {
    const current = page();
    const flow = line("graph.main", [press("s1")]);
    flow.nodes = flow.nodes.map((node) => (node.id === "done" ? { ...node, expectedState: { conditions: [fact("never")] } } : node));
    const trace = await runAutomationStudioGraph(flow, pageOptions(current, { hostRuntime: factHost(current, () => "false") }));

    expect(trace.status).toBe("succeeded");
    expect(current.factBatches).toEqual([]);
    expect("successCheck" in trace).toBe(false);
  });
});
