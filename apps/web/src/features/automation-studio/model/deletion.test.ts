import { describe, expect, it } from "vitest";
import { removeDeletedRecordingArtifacts, removeDeletedRecordingSnapshotData, selectionReferencesDeletedRecording } from "./deletion";

describe("Automation Studio deletion cleanup", () => {
  it("detects selections related to deleted recordings and proposals", () => {
    const recordingIds = new Set(["recording.one"]);
    const proposalIds = new Set(["proposal.one"]);

    expect(selectionReferencesDeletedRecording({ kind: "recording", id: "recording.one" }, recordingIds, proposalIds)).toBe(true);
    expect(selectionReferencesDeletedRecording({ kind: "state", id: "state:proposal.one", proposalId: "proposal.one" }, recordingIds, proposalIds)).toBe(true);
    expect(selectionReferencesDeletedRecording({ kind: "state", id: "state:recording.one", sourceId: "observed:recording.one:entry.1" }, recordingIds, proposalIds)).toBe(true);
    expect(selectionReferencesDeletedRecording({ kind: "recording", id: "recording.two" }, recordingIds, proposalIds)).toBe(false);
  });

  it("removes deleted recording artifacts and related proposals", () => {
    const cleaned = removeDeletedRecordingArtifacts({
      normalizationReviews: [{ recordingId: "recording.one" }, { recordingId: "recording.two" }],
      miningRuns: [{ recordingId: "recording.one" }],
      policyProposals: [{ proposalId: "proposal.one", metadata: { recordingId: "recording.one" } }, { proposalId: "proposal.two", metadata: { recordingId: "recording.two" } }],
      recordingFlowProposals: [{ proposalId: "proposal.flow", recordingId: "recording.one" }]
    }, new Set(["recording.one"]), new Set(["proposal.one", "proposal.flow"]));

    expect(cleaned.normalizationReviews).toEqual([{ recordingId: "recording.two" }]);
    expect(cleaned.miningRuns).toEqual([]);
    expect(cleaned.policyProposals).toEqual([{ proposalId: "proposal.two", metadata: { recordingId: "recording.two" } }]);
    expect(cleaned.recordingFlowProposals).toEqual([]);
  });

  it("removes deleted recordings from canonical snapshot data", () => {
    const cleaned = removeDeletedRecordingSnapshotData({
      payload: {
        canonical: {
          recordingSessions: [{ recordingId: "recording.one" }, { recordingId: "recording.two" }],
          normalizedTimelines: [{ recordingId: "recording.one" }, { recordingId: "recording.two" }],
          policyProposals: [{ proposalId: "proposal.one", metadata: { recordingId: "recording.one" } }]
        }
      }
    }, new Set(["recording.one"]), new Set(["proposal.one"]));

    expect(cleaned.payload.canonical.recordingSessions).toEqual([{ recordingId: "recording.two" }]);
    expect(cleaned.payload.canonical.normalizedTimelines).toEqual([{ recordingId: "recording.two" }]);
    expect(cleaned.payload.canonical.policyProposals).toEqual([]);
  });
});
