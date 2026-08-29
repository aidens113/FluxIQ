import { describe, expect, it } from "vitest";
import {
  latestProposalForRecordingId,
  resolveActionPreviewEntryId,
  resolveObservedStateEntryId,
  selectedNodeActionPreviewEntryId
} from "./timeline-resolution";

const recording = {
  timeline: [
    { id: "action.before", type: "action", timestamp: 100 },
    { id: "state.target", type: "state_checkpoint", timestamp: 120, stateSnapshotId: "snapshot.target" },
    { id: "action.after", type: "action", timestamp: 150 }
  ]
};

describe("timeline resolution", () => {
  it("resolves an action to the closest observed state and prefers the preceding candidate on ties", () => {
    expect(resolveObservedStateEntryId(recording, "action.before")).toBe("state.target");
    expect(resolveObservedStateEntryId(recording, "state.target")).toBe("state.target");
  });

  it("resolves state and selected-node metadata to the closest action preview", () => {
    expect(resolveActionPreviewEntryId(recording, "state.target")).toBe("action.before");
    expect(selectedNodeActionPreviewEntryId(recording, { metadata: { stateSnapshotId: "snapshot.target" } })).toBe("action.before");
  });

  it("selects the newest proposal associated with a recording", () => {
    expect(latestProposalForRecordingId("recording.one", [
      { proposalId: "old", recordingId: "recording.one", generatedAt: 10 }
    ], [
      { proposalId: "new", metadata: { recordingId: "recording.one" }, generatedAt: 20 }
    ])?.proposalId).toBe("new");
    expect(latestProposalForRecordingId(null, [], [])).toBeUndefined();
  });
});
