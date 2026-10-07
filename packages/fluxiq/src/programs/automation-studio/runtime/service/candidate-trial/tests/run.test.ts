import { describe, expect, it, vi } from "vitest";
import type { AutomationStudioLlmTaskRequest } from "../../../llm/index.ts";
import { automationStudioBuildTestJudge } from "../../../result-verification/index.ts";
import { judgeReply, mockProvider } from "../../../tests/service-bootstrap/tests/fixtures.ts";
import { automationStudioCandidateTrialPort, runAutomationStudioCandidateTrial } from "../index.ts";
import { SPENT_TWO, trialFixture } from "./fixtures.ts";

/** The press answers `status`; every call is counted. */
function pressing(fixture: ReturnType<typeof trialFixture>, status: "success" | "failed" = "success", during?: () => void) {
  let presses = 0;
  fixture.ports.graphOptions = ({ signal }) => ({ signal, now: () => 100, nativeNodeExecutor: async () => {
    presses++; during?.();
    return { result: status === "success" ? { status: "success", route: "success", outputs: {} } : { status: "failed", route: "failed", outputs: {}, failure: { category: "dom_target_missing", code: "press.target_missing", retryable: false, stage: "execute" } } };
  } } as ReturnType<typeof fixture.ports.graphOptions>);
  return () => presses;
}

