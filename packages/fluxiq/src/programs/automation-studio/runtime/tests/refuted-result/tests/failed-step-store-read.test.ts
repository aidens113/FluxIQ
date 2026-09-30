// A failed run the failed-step re-author will not take is handed back without
// its record being read from the project's store (t207).
//
// t193 handed every failed run to the failed-step route, which read the run's
// record before deciding anything. A run that failed because the project's
// store could not be opened -- `record_output.persist_failed`, the dataset
// store's own failure -- then read that store again, and the read threw
// "project database pool is closing" out of the run: the caller got an error in
// place of the failed run, with its failure record. The route only ever takes a
// step whose target was not found or not told apart, and the run's own trace
// says whether that is how it failed.
import { describe, expect, it, vi } from "vitest";
import type { AutomationStudioFlowRunDetail } from "../../../../model/index.ts";
import type { AutomationStudioFailedStepRepairPort } from "../../../recovery/refuted-result/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "../../../executor/index.ts";
import { verifyAutomationStudioRuntimeSessionResult, type AutomationStudioResultVerificationPorts } from "../../../result-verification/index.ts";
import { flow, harness, runDetail, session } from "../../../result-verification/tests/run-outcome-harness.ts";

const attempt = (failure: NonNullable<AutomationStudioNodeAttemptTrace["failure"]>): AutomationStudioNodeAttemptTrace => ({
  attemptId: "attempt.2", nodeId: "n2", definitionId: "builtin.policy.action", startedAt: 2, finishedAt: 3, status: "failed",
  inputs: {}, outputs: {}, effects: [], failure
});

/** A failed run whose trace ends at `failure`. */
const failedAt = (failure: NonNullable<AutomationStudioNodeAttemptTrace["failure"]>) =>
  session({ status: "failed", trace: { status: "failed", startedAt: 2, finishedAt: 3, attempts: [attempt(failure)], values: {}, effects: [] } });

/** A store that is closing, as the dataset test's store is by the time the run fails. */
function closingStore(port: AutomationStudioFailedStepRepairPort) {
  const context = harness();
  const reads = vi.fn(async (): Promise<AutomationStudioFlowRunDetail | null> => { throw new Error("Automation Studio project database pool is closing."); });
  const ports: AutomationStudioResultVerificationPorts = { ...context.ports, getFlowRunDetail: reads, repairFailedStep: port };
  return { ...context, ports, reads };
}

describe("a failed run the failed-step route does not take", () => {
  it("is handed back as it failed, and its store is not read, when the step failed at storing its rows", async () => {
    const port = vi.fn<AutomationStudioFailedStepRepairPort>(async () => undefined);
    const context = closingStore(port);
    const failed = failedAt({ category: "action_failed", code: "record_output.persist_failed", retryable: false });

    const next = await verifyAutomationStudioRuntimeSessionResult({ ports: context.ports, projectId: "project-1", session: failed, flow });

    expect(next).toBe(failed);
    expect(context.reads).not.toHaveBeenCalled();
    expect(port).not.toHaveBeenCalled();
    expect(context.saved).toHaveLength(0);
  });

  it("is handed back unread when its trace records no failed step at all", async () => {
    const port = vi.fn<AutomationStudioFailedStepRepairPort>(async () => undefined);
    const context = closingStore(port);
    const failed = session({ status: "failed", trace: { status: "failed", startedAt: 2, finishedAt: 3, attempts: [], values: {}, effects: [] } });

    await expect(verifyAutomationStudioRuntimeSessionResult({ ports: context.ports, projectId: "project-1", session: failed, flow })).resolves.toBe(failed);
    expect(context.reads).not.toHaveBeenCalled();
  });
});

describe("a failed run the failed-step route may take", () => {
  it("has its record read and handed to the route when the trace failed at a step's target", async () => {
    const context = harness();
    const detail: AutomationStudioFlowRunDetail = { ...runDetail(), summary: { ...runDetail().summary, status: "failed" } };
    const reads = vi.fn(async () => detail);
    const port = vi.fn<AutomationStudioFailedStepRepairPort>(async () => undefined);
    const failed = failedAt({ category: "target_not_found", code: "target.not_found", retryable: true, stage: "target_resolution" });

    const next = await verifyAutomationStudioRuntimeSessionResult({ ports: { ...context.ports, getFlowRunDetail: reads, repairFailedStep: port }, projectId: "project-1", session: failed, flow });

    expect(reads).toHaveBeenCalledTimes(1);
    expect(port).toHaveBeenCalledTimes(1);
    expect(port.mock.calls[0]?.[0]).toMatchObject({ detail, failedTraceAttempt: { nodeId: "n2" } });
    expect(next).toBe(failed);
  });
});
