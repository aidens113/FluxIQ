import { describe, expect, it } from "vitest";
import { emptyPipelineIndex, type PipelineArtifactKind, type PipelineIndex } from "../../../pipeline-model.ts";
import { pipelineIndexWithoutRecording } from "../without-recording.ts";

function noArtifacts(): Record<PipelineArtifactKind, Set<string>> {
  const ids = {} as Record<PipelineArtifactKind, Set<string>>;
  for (const kind of Object.keys(emptyPipelineIndex()) as (keyof PipelineIndex)[]) if (kind !== "pipelines") ids[kind] = new Set();
  return ids;
}

describe("pipelineIndexWithoutRecording", () => {
  it("drops the recording's rows and keeps every other recording's", () => {
    const index: PipelineIndex = {
      ...emptyPipelineIndex(),
      pipelines: [{ pipelineId: "p1", recordingId: "r1", updatedAt: 1 }, { pipelineId: "p2", recordingId: "r2", updatedAt: 1 }],
      miningRuns: [{ miningRunId: "m1", generatedAt: 1, recordingId: "r1" }, { miningRunId: "m2", generatedAt: 1, recordingId: "r2" }],
      policyProposals: [{ proposalId: "pp1", generatedAt: 1, status: "proposed", recordingId: "r1" }, { proposalId: "pp2", generatedAt: 1, status: "proposed", recordingId: "r2" }]
    };
    const next = pipelineIndexWithoutRecording(index, "r1", noArtifacts());
    expect(next.pipelines.map((item) => item.pipelineId)).toEqual(["p2"]);
    expect(next.miningRuns.map((item) => item.miningRunId)).toEqual(["m2"]);
    expect(next.policyProposals.map((item) => item.proposalId)).toEqual(["pp2"]);
  });

  it("drops a row with no recording id when its artifact belongs to the recording", () => {
    const artifactIds = noArtifacts();
    artifactIds.replayResults.add("old");
    const index: Partial<PipelineIndex> = { replayResults: [{ replayId: "old", generatedAt: 1 }, { replayId: "other", generatedAt: 1 }] };
    const next = pipelineIndexWithoutRecording(index, "r1", artifactIds);
    expect(next.replayResults.map((item) => item.replayId)).toEqual(["other"]);
    expect(next).toEqual({ ...emptyPipelineIndex(), replayResults: [{ replayId: "other", generatedAt: 1 }] });
  });
});