describe("one candidate trial", () => {
  it("runs the exact candidate once under its own session and judges only that run's evidence", async () => {
    const fixture = trialFixture(), presses = pressing(fixture);
    const asked: string[] = [];
    const graphOptions = fixture.ports.graphOptions;
    fixture.ports.graphOptions = (input) => { asked.push(`options:${input.runId}`); return graphOptions(input); };
    fixture.ports.recordSets = async (runId) => { asked.push(`rows:${runId}`); return [{ summary: { runId, datasetId: "cart", nodeIds: ["press"], schemaDigest: "schema", recordCount: 1, truncated: false, invalidCount: 0, updatedAt: 1 }, rows: [{ item: "hub" }] }]; };
    fixture.ports.readEndView = async ({ runId }) => { asked.push(`end:${runId}`); return { view: { cart: "1 item" } }; };
    fixture.ports.deniedEvidenceKeys = [];
    const { result, record } = await runAutomationStudioCandidateTrial(fixture.request(), fixture.ports);

    expect(presses()).toBe(1);
    expect(result).toMatchObject({ revision: 1, digest: fixture.candidate.digest, verdict: "yes", trialRunId: "trial.1" });
    expect(record).toMatchObject({ candidateId: "candidate.1", trialRunId: "trial.1", start: { status: "not_reset" }, execution: "succeeded", verdict: "yes", judge: { calls: 2 } });
    expect(asked).toEqual(["options:trial.1", "rows:trial.1", "end:trial.1"]);
    // The judge is handed one summary, of the trial alone: the steps that ran, the rows stored under the trial's run id, the page it ended on.
    expect(fixture.judged).toHaveLength(1);
    expect(Object.keys(fixture.judged[0]!)).toEqual(["summary"]);
    expect(fixture.judged[0]!.summary.flowShape.map((step) => step.definitionId)).toEqual(["builtin.control.start", "custom.press"]);
    expect(fixture.judged[0]!.summary).toMatchObject({ totalRecordCount: 1, endView: { view: { cart: "1 item" } } });
    // Its session opened queued, ran, and ended with the trace; the trial is recorded on it.
    expect(fixture.sessions.map((session) => session.status)).toEqual(["queued", "running", "succeeded"]);
    expect(fixture.sessions.at(-1)).toMatchObject({ runId: "trial.1", trace: { status: "succeeded" }, metadata: { candidateTrial: { candidateId: "candidate.1", revision: 1, start: "not_reset", execution: "succeeded" } } });
  });

  it("with no start hook records not_reset; with one, calls it first and records what it answered; a failing hook runs nothing", async () => {
    const order: string[] = [];
    const fixture = trialFixture(); pressing(fixture, "success", () => order.push("press"));
    fixture.ports.prepareStart = async (input) => { order.push(`reset:${input.candidateId}:${input.revision}`); return { fixture: "reset", generation: 3 }; };
    const reset = await runAutomationStudioCandidateTrial(fixture.request(), fixture.ports);
    expect(order).toEqual(["reset:candidate.1:1", "press"]);
    expect(reset.record.start).toEqual({ status: "reset", result: { fixture: "reset", generation: 3 } });
    expect(reset.result.feedback).toMatchObject({ start: "reset" });
    expect(JSON.stringify(reset.result.feedback)).not.toContain("generation");

    const failing = trialFixture(), presses = pressing(failing);
    failing.ports.prepareStart = async () => { throw new Error("secret deployment detail"); };
    const refused = await runAutomationStudioCandidateTrial(failing.request(), failing.ports);
    expect(refused.result).toMatchObject({ verdict: "execution_failed", feedback: { code: "candidate.trial_start_failed" } });
    expect(refused.record).toMatchObject({ execution: "not_run", start: { status: "failed", failure: "Error" } });
    expect(JSON.stringify(refused)).not.toContain("secret");
    expect(presses()).toBe(0); expect(failing.sessions).toEqual([]); expect(failing.judged).toEqual([]);
  });

  it("does not judge a run that failed a step, and tells the model which step and how", async () => {
    const fixture = trialFixture(), presses = pressing(fixture, "failed");
    const { result, record } = await runAutomationStudioCandidateTrial(fixture.request(), fixture.ports);
    expect(presses()).toBe(1);
    expect(fixture.judged).toEqual([]);
    expect(result).toMatchObject({ verdict: "execution_failed", feedback: { code: "candidate.execution_incomplete", steps: [{ step: 1, definitionId: "builtin.control.start" }, { step: 2, definitionId: "custom.press", status: "failed" }] } });
    expect(record).toMatchObject({ execution: "failed", judge: { calls: 0 } });
    expect(fixture.sessions.at(-1)?.status).toBe("failed");
  });

  it("a cancelled trial asks no judge and throws the cancellation, its session ended cancelled", async () => {
    const controller = new AbortController();
    const fixture = trialFixture(); pressing(fixture, "success", () => controller.abort(new DOMException("stopped", "AbortError")));
    await expect(runAutomationStudioCandidateTrial(fixture.request(controller.signal), fixture.ports)).rejects.toMatchObject({ name: "AbortError" });
    expect(fixture.judged).toEqual([]);
    expect(fixture.sessions.at(-1)?.status).toBe("cancelled");
  });

  it("a run the runtime cancelled without the build stopping is execution_failed and unjudged", async () => {
    const fixture = trialFixture();
    fixture.ports.execute = async (input) => ({ receipt: { identity: input.identity, runId: input.runId, startReceiptId: input.start.receiptId, startedAt: 1, finishedAt: 2, status: "cancelled", executedNodeCount: 0, commands: [] }, code: "candidate.execution_cancelled" });
    const { result } = await runAutomationStudioCandidateTrial(fixture.request(), fixture.ports);
    expect(result).toMatchObject({ verdict: "execution_failed", feedback: { code: "candidate.execution_cancelled" } });
    expect(fixture.judged).toEqual([]);
  });

  it("refuses a base that moved before the run: nothing presses, nothing is judged", async () => {
    const fixture = trialFixture(), presses = pressing(fixture);
    fixture.ports.currentBaseDigest = async () => "edited";
    const { result } = await runAutomationStudioCandidateTrial(fixture.request(), fixture.ports);
    expect(result).toMatchObject({ verdict: "execution_failed", feedback: { code: "candidate.execution_stale" } });
    expect(presses()).toBe(0); expect(fixture.judged).toEqual([]);
  });

  it.each([
    ["a yes confirmed by a second yes", ["yes", "yes"], "yes", 2],
    ["a yes then unknown", ["yes", "unknown"], "unsure", 2],
    ["a yes then a silent reply", ["yes", "silent"], "unsure", 2],
    ["a yes then no", ["yes", "no"], "unsure", 2],
    ["two noes", ["no", "no"], "no", 2]
  ] as const)("the real build-test judge: %s gives %s", async (_name, replies, expected, calls) => {
    const fixture = trialFixture(); pressing(fixture);
    const requests: AutomationStudioLlmTaskRequest[] = [];
    const provider = mockProvider(async (request) => {
      requests.push(request);
      const reply = replies[requests.length - 1];
      if (reply === "silent") return { response: { kind: "diagnosis", summary: "Judged.", diagnosis: {} }, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, estimatedCostUsd: 0.0001 } };
      return judgeReply(reply ?? "unknown", reply === "no" ? { expected: "the hub in the cart", observed: "the cart is empty" } : {});
    });
    fixture.ports.judge = automationStudioBuildTestJudge({ provider, instructions: [], deniedEvidenceKeys: [], projectId: "project", flowId: "parent" });
    const { result, record } = await runAutomationStudioCandidateTrial(fixture.request(), fixture.ports);
    expect(result.verdict).toBe(expected);
    expect(record.judge.calls).toBe(calls);
    expect(requests.every((request) => request.taskKind === "loop_verification")).toBe(true);
    if (expected === "no") expect(result.feedback).toMatchObject({ code: "candidate.trial_judged_no", judge: { expected: "the hub in the cart", observed: "the cart is empty" } });
  });

  it("the port is bound to its candidate id, refuses mismatched bytes, and keeps every trial and its spend", async () => {
    const fixture = trialFixture(); pressing(fixture);
    const trials = automationStudioCandidateTrialPort("candidate.1", fixture.ports);
    expect(await trials.port({ ...fixture.request(), candidateId: "candidate.other" })).toMatchObject({ verdict: "execution_failed", feedback: { code: "candidate.trial_identity_mismatch" } });
    expect(await trials.port({ ...fixture.request(), digest: "b".repeat(64) })).toMatchObject({ verdict: "execution_failed", feedback: { code: "candidate.trial_identity_mismatch" } });
    expect(fixture.judged).toEqual([]);
    await trials.port(fixture.request());
    fixture.setVerdict({ verdict: "unknown", why: "unconfirmed", spent: { ...SPENT_TWO } });
    await trials.port(fixture.request());
    expect(trials.records().map((entry) => entry.verdict)).toEqual(["yes", "unsure"]);
    expect(trials.spent()).toEqual({ calls: 4, inputTokens: 800, outputTokens: 80, totalTokens: 880, estimatedCostUsd: 0.002 });
  });

  it("an unreadable result is not judged and never a yes", async () => {
    const fixture = trialFixture(); pressing(fixture);
    fixture.ports.recordSets = vi.fn(async () => { throw new TypeError("store closed"); });
    const { result } = await runAutomationStudioCandidateTrial(fixture.request(), fixture.ports);
    expect(result).toMatchObject({ verdict: "not_judged", feedback: { code: "candidate.trial_result_unreadable", failure: "TypeError" } });
    expect(fixture.judged).toEqual([]);
  });
});
