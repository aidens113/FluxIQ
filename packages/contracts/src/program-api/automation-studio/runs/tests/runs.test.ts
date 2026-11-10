// The runs inputs: each accepts the request its handler reads, with a plain refusal otherwise.
import { describe, expect, it } from "vitest";
import * as inputs from "../index.ts";

describe("runs inputs", () => {
  it("accept the minimal request of each endpoint", () => {
    const p = { projectId: "p" };
    const run = { ...p, runId: "r" };
    const examples: Array<[{ parse(payload: unknown): unknown }, Record<string, unknown>]> = [
      [inputs.listFlowRunsInput, p], [inputs.getFlowRunDetailInput, run], [inputs.exportFlowRunAuditInput, run],
      [inputs.getFlowSpendInput, { ...p, flowId: "f" }], [inputs.listFlowRunActionsInput, run],
      [inputs.getFlowRunActionDetailInput, { ...run, attemptId: "a" }], [inputs.listFlowRunEventsInput, run],
      [inputs.getFlowRunEventDetailInput, { ...run, sequence: 3 }],
      [inputs.listFlowAdaptationsInput, p], [inputs.getFlowAdaptationInput, { ...p, flowId: "f", adaptationId: "x" }],
      [inputs.reviewFlowAdaptationInput, { ...p, flowId: "f", adaptationId: "x", action: "approve" }],
      [inputs.startRuntimeSessionInput, { ...p, flowId: "f" }], [inputs.runRuntimeSessionInput, { ...p, flowId: "f", inputs: { q: 1 } }],
      [inputs.cancelRuntimeSessionInput, run], [inputs.pauseRuntimeSessionInput, run], [inputs.resumeRuntimeSessionInput, run],
      [inputs.getRuntimeRunControlInput, run], [inputs.listRuntimeSessionsInput, { ...p, statuses: ["running"] }], [inputs.getRuntimeSessionInput, run],
      [inputs.listRunDatasetsInput, run], [inputs.getRunDatasetPageInput, { ...run, datasetId: "d", limit: 20 }],
      [inputs.exportRunDatasetInput, { ...run, datasetId: "d", format: "csv" }], [inputs.deleteRunDatasetsInput, run],
      [inputs.listProjectDatasetsInput, p], [inputs.listDatasetRunsInput, { ...p, flowId: "f", datasetId: "d" }],
      [inputs.getActivityInput, p],
      [inputs.getTaskAttemptInput, { ...p, attemptId: "a" }], [inputs.listConversationTaskAttemptsInput, { ...p, conversationId: "c" }],
      [inputs.carryOnTaskAttemptInput, { ...p, attemptId: "a", addUsd: 0 }], [inputs.runTaskAgainInput, { ...p, taskId: "t" }],
      [inputs.listProjectTasksInput, p], [inputs.renameTaskInput, { ...p, taskId: "t", title: "Weekly report" }], [inputs.removeTaskInput, { ...p, taskId: "t" }]
    ];
    for (const [input, example] of examples) expect(() => input.parse(example)).not.toThrow();
  });

  it("refuse a missing id, a wrong choice and a negative amount with the field named", () => {
    expect(inputs.getFlowRunDetailInput.read({ projectId: "p" })).toEqual({ ok: false, error: expect.stringContaining("runId") });
    expect(inputs.exportRunDatasetInput.read({ projectId: "p", runId: "r", datasetId: "d", format: "xml" }).ok).toBe(false);
    expect(inputs.carryOnTaskAttemptInput.read({ projectId: "p", attemptId: "a", addUsd: -1 }).ok).toBe(false);
    expect(inputs.reviewFlowAdaptationInput.read({ projectId: "p", flowId: "f", adaptationId: "x", action: "explode" }).ok).toBe(false);
  });
});
