import { describe, expect, it } from "vitest";
import {
  addRecordingPipelineArtifactId,
  createRecordingPipelineDocument,
  emptyPipelineIndex,
  upsertPipelineIndex
} from "./pipeline-model.ts";

describe("Automation Studio pipeline model", () => {
  it("upserts artifact summaries newest-first without discarding other index sections", () => {
    const initial = {
      ...emptyPipelineIndex(),
      pipelines: [{ pipelineId: "pipeline.recording-1", recordingId: "recording-1", updatedAt: 10 }]
    };

    const withFirst = upsertPipelineIndex(initial, "miningRuns", "mining-1", 20, undefined, "recording-1");
    const withSecond = upsertPipelineIndex(withFirst, "miningRuns", "mining-2", 30, undefined, "recording-1");
    const updated = upsertPipelineIndex(withSecond, "miningRuns", "mining-1", 40, undefined, "recording-1");

    expect(updated.pipelines).toEqual(initial.pipelines);
    expect(updated.miningRuns.map((item) => item.miningRunId)).toEqual(["mining-1", "mining-2"]);
    expect(updated.miningRuns[0]?.generatedAt).toBe(40);
  });

  it("tracks artifact ids once and advances the pipeline lifecycle", () => {
    const pipeline = createRecordingPipelineDocument({ recordingId: "recording/1", taskId: "task.one", startedAt: 10 });
    const processing = addRecordingPipelineArtifactId(pipeline, "miningRuns", "mining-1");
    const duplicate = addRecordingPipelineArtifactId(processing, "miningRuns", "mining-1");
    const complete = addRecordingPipelineArtifactId(duplicate, "policyProposals", "proposal-1");
    const withFlowProposal = addRecordingPipelineArtifactId(complete, "recordingFlowProposals", "flow-proposal-1");

    expect(pipeline.pipelineId).toBe("pipeline.recording_1");
    expect(processing.status).toBe("processing");
    expect(duplicate.artifacts.miningRunIds).toEqual(["mining-1"]);
    expect(complete.status).toBe("complete");
    expect(complete.artifacts.policyProposalIds).toEqual(["proposal-1"]);
    expect(withFlowProposal.artifacts.recordingFlowProposalIds).toEqual(["flow-proposal-1"]);
    expect(upsertPipelineIndex(emptyPipelineIndex(), "recordingFlowProposals", "flow-proposal-1", 20, "invalidated", "recording/1").recordingFlowProposals[0]).toMatchObject({ proposalId: "flow-proposal-1", status: "invalidated" });
  });
});
