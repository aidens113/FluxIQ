import { describe, expect, it } from "vitest";
import { proposalNodeStateRequest } from "./ProposalView";

describe("AutomationProposalView state linking", () => {
  it("opens proposal node state at the node's source recording entry", () => {
    const request = proposalNodeStateRequest({
      node: {
        id: "recorded.candidate-one",
        data: {
          label: "Click submit",
          description: "Click submit",
          actionTypes: ["web.dom.click"],
          recovery: "pause",
          evidenceCount: 1,
          readinessCount: 0,
          successCount: 0,
          inputs: [],
          outputs: [],
          parameters: [],
          parameterValues: {},
          isStart: true,
          metadata: {
            sourceObservationIds: ["entry.action.submit"],
            recordingId: "recording.web"
          }
        },
        position: { x: 0, y: 0 }
      } as any,
      proposal: { proposalId: "proposal.web", recordingId: "recording.web" },
      recording: { recordingId: "recording.web" },
      phase: "input"
    });

    expect(request).toEqual({
      nodeId: "recorded.candidate-one",
      proposalId: "proposal.web",
      timelineEntryId: "entry.action.submit",
      sourceId: "observed:recording.web:entry.action.submit",
      phase: "input"
    });
  });

  it("falls back to metadata evidence entry IDs when sourceObservationIds are absent", () => {
    const request = proposalNodeStateRequest({
      node: {
        id: "recorded.candidate-two",
        data: {
          label: "Click cancel",
          description: "Click cancel",
          actionTypes: ["web.dom.click"],
          recovery: "pause",
          evidenceCount: 1,
          readinessCount: 0,
          successCount: 0,
          inputs: [],
          outputs: [],
          parameters: [],
          parameterValues: {},
          isStart: false,
          metadata: {
            evidence: [{ layer: "recording", entryId: "entry.action.cancel" }]
          }
        },
        position: { x: 0, y: 0 }
      } as any,
      proposal: { proposalId: "proposal.web", metadata: { recordingId: "recording.web" } }
    });

    expect(request.timelineEntryId).toBe("entry.action.cancel");
    expect(request.sourceId).toBe("observed:recording.web:entry.action.cancel");
  });
});
