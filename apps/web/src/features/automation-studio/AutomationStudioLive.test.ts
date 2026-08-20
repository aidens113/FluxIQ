import { describe, expect, it } from "vitest";
import { latestProposalForRecordingId, resolveActionPreviewEntryId, resolveObservedStateEntryId, selectedNodeActionPreviewEntryId } from "./AutomationStudioLive";

describe("AutomationStudioLive state opening", () => {
  it("resolves action timeline entries to the exact action-adjacent state snapshot", () => {
    const recording = {
      timeline: [{
        id: "entry.state.first",
        type: "observation",
        observationType: "client.state_snapshot",
        timestamp: 100,
        payload: { metadata: { eventTimestampMs: 100 } }
      }, {
        id: "entry.action.target",
        type: "action",
        actionType: "web.dom.click",
        startedAt: 500,
        timestamp: 540
      }, {
        id: "entry.state.target",
        type: "observation",
        observationType: "client.state_snapshot",
        timestamp: 500,
        payload: { metadata: { eventTimestampMs: 500 } }
      }, {
        id: "entry.state.later",
        type: "observation",
        observationType: "client.state_snapshot",
        timestamp: 900,
        payload: { metadata: { eventTimestampMs: 900 } }
      }]
    };

    expect(resolveObservedStateEntryId(recording, "entry.action.target")).toBe("entry.state.target");
  });

  it("resolves state timeline entries to themselves", () => {
    const recording = {
      timeline: [{
        id: "entry.state.target",
        type: "observation",
        observationType: "client.state_snapshot",
        timestamp: 500
      }]
    };

    expect(resolveObservedStateEntryId(recording, "entry.state.target")).toBe("entry.state.target");
  });

  it("resolves state snapshot entries to the corresponding action preview entry", () => {
    const recording = {
      timeline: [{
        id: "entry.action.target",
        type: "action",
        startedAt: 500,
        timestamp: 500
      }, {
        id: "entry.state.target",
        type: "observation",
        observationType: "client.state_snapshot",
        timestamp: 510,
        payload: { metadata: { eventTimestampMs: 510 } }
      }]
    };

    expect(resolveActionPreviewEntryId(recording, "entry.state.target")).toBe("entry.action.target");
  });

  it("keeps action entries as action preview entries", () => {
    const recording = {
      timeline: [{ id: "entry.action.target", type: "domain_event", timestamp: 500 }]
    };

    expect(resolveActionPreviewEntryId(recording, "entry.action.target")).toBe("entry.action.target");
  });

  it("resolves selected proposal and flow nodes to the matching action preview entry", () => {
    const recording = {
      timeline: [{
        id: "entry.action.target",
        type: "action",
        timestamp: 500
      }, {
        id: "entry.state.target",
        type: "observation",
        observationType: "client.state_snapshot",
        timestamp: 510,
        payload: { snapshotId: "snapshot.target", metadata: { actionEntryId: "entry.action.target" } }
      }]
    };

    expect(selectedNodeActionPreviewEntryId(recording, { id: "node.proposal", metadata: { timelineEntryId: "entry.state.target" } })).toBe("entry.action.target");
    expect(selectedNodeActionPreviewEntryId(recording, { id: "node.flow", metadata: { stateSnapshotId: "snapshot.target" } })).toBe("entry.action.target");
  });

  it("keeps proposal context recoverable from a source recording after timeline or state selection", () => {
    const proposal = latestProposalForRecordingId("recording.web", [{
      proposalId: "proposal.old",
      generatedAt: 100,
      metadata: { recordingId: "recording.web" }
    }, {
      proposalId: "proposal.current",
      generatedAt: 200,
      metadata: { recordingId: "recording.web" }
    }], [{
      proposalId: "proposal.other",
      recordingId: "recording.other",
      generatedAt: 300
    }]);

    expect(proposal?.proposalId).toBe("proposal.current");
  });
});
