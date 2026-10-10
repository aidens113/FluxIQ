import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDocument, AutomationStudioRuntimeSession } from "../../../../model/index.ts";
import { runAutomationStudioGraph, type AutomationStudioGraphExecutionTrace } from "../../../executor/index.ts";
import { failingAtRow, REFUSED, repairer, replacing, rowsFlow, rowsRun, STOP } from "../../../executor/lifecycle-run/tests/in-run-repair-fixtures.ts";
import { retryPlannedTrue } from "../../../executor/lifecycle-run/tests/recovery-paths-fixtures.ts";
import { press } from "../../../executor/lifecycle-run/tests/wiring-fixtures.ts";
import { automationStudioRunFailureCounts, runtimeSessionToFlowRunDetail } from "../index.ts";

// Retries, planned fails and true failures, counted for every run from the
// recovery incidents its trace carries, and the true failures the run repaired
// in place, from the in-run repairs its trace says were held at the end
// (state-aware recovery plan, C6, C6 step 8, C7).
describe("run failure counts", () => {
  it("counts one retry, one planned fail and one true failure for a run with no Handlers", async () => {
    const { flow, options } = retryPlannedTrue();
    const trace = await runAutomationStudioGraph(flow, options);
    const detail = runtimeSessionToFlowRunDetail(session(trace), "project.counts");

    expect(detail.summary.failureCounts).toEqual({ retries: 1, plannedFails: 1, trueFailures: 1, repairedInRun: 0 });
    expect(detail.failureCounts).toEqual({ retries: 1, plannedFails: 1, trueFailures: 1, repairedInRun: 0 });
  });

  it("counts a true failure the run repaired in place as a true failure, and as repaired in the run", async () => {
    const { current, options } = rowsRun();
    failingAtRow(options, current, "s2", 2, REFUSED);
    const flow = rowsFlow();
    const repair = repairer(() => ({ kind: "overlay", repairId: "repair-1", unit: { kind: "node", nodeId: "s2" }, graph: replacing(flow, "s2", press("s2", "s2b", STOP)) }));
    const trace = await runAutomationStudioGraph(flow, { ...options, repairIncident: repair.callback });
    // The incident's ending is the trial's, `passed`; only the held repair says it was a true failure.
    expect(trace.incidents).toMatchObject([{ trueFailure: true, ending: "passed" }]);
    const detail = runtimeSessionToFlowRunDetail(session(trace), "project.counts");

    expect(detail.summary.failureCounts).toEqual({ retries: 0, plannedFails: 0, trueFailures: 1, repairedInRun: 1 });
    expect(detail.failureCounts).toEqual({ retries: 0, plannedFails: 0, trueFailures: 1, repairedInRun: 1 });
  });

  it("counts a fix whose trial failed as a true failure the run did not repair", async () => {
    const { current, options } = rowsRun();
    failingAtRow(options, current, "s2", 2, REFUSED);
    const flow = rowsFlow();
    const repair = repairer(() => ({ kind: "overlay", repairId: "repair-x", unit: { kind: "node", nodeId: "s2" }, graph: replacing(flow, "s2", { ...press("s2", "s2", STOP), label: "Still s2" }) }));
    const trace = await runAutomationStudioGraph(flow, { ...options, repairIncident: repair.callback });
    expect(trace.attempts.filter((attempt) => attempt.repair).map((attempt) => attempt.repair?.outcome)).toEqual(["held", "dropped"]);

    expect(runtimeSessionToFlowRunDetail(session(trace), "project.counts").summary.failureCounts).toEqual({ retries: 0, plannedFails: 0, trueFailures: 1, repairedInRun: 0 });
  });

  it("counts zero of each for a run that met no failure, and nothing for what is not an incident or a repair id", () => {
    const clean: AutomationStudioGraphExecutionTrace = { status: "succeeded", startedAt: 5, finishedAt: 20, attempts: [], values: {}, effects: [] };
    expect(runtimeSessionToFlowRunDetail(session(clean), "project.counts").summary.failureCounts).toEqual({ retries: 0, plannedFails: 0, trueFailures: 0, repairedInRun: 0 });
    expect(automationStudioRunFailureCounts([null, "x", { ending: "planned_fail", retries: Number.NaN }, { ending: "true_failure", retries: 2 }])).toEqual({ retries: 2, plannedFails: 1, trueFailures: 1, repairedInRun: 0 });
    expect(automationStudioRunFailureCounts(undefined)).toEqual({ retries: 0, plannedFails: 0, trueFailures: 0, repairedInRun: 0 });
    expect(automationStudioRunFailureCounts([{ trueFailure: true, ending: "passed", retries: 0 }], ["repair-1", "repair-1", "", 7, null])).toEqual({ retries: 0, plannedFails: 0, trueFailures: 1, repairedInRun: 1 });
    expect(automationStudioRunFailureCounts([], "repair-1")).toEqual({ retries: 0, plannedFails: 0, trueFailures: 0, repairedInRun: 0 });
  });

  it("counts a child's true failure its caller's On Fail path handled as a planned fail only", () => {
    // The incident keeps the child's `trueFailure` mark and ends as the parent's planned fail (C6); no repair is held.
    expect(automationStudioRunFailureCounts([{ trueFailure: true, ending: "planned_fail", retries: 0 }], undefined)).toEqual({ retries: 0, plannedFails: 1, trueFailures: 0, repairedInRun: 0 });
  });
});

function session(trace: AutomationStudioGraphExecutionTrace): AutomationStudioRuntimeSession {
  return {
    schemaVersion: "0.1",
    runId: "run.counts",
    projectId: "project.counts",
    targetKind: "flow",
    targetId: "flow.counts",
    flowId: "flow.counts",
    status: trace.status === "succeeded" ? "succeeded" : "failed",
    queuedAt: 1,
    startedAt: 5,
    finishedAt: 20,
    // The conversion never reads the Flow document.
    flow: {} as AutomationStudioFlowDocument,
    trace
  };
}
